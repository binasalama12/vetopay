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

export const INVOICING_SCOPE = 'https://uri.paypal.com/services/invoicing';

/**
 * Scopes requested explicitly at the OAuth exchange. A plain
 * client_credentials request does NOT return the invoicing scope for
 * the "VetoPay" sandbox app even with the Invoicing feature enabled
 * on the app (verified live 11 Nov 2026: default token carries
 * payments/orders/refund/subscriptions/disputes only), while asking
 * for the scope explicitly returns it. Every entry below was
 * observed in this app's granted scope list (default token) or, for
 * invoicing, in an explicit-scope token response.
 */
export const DEFAULT_OAUTH_SCOPES = [
  INVOICING_SCOPE,
  'https://uri.paypal.com/services/payments/realtimepayment',
  'https://uri.paypal.com/services/payments/payment/authcapture',
  'https://uri.paypal.com/services/payments/refund',
  'https://uri.paypal.com/services/subscriptions',
  'https://uri.paypal.com/services/disputes/read-buyer',
  'https://uri.paypal.com/services/disputes/read-seller',
  'https://uri.paypal.com/services/billing-agreements',
  'https://uri.paypal.com/services/checkout/payment-resources',
  'https://uri.paypal.com/payments/payouts',
  'openid',
];

/** Parse a VETOPAY_OAUTH_SCOPES value (comma- and/or space-separated).
 *  Empty/unset falls back to DEFAULT_OAUTH_SCOPES. */
export function resolveOAuthScopes(raw) {
  const parsed = String(raw ?? '')
    .split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  return parsed.length ? parsed : [...DEFAULT_OAUTH_SCOPES];
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
    oauthScopes: resolveOAuthScopes(process.env.VETOPAY_OAUTH_SCOPES),
    autoApproveLimit: Number(process.env.VETOPAY_AUTO_APPROVE_LIMIT || 100),
    knownRecipients: (process.env.VETOPAY_KNOWN_RECIPIENTS ||
      'test-buyer@example.com,vendor@acme-supplies.example')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    auditLogPath: process.env.VETOPAY_AUDIT_LOG || join(root, 'logs', 'audit.jsonl'),
  };
}
