import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatApprovalPrompt, parseApprovalAnswer, toolLabel, createCliApprover } from '../src/approve-cli.js';
import { AuditLog } from '../src/audit.js';
import { VetoEngine } from '../src/veto.js';
import { AgentHarness } from '../src/agent.js';
import { MockPayPalTransport } from '../src/transport/mock.js';

const heldCtx = {
  call: { tool: 'create_order', args: { currencyCode: 'USD' } },
  decision: { decision: 'HELD', reasons: [
    'amount $750.00 exceeds the auto-approve limit of $100.00',
    'recipient is new/unknown (stranger@example.net)',
  ] },
  facts: { kind: 'payment', amount: 750, currency: 'USD', recipients: ['stranger@example.net'] },
  source: 'user',
  instruction: 'Pay the new supplier $750 for tooling.',
  auditEntry: { ts: '2026-11-11T02:00:00.000Z', event: 'held_for_approval', tool: 'create_order' },
  auditPath: 'logs/audit-scenario3.jsonl',
};

test('approval prompt shows call, amount, recipient, provenance, reasons and audit entry', () => {
  const text = formatApprovalPrompt(heldCtx);
  assert.match(text, /HUMAN APPROVAL REQUIRED/);
  assert.match(text, /create_order/);
  assert.match(text, /Create payment order/);
  assert.match(text, /Kind:\s+payment/);
  assert.match(text, /\$750\.00/);
  assert.match(text, /stranger@example\.net/);
  assert.match(text, /Source:\s+user \(trusted source\)/);
  assert.match(text, /Pay the new supplier \$750/);
  assert.match(text, /1\. amount \$750\.00 exceeds the auto-approve limit/);
  assert.match(text, /2\. recipient is new\/unknown/);
  assert.match(text, /2026-11-11T02:00:00\.000Z · held_for_approval/);
  assert.match(text, /logs\/audit-scenario3\.jsonl/);
  assert.match(text, /Declining executes nothing/);
});

test('approval prompt flags untrusted provenance and unverified amount', () => {
  const text = formatApprovalPrompt({
    call: { tool: 'create_refund', args: {} },
    decision: { decision: 'HELD', reasons: ['refunds are money-outflow: human approval always required'] },
    facts: { kind: 'refund', amount: null, currency: 'USD', recipients: [] },
    source: 'email',
  });
  assert.match(text, /Refund \(money leaves the account/);
  assert.match(text, /UNVERIFIED/);
  assert.match(text, /none resolved/);
  assert.match(text, /email \(UNTRUSTED source/);
});

test('toolLabel falls back to the raw tool name for unknown tools', () => {
  assert.equal(toolLabel('pay_order'), 'Pay / capture order (money leaves the account)');
  assert.equal(toolLabel('some_future_tool'), 'some_future_tool');
});

test('parseApprovalAnswer is fail-closed: only explicit affirmatives approve', () => {
  for (const yes of ['approve', 'APPROVE', ' Approve ', 'y', 'Y', 'yes', 'a']) {
    assert.equal(parseApprovalAnswer(yes), true, JSON.stringify(yes));
  }
  for (const no of ['', 'decline', 'n', 'no', 'd', 'approve!', 'ok', 'sure', null, undefined]) {
    assert.equal(parseApprovalAnswer(no), false, JSON.stringify(no));
  }
});

test('CLI approver: typing "decline" declines, "approve" approves', async () => {
  const silent = new Writable({ write(_c, _e, cb) { cb(); } });
  const declining = createCliApprover({ input: Readable.from(['decline\n']), output: silent });
  assert.equal(await declining(heldCtx), false);
  const approving = createCliApprover({ input: Readable.from(['approve\n']), output: silent });
  assert.equal(await approving(heldCtx), true);
  // Piped legacy input ("y", as used by scripts/run-scenarios.sh) still approves.
  const legacy = createCliApprover({ input: Readable.from(['y\n']), output: silent });
  assert.equal(await legacy(heldCtx), true);
  // EOF with no answer declines.
  const eof = createCliApprover({ input: Readable.from([]), output: silent });
  assert.equal(await eof(heldCtx), false);
});

test('decline path: a HELD call declined at the prompt executes nothing and is audited', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vetopay-blok3-'));
  const auditPath = join(dir, 'audit.jsonl');
  const transport = new MockPayPalTransport();
  const veto = new VetoEngine({ autoApproveLimit: 100, knownRecipients: ['vendor@acme-supplies.example'] });
  let promptCtx = null;
  const approver = createCliApprover({
    input: Readable.from(['decline\n']),
    output: new Writable({ write(_c, _e, cb) { cb(); } }),
  });
  const capturingApprover = async (ctx) => { promptCtx = ctx; return approver(ctx); };
  const harness = new AgentHarness({ transport, veto, audit: new AuditLog(auditPath),
    approver: capturingApprover, log: () => {} });
  const [r] = await harness.executeTask({ source: 'user', instruction: 'Pay Acme $750.',
    calls: [{ tool: 'create_order', args: { currencyCode: 'USD', recipients: ['vendor@acme-supplies.example'],
      items: [{ name: 'Contract', quantity: 1, itemCost: 750, itemTotal: 750 }] } }] });
  assert.equal(r.decision.decision, 'HELD');
  assert.equal(r.executed, false);
  assert.equal(transport.orders.size, 0);
  // The prompt received the full Blok 3 context from the harness.
  assert.equal(promptCtx.source, 'user');
  assert.equal(promptCtx.auditPath, auditPath);
  assert.equal(promptCtx.auditEntry.event, 'held_for_approval');
  const log = readFileSync(auditPath, 'utf8');
  assert.match(log, /"event":"human_declined"/);
  assert.doesNotMatch(log, /"event":"tool_executed"/);
});
