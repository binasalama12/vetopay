/**
 * Real transport — the official PayPal MCP server (@paypal/mcp),
 * launched as a stdio subprocess, spoken to with plain JSON-RPC
 * (initialize / tools/list / tools/call). No SDK dependency.
 *
 * Auth model of the official server (verified against @paypal/mcp
 * 1.8.1, server 1.11.0): it takes an OAuth ACCESS TOKEN plus
 * PAYPAL_ENVIRONMENT=SANDBOX. VetoPay obtains that token itself by
 * exchanging the sandbox app's client id/secret at
 * POST {apiBase}/v1/oauth2/token (client_credentials grant) —
 * exactly the credentials of the "VetoPay" sandbox REST app.
 *
 * Verified in this repo's dev environment: the server starts, the
 * initialize handshake succeeds and tools/list returns 28 tools
 * (see evidence/mcp-probe.txt). Live tool CALLS need real sandbox
 * credentials in .env — see README "Live sandbox smoke test".
 */
import { spawn } from 'node:child_process';

export async function fetchAccessToken({ clientId, clientSecret, apiBase }) {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error('PayPal OAuth: no access_token in response');
  return json.access_token;
}

export class McpPayPalTransport {
  constructor({ accessToken, environment = 'SANDBOX', command = 'npx' } = {}) {
    this.kind = 'mcp';
    this.accessToken = accessToken;
    this.environment = environment;
    this.command = command;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.toolsCache = null;
  }

  async start() {
    if (this.proc) return;
    const env = {
      ...process.env,
      PAYPAL_ACCESS_TOKEN: this.accessToken,
      PAYPAL_ENVIRONMENT: this.environment,
      // This VM's egress needs IPv4-first DNS for Node fetch.
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first']
        .filter(Boolean).join(' '),
    };
    this.proc = spawn(this.command, ['-y', '@paypal/mcp', '--tools=all'],
      { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.on('data', chunk => {
      this.buffer += chunk.toString('utf8');
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`MCP error: ${JSON.stringify(msg.error)}`));
          else resolve(msg.result);
        }
      }
    });
    await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'vetopay', version: '0.1.0' },
    });
    this.notify('notifications/initialized');
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  notify(method, params = {}) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async listTools() {
    await this.start();
    if (!this.toolsCache) {
      const res = await this.request('tools/list', {});
      this.toolsCache = res.tools || [];
    }
    return this.toolsCache;
  }

  async callTool(name, args = {}) {
    await this.start();
    const res = await this.request('tools/call', { name, arguments: args });
    const text = (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    try { return JSON.parse(text); } catch { return { raw: text, isError: Boolean(res.isError) }; }
  }

  /** The real server is stateless for us; follow-up amount/recipient
   *  resolution falls back to "unknown" (veto layer then HELDs, which
   *  is the safe direction). */
  lookup() { return null; }

  async close() {
    if (this.proc) { this.proc.kill('SIGTERM'); this.proc = null; }
  }
}

/** Build the real transport from config (exchanges credentials first). */
export async function createRealTransport(config) {
  const accessToken = await fetchAccessToken(config);
  return new McpPayPalTransport({ accessToken, environment: 'SANDBOX' });
}
