import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAccessToken, fetchAccessTokenWithScopes } from '../src/transport/mcp.js';
import { DEFAULT_OAUTH_SCOPES, INVOICING_SCOPE, resolveOAuthScopes, getConfig } from '../src/config.js';

const CREDS = { clientId: 'cid', clientSecret: 'secret', apiBase: 'https://api-m.sandbox.paypal.com' };

/** Stub global fetch; returns the captured request for assertions. */
function stubFetch({ ok = true, status = 200, payload } = {}) {
  const original = globalThis.fetch;
  const captured = {};
  globalThis.fetch = async (url, opts) => {
    captured.url = url; captured.opts = opts;
    return { ok, status, json: async () => payload };
  };
  return { captured, restore: () => { globalThis.fetch = original; } };
}

test('oauth: explicit scopes are sent space-joined and granted scopes parsed', async () => {
  const { captured, restore } = stubFetch({
    payload: { access_token: 'tok123', scope: `${INVOICING_SCOPE} openid` },
  });
  try {
    const scopes = [INVOICING_SCOPE, 'https://uri.paypal.com/services/payments/refund'];
    const out = await fetchAccessTokenWithScopes({ ...CREDS, scopes });
    assert.equal(captured.url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
    assert.equal(captured.opts.method, 'POST');
    const sent = new URLSearchParams(String(captured.opts.body));
    assert.equal(sent.get('grant_type'), 'client_credentials');
    assert.equal(sent.get('scope'), scopes.join(' '));
    assert.equal(out.accessToken, 'tok123');
    assert.deepEqual(out.requestedScopes, scopes);
    assert.deepEqual(out.grantedScopes, [INVOICING_SCOPE, 'openid']);
    // credentials travel in the Authorization header only, never the body
    assert.match(captured.opts.headers.Authorization, /^Basic /);
    assert.equal(String(captured.opts.body).includes('secret'), false);
  } finally { restore(); }
});

test('oauth: no scopes requested -> no scope field in the token request', async () => {
  const { captured, restore } = stubFetch({
    payload: { access_token: 'tok', scope: 'openid' },
  });
  try {
    const out = await fetchAccessTokenWithScopes({ ...CREDS });
    const sent = new URLSearchParams(String(captured.opts.body));
    assert.equal(sent.get('scope'), null);
    assert.deepEqual(out.requestedScopes, []);
    assert.deepEqual(out.grantedScopes, ['openid']);
  } finally { restore(); }
});

test('oauth: HTTP error from the token endpoint throws', async () => {
  const { restore } = stubFetch({ ok: false, status: 401, payload: { error: 'invalid_client' } });
  try {
    await assert.rejects(
      () => fetchAccessTokenWithScopes({ ...CREDS, scopes: [INVOICING_SCOPE] }),
      /PayPal OAuth failed: HTTP 401/);
  } finally { restore(); }
});

test('oauth: fetchAccessToken wrapper still returns the bare token string', async () => {
  const { restore } = stubFetch({ payload: { access_token: 'bare', scope: '' } });
  try {
    const tok = await fetchAccessToken(CREDS);
    assert.equal(tok, 'bare');
  } finally { restore(); }
});

test('oauth scopes config: defaults include invoicing; env override parses', () => {
  assert.ok(DEFAULT_OAUTH_SCOPES.includes(INVOICING_SCOPE));
  assert.deepEqual(resolveOAuthScopes(''), DEFAULT_OAUTH_SCOPES);
  assert.deepEqual(resolveOAuthScopes(undefined), DEFAULT_OAUTH_SCOPES);
  assert.deepEqual(
    resolveOAuthScopes('https://example/a, https://example/b  https://example/c'),
    ['https://example/a', 'https://example/b', 'https://example/c']);
});

test('oauth scopes config: getConfig honours VETOPAY_OAUTH_SCOPES (env wins over .env)', () => {
  const prev = process.env.VETOPAY_OAUTH_SCOPES;
  process.env.VETOPAY_OAUTH_SCOPES = `${INVOICING_SCOPE},openid`;
  try {
    assert.deepEqual(getConfig().oauthScopes, [INVOICING_SCOPE, 'openid']);
  } finally {
    if (prev === undefined) delete process.env.VETOPAY_OAUTH_SCOPES;
    else process.env.VETOPAY_OAUTH_SCOPES = prev;
  }
});
