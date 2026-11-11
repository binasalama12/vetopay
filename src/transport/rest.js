/**
 * REST fallback transport — the sprint plan's pivot if MCP auth ever
 * fails completely: talk to PayPal Orders v2 directly over HTTPS,
 * behind the same { listTools, callTool, lookup } interface.
 *
 * Scope: orders only (create_order / get_order / pay_order = capture).
 * Invoice and refund tools throw a clear NotSupported error here;
 * the MCP transport remains the primary path. NOT exercised against
 * the live sandbox yet (needs .env credentials) — it is a coded,
 * interface-compatible fallback, labelled as such in the README.
 */
import { fetchAccessToken } from './mcp.js';

export class RestOrdersTransport {
  constructor(config) {
    this.kind = 'rest';
    this.config = config;
    this.token = null;
    this.orders = new Map();
  }

  async auth() {
    if (!this.token) this.token = await fetchAccessToken(this.config);
    return this.token;
  }

  async api(path, method = 'GET', body) {
    const token = await this.auth();
    const res = await fetch(`${this.config.apiBase}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PayPal REST ${method} ${path}: HTTP ${res.status}`);
    return res.status === 204 ? {} : res.json();
  }

  async listTools() {
    return [{ name: 'create_order' }, { name: 'get_order' }, { name: 'pay_order' }];
  }

  lookup(kind, idValue) {
    if (kind !== 'order') return null;
    const ord = this.orders.get(idValue);
    return ord ? { amount: ord.amount, currency: ord.currency, recipients: [] } : null;
  }

  async callTool(name, args = {}) {
    switch (name) {
      case 'create_order': {
        const amount = (args.items || []).reduce((s, it) =>
          s + (it?.itemTotal != null ? Number(it.itemTotal)
               : Number(it?.itemCost ?? 0) * Number(it?.quantity ?? 1)), 0);
        const order = await this.api('/v2/checkout/orders', 'POST', {
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: args.currencyCode || 'USD', value: amount.toFixed(2) },
          }],
        });
        this.orders.set(order.id, { amount, currency: args.currencyCode || 'USD' });
        return { id: order.id, status: order.status, _rest: true };
      }
      case 'get_order':
        return this.api(`/v2/checkout/orders/${args.id}`);
      case 'pay_order': // MCP pay_order == Orders v2 capture
        return this.api(`/v2/checkout/orders/${args.id}/capture`, 'POST', {});
      default:
        throw new Error(`rest-fallback: tool "${name}" not supported (orders only)`);
    }
  }

  async close() {}
}
