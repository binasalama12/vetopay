import readline from 'node:readline';

/**
 * Human approval channel for HELD calls.
 * The default approver asks on the CLI; tests use createFixedApprover.
 */
export function createCliApprover() {
  return async ({ call, decision, facts }) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const summary =
      `\n*** HUMAN APPROVAL REQUIRED ***\n` +
      `  Tool:      ${call.tool}\n` +
      `  Amount:    ${facts?.amount != null ? '$' + facts.amount.toFixed(2) : '(unverified)'}\n` +
      `  Recipient: ${(facts?.recipients || []).join(', ') || '(none resolved)'}\n` +
      `  Why held:  ${decision.reasons.join('; ')}\n`;
    const answer = await new Promise(resolve =>
      rl.question(summary + '  Approve this payment? [y/N] ', resolve));
    rl.close();
    return /^y(es)?$/i.test(String(answer).trim());
  };
}

export function createFixedApprover(answer) {
  return async () => answer;
}
