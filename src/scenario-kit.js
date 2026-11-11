import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { AuditLog } from './audit.js';
import { VetoEngine } from './veto.js';
import { AgentHarness } from './agent.js';
import { MockPayPalTransport } from './transport/mock.js';
import { createRealTransport } from './transport/mcp.js';

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

/**
 * Real-mode harness for one scenario run: official @paypal/mcp server
 * in SANDBOX mode via createRealTransport (OAuth exchange first).
 * Aborts loudly when the config is not real — these runners must never
 * silently fall back to the mock transport.
 */
export async function makeRealHarness({ approver, auditName }) {
  const config = getConfig();
  if (config.mode !== 'real' || !config.clientId || !config.clientSecret) {
    throw new Error('makeRealHarness: config is not real mode with sandbox credentials present — refusing to run (no mock fallback).');
  }
  const transport = await createRealTransport(config);
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
