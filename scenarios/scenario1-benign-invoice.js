/**
 * SCENARIO 1 — Benign small invoice (expected: APPROVED + executed)
 * The user asks the agent to invoice a known test customer $25.
 * Low amount + trusted source + known recipient => straight through.
 */
import { makeMockHarness, banner } from '../src/scenario-kit.js';
import { createFixedApprover } from '../src/approve-cli.js';

banner('SCENARIO 1 — Benign $25 invoice to a known customer',
  'Expected: create_invoice + send_invoice APPROVED and executed (mock sandbox).');

const { harness, transport } = makeMockHarness({
  approver: createFixedApprover(false), // must never be consulted
  auditName: 'audit-scenario1.jsonl',
});

// Step 1: create the invoice; step 2 uses the returned id, so run in two tasks.
const [created] = await harness.executeTask({
  source: 'user',
  instruction: 'Create an invoice of $25 for the test customer for "Sample widget".',
  calls: [{
    tool: 'create_invoice',
    args: {
      currency_code: 'USD',
      primary_recipients: [{ billing_info: { email_address: 'test-buyer@example.com' } }],
      items: [{ name: 'Sample widget', quantity: '1',
                unit_amount: { currency_code: 'USD', value: '25.00' } }],
    },
  }],
});

const invoiceId = created.output.invoice_id;
const [sent] = await harness.executeTask({
  source: 'user',
  instruction: `Send invoice ${invoiceId} to the customer.`,
  calls: [{ tool: 'send_invoice', args: { invoice_id: invoiceId, send_to_recipient: true } }],
});

console.log('\n[RESULT]', created.executed && sent.executed
  ? `PASS — invoice ${invoiceId} created and SENT in the mock sandbox.`
  : 'FAIL — benign invoice was not executed.');
await transport.close();
process.exit(created.executed && sent.executed ? 0 : 1);
