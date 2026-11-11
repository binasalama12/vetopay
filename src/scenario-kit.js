import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { AuditLog } from './audit.js';
import { VetoEngine } from './veto.js';
import { AgentHarness } from './agent.js';
import { MockPayPalTransport } from './transport/mock.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Fresh mock-mode harness for one scenario run (deterministic state). */
export function makeMockHarness({ approver, auditName }) {
  const config = getConfig();
  const transport = new MockPayPalTransport();
  const veto = new VetoEngine({
    autoApproveLimit: config.autoApproveLimit,
    knownRecipients: config.knownRecipients,
  });
  const audit = new AuditLog(join(root, 'logs', auditName));
  const harness = new AgentHarness({ transport, veto, audit, approver });
  return { harness, transport, audit, config };
}

export function banner(title, blurb) {
  console.log('='.repeat(72));
  console.log(title);
  console.log(blurb);
  console.log('='.repeat(72));
}
