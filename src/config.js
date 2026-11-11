import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader (no dependencies). Real env vars win over .env. */
export function loadEnv() {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

export function getConfig() {
  loadEnv();
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  const requested = (process.env.VETOPAY_MODE || '').toLowerCase();
  // Default: real mode only when sandbox credentials are actually present.
  const mode = requested === 'real' || requested === 'mock'
    ? requested
    : (clientId && clientSecret ? 'real' : 'mock');
  return {
    mode,
    clientId,
    clientSecret,
    apiBase: process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
    autoApproveLimit: Number(process.env.VETOPAY_AUTO_APPROVE_LIMIT || 100),
    knownRecipients: (process.env.VETOPAY_KNOWN_RECIPIENTS ||
      'test-buyer@example.com,vendor@acme-supplies.example')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    auditLogPath: process.env.VETOPAY_AUDIT_LOG || join(root, 'logs', 'audit.jsonl'),
  };
}
