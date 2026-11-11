import readline from 'node:readline';

/**
 * Human approval channel for HELD calls (Blok 3 polish).
 *
 * The prompt is deliberately explicit and fail-closed:
 *  - it shows WHAT would run (tool + kind), HOW MUCH, to WHOM,
 *    WHO/WHAT ordered it (provenance), WHY it was held, and WHICH
 *    audit entries were already written for this decision;
 *  - only an explicit affirmative approves — Enter, "decline", "no",
 *    or any unrecognised answer declines, and a decline executes
 *    nothing (enforced by AgentHarness, covered by e2e tests).
 *
 * The formatting/parsing helpers are pure and exported so they can be
 * unit-tested without a TTY. createFixedApprover is unchanged for tests.
 */

const TRUSTED_SOURCES = new Set(['user', 'cli', 'system']);

/** Human-readable label per tool — what the call actually does. */
const TOOL_LABELS = {
  create_invoice: 'Create invoice (asks a recipient to pay)',
  send_invoice: 'Send invoice (delivers a payment request)',
  send_invoice_reminder: 'Send invoice reminder',
  cancel_sent_invoice: 'Cancel a sent invoice',
  create_order: 'Create payment order (commits to a payment)',
  pay_order: 'Pay / capture order (money leaves the account)',
  create_refund: 'Refund (money leaves the account, back to a capture)',
  accept_dispute_claim: 'Accept dispute claim (money leaves the account)',
  create_subscription: 'Create subscription (recurring payments)',
  cancel_subscription: 'Cancel subscription',
  create_subscription_plan: 'Create subscription plan',
  create_product: 'Create product',
  update_product: 'Update product',
};

export function toolLabel(tool) {
  return TOOL_LABELS[tool] || tool;
}

function formatAmount(facts) {
  if (facts?.amount == null) return 'UNVERIFIED — could not be resolved from the referenced object';
  const currency = facts.currency || 'USD';
  return currency === 'USD'
    ? `$${facts.amount.toFixed(2)}`
    : `${currency} ${facts.amount.toFixed(2)}`;
}

function truncate(text, max = 140) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

/**
 * Build the approval prompt text for one HELD call.
 * @param {object} ctx
 * @param {{tool:string, args?:object}} ctx.call
 * @param {{decision:string, reasons:string[]}} ctx.decision
 * @param {object} [ctx.facts]        extracted facts from the veto layer
 * @param {string} [ctx.source]       instruction provenance (user/email/…)
 * @param {string} [ctx.instruction]  the instruction text behind the call
 * @param {object} [ctx.auditEntry]   audit entry already written for this hold
 * @param {string} [ctx.auditPath]    path of the append-only audit log
 * @returns {string}
 */
export function formatApprovalPrompt({ call, decision, facts, source, instruction, auditEntry, auditPath } = {}) {
  const tool = call?.tool || '(unknown tool)';
  const recipients = facts?.recipients?.length
    ? facts.recipients.join(', ')
    : '(none resolved — check the recipient before approving)';
  const provenance = source
    ? `${source}${TRUSTED_SOURCES.has(source) ? ' (trusted source)' : ' (UNTRUSTED source — content, not the owner)'}`
    : '(not recorded)';
  const reasons = (decision?.reasons?.length ? decision.reasons : ['no reason recorded'])
    .map((r, i) => `    ${i + 1}. ${r}`).join('\n');
  const auditLine = auditEntry
    ? `${auditEntry.ts || '(no timestamp)'} · ${auditEntry.event || 'veto_decision'} · tool=${auditEntry.tool || tool} · decision=${decision?.decision || auditEntry.decision || 'HELD'}`
    : 'veto decision recorded in the audit log before this prompt';
  const lines = [
    '',
    '='.repeat(72),
    '  VetoPay — HUMAN APPROVAL REQUIRED  ·  this call is HELD',
    '='.repeat(72),
    `  Call:       ${tool} — ${toolLabel(tool)}`,
    `  Kind:       ${facts?.kind || '(unknown)'}`,
    `  Amount:     ${formatAmount(facts)}`,
    `  Recipient:  ${recipients}`,
    `  Source:     ${provenance}`,
  ];
  if (instruction) lines.push(`  Ordered as: "${truncate(instruction)}"`);
  lines.push(
    '  Why HELD:',
    reasons,
    `  Audit log:  ${auditLine}`,
  );
  if (auditPath) lines.push(`  Audit file: ${auditPath} (append-only; your decision is logged next)`);
  lines.push(
    '-'.repeat(72),
    '  Approving EXECUTES this call immediately. Declining executes nothing.',
    '  Type "approve" (or "y") to execute — anything else declines. [default: decline]',
  );
  return lines.join('\n') + '\n';
}

/**
 * Parse a human answer. Fail-closed: only an explicit affirmative
 * ("approve", "a", "y", "yes") approves; everything else — including
 * empty input / EOF, "decline", "no", or a typo — declines.
 */
export function parseApprovalAnswer(answer) {
  return /^(approve|a|y|yes)$/i.test(String(answer ?? '').trim());
}

export function createCliApprover({ input = process.stdin, output = process.stdout } = {}) {
  return async (ctx) => {
    const rl = readline.createInterface({ input, output });
    try {
      const prompt = formatApprovalPrompt(ctx) + '  Decision [approve/decline]: ';
      const answer = await new Promise(resolve => {
        // EOF (piped input exhausted) resolves as '' -> decline.
        rl.once('close', () => resolve(''));
        rl.question(prompt, resolve);
      });
      return parseApprovalAnswer(answer);
    } finally {
      rl.close();
    }
  };
}

export function createFixedApprover(answer) {
  return async () => answer;
}
