/**
 * SCENARIO 1 — REAL MODE (PayPal sandbox, official @paypal/mcp server)
 * Same flow as scenario1-benign-invoice.js, but through the REAL
 * transport: create_invoice $25 to a known test customer (trusted,
 * expect APPROVED), then send_invoice for the returned real invoice id.
 *
 * Known limitation, expected here: the real transport is stateless for
 * us, so its lookup() returns null and the veto layer cannot resolve
 * the send_invoice amount locally -> the follow-up call is HELD. A
 * fixed approver approves it (and says so in the output) — the human
 * channel is exercised, just scripted, exactly like the mock demo's
 * piped "y". No mock fallback: if the real tool call fails, this
 * script reports the failure and exits non-zero.
 */
import { makeRealHarness, banner } from '../src/scenario-kit.js';

banner('SCENARIO 1 (REAL) — Benign $25 invoice to a known customer, PayPal SANDBOX',
  'Expected: create_invoice APPROVED + executed against the real sandbox; send_invoice HELD (amount unresolvable locally) -> fixed approver approves -> executed.');

/** Approver for HELD follow-ups: approves, and logs that it did. */
const realApprover = async ({ call }) => {
  console.log(`  [APPROVER] fixed approver consulted for HELD ${call.tool} — APPROVING (real-mode runner: follow-up amounts cannot be resolved locally, see header)`);
  return true;
};

/** Pull the real invoice id out of whatever shape the server returns. */
function extractInvoiceId(output) {
  if (!output || typeof output !== 'object') return null;
  const direct = output.invoice_id || output.id || output.invoice?.id || output.result?.id;
  if (typeof direct === 'string' && direct) return direct;
  const m = JSON.stringify(output).match(/INV2-[A-Za-z0-9-]+/);
  return m ? m[0] : null;
}

function extractStatus(output) {
  if (!output || typeof output !== 'object') return null;
  if (typeof output.status === 'string') return output.status;
  const m = JSON.stringify(output).match(/"status"\s*:\s*"([A-Za-z_]+)"/);
  return m ? m[1] : null;
}

function looksLikeError(output) {
  if (!output || typeof output !== 'object') return false;
  if (output.ok === false) return true; // @paypal/mcp error envelope: {ok:false,status,code,message}
  if (output.isError) return true;
  if (typeof output.raw === 'string' && output.raw && /error/i.test(output.raw)) return true;
  return false;
}

let harness, transport;
try {
  ({ harness, transport } = await makeRealHarness({
    approver: realApprover,
    auditName: 'audit-scenario1-real.jsonl',
  }));
} catch (err) {
  console.error(`[RESULT] FAIL — could not build the real harness: ${err.message}`);
  process.exit(2);
}

try {
  // Step 1: create the invoice (same argument shape as the mock run —
  // verified identical to the real server's create_invoice schema).
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

  if (!created.executed) {
    console.log('\n[RESULT] FAIL — create_invoice was not executed ' +
      `(veto decision: ${created.decision.decision}). No real invoice exists.`);
    process.exit(1);
  }
  if (looksLikeError(created.output)) {
    console.log('\n[RESULT] FAIL — the real sandbox returned an error for create_invoice: ' +
      JSON.stringify(created.output));
    process.exit(1);
  }

  const invoiceId = extractInvoiceId(created.output);
  if (!invoiceId) {
    console.log('\n[RESULT] FAIL — create_invoice executed but no invoice id could be ' +
      `extracted from the real response: ${JSON.stringify(created.output)}`);
    process.exit(1);
  }
  console.log(`\n[REAL] invoice created in the PayPal sandbox: id=${invoiceId} ` +
    `status=${extractStatus(created.output) || '(not reported by create response)'}`);

  // Step 2: send it. HELD is expected (see header); the fixed approver
  // above approves, and the harness logs that path.
  const [sent] = await harness.executeTask({
    source: 'user',
    instruction: `Send invoice ${invoiceId} to the customer.`,
    calls: [{ tool: 'send_invoice', args: { invoice_id: invoiceId, send_to_recipient: true } }],
  });

  if (!sent.executed) {
    console.log('\n[RESULT] FAIL — send_invoice was not executed ' +
      `(veto decision: ${sent.decision.decision}). Invoice ${invoiceId} exists but was not sent.`);
    process.exit(1);
  }
  if (looksLikeError(sent.output)) {
    console.log('\n[RESULT] FAIL — the real sandbox returned an error for send_invoice: ' +
      JSON.stringify(sent.output) + ` (invoice ${invoiceId} was created but not sent)`);
    process.exit(1);
  }
  console.log(`[REAL] send_invoice executed for ${invoiceId}; sandbox response: ${JSON.stringify(sent.output)}`);

  // Step 3 (verification, read-only): fetch the invoice back through
  // the veto layer and report the status the sandbox actually holds.
  const [fetched] = await harness.executeTask({
    source: 'user',
    instruction: `Verify the status of invoice ${invoiceId}.`,
    calls: [{ tool: 'get_invoice', args: { invoice_id: invoiceId } }],
  });
  const finalStatus = fetched.executed ? extractStatus(fetched.output) : null;
  console.log(`[REAL] get_invoice verification: executed=${fetched.executed} status=${finalStatus || '(unparsed — see EXECUTED line above)'}`);

  console.log('\n[RESULT]', fetched.executed
    ? `PASS — real sandbox invoice ${invoiceId} created and SENT (final status per get_invoice: ${finalStatus || 'unparsed'}).`
    : `PARTIAL — real sandbox invoice ${invoiceId} created and send_invoice executed, but the get_invoice verification did not execute.`);
  process.exit(fetched.executed ? 0 : 1);
} catch (err) {
  console.log(`\n[RESULT] FAIL — the real sandbox call threw: ${err.message}`);
  process.exit(1);
} finally {
  await transport.close();
}
