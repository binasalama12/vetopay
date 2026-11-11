/**
 * Mock PayPal transport — a fake MCP server surface that mimics the
 * official @paypal/mcp tools (verified live against v1.8.1 / server
 * 1.11.0: 28 tools, names and argument shapes match the real server).
 *
 * Lets the whole VetoPay stack run end-to-end with zero credentials.
 * State is in-memory; every object gets realistic-looking sandbox IDs.
 */

export const MOCK_TOOL_NAMES = [
  'create_invoice', 'list_invoices', 'get_invoice', 'send_invoice',
  'send_invoice_reminder', 'cancel_sent_invoice', 'generate_invoice_qr_code',
  'create_product', 'list_products', 'update_product', 'show_product_details',
  'create_subscription_plan', 'list_subscription_plans',
  'show_subscription_plan_details', 'create_subscription',
  'show_subscription_details', 'cancel_subscription',
  'create_shipment_tracking', 'get_shipment_tracking',
  'create_order', 'get_order', 'pay_order',
  'list_disputes', 'get_dispute', 'accept_dispute_claim',
  'list_transactions', 'create_refund', 'get_refund',
];

function orderId(n) { return ('ORD' + String(n).padStart(14, '0')).slice(0, 17); } // 17 chars, matches pay_order pattern
function captureId(n) { return ('CAP' + String(n).padStart(12, '0')).slice(0, 15); } // 15 chars, matches create_refund pattern

function recipientsOf(args) {
  const raw = args.primary_recipients || [];
  return raw.map(r => typeof r === 'string' ? r
    : (r?.billing_info?.email_address || r?.email_address || 'unknown@example.com'));
}

function invoiceTotal(args) {
  return (args.items || []).reduce((s, it) =>
    s + Number(it?.unit_amount?.value ?? 0) * Number(it?.quantity ?? 1), 0);
}

function orderTotal(args) {
  const items = (args.items || []).reduce((s, it) =>
    s + (it?.itemTotal != null ? Number(it.itemTotal)
         : Number(it?.itemCost ?? 0) * Number(it?.quantity ?? 1)), 0);
  return items - Number(args.discount || 0) + Number(args.shippingCost || 0);
}

export class MockPayPalTransport {
  constructor() {
    this.kind = 'mock';
    this.seq = 0;
    this.invoices = new Map();
    this.orders = new Map();
    this.captures = new Map();
    this.refunds = new Map();
  }

  async listTools() {
    return MOCK_TOOL_NAMES.map(name => ({ name }));
  }

  /** Resolver used by the veto layer for follow-up calls. */
  lookup(kind, idValue) {
    if (kind === 'invoice') {
      const inv = this.invoices.get(idValue);
      return inv ? { amount: inv.amount, currency: inv.currency, recipients: inv.recipients } : null;
    }
    if (kind === 'order') {
      const ord = this.orders.get(idValue);
      return ord ? { amount: ord.amount, currency: ord.currency, recipients: ord.recipients } : null;
    }
    if (kind === 'capture') {
      const cap = this.captures.get(idValue);
      return cap ? { amount: cap.amount, currency: cap.currency, recipients: cap.recipients } : null;
    }
    return null;
  }

  async callTool(name, args = {}) {
    switch (name) {
      case 'create_invoice': {
        const n = ++this.seq;
        const inv = {
          id: `INV2-MOCK-${String(n).padStart(4, '0')}`,
          status: 'DRAFT',
          amount: invoiceTotal(args),
          currency: args.currency_code || 'USD',
          recipients: recipientsOf(args),
        };
        this.invoices.set(inv.id, inv);
        return { invoice_id: inv.id, status: inv.status,
                 amount: { value: inv.amount.toFixed(2), currency_code: inv.currency },
                 _mock: true };
      }
      case 'send_invoice': {
        const inv = this.invoices.get(args.invoice_id);
        if (!inv) throw new Error(`mock: invoice ${args.invoice_id} not found`);
        inv.status = 'SENT';
        return { invoice_id: inv.id, status: 'SENT', _mock: true };
      }
      case 'list_invoices':
        return { invoices: [...this.invoices.values()].map(i => ({ id: i.id, status: i.status })), _mock: true };
      case 'get_invoice': {
        const inv = this.invoices.get(args.invoice_id);
        if (!inv) throw new Error(`mock: invoice ${args.invoice_id} not found`);
        return { ...inv, _mock: true };
      }
      case 'create_order': {
        const n = ++this.seq;
        const ord = {
          id: orderId(n), status: 'CREATED',
          amount: orderTotal(args), currency: args.currencyCode || 'USD',
          recipients: [], // orders are paid BY a payer; captured in pay_order
        };
        this.orders.set(ord.id, ord);
        return { id: ord.id, status: ord.status,
                 amount: { value: ord.amount.toFixed(2), currency_code: ord.currency },
                 _mock: true };
      }
      case 'get_order': {
        const ord = this.orders.get(args.id);
        if (!ord) throw new Error(`mock: order ${args.id} not found`);
        return { ...ord, _mock: true };
      }
      case 'pay_order': {
        const ord = this.orders.get(args.id);
        if (!ord) throw new Error(`mock: order ${args.id} not found`);
        const n = ++this.seq;
        const cap = { id: captureId(n), order_id: ord.id, status: 'COMPLETED',
                      amount: ord.amount, currency: ord.currency,
                      recipients: ['test-buyer@example.com'] };
        this.captures.set(cap.id, cap);
        ord.status = 'COMPLETED';
        return { id: ord.id, status: 'COMPLETED', capture_id: cap.id,
                 amount: { value: cap.amount.toFixed(2), currency_code: cap.currency },
                 _mock: true };
      }
      case 'create_refund': {
        const cap = this.captures.get(args.capture_id);
        if (!cap) throw new Error(`mock: capture ${args.capture_id} not found`);
        const n = ++this.seq;
        const amount = args.amount?.value != null ? Number(args.amount.value) : cap.amount;
        const refund = { id: `RFND-MOCK-${String(n).padStart(4, '0')}`,
                         status: 'COMPLETED', capture_id: cap.id, amount };
        this.refunds.set(refund.id, refund);
        return { refund_id: refund.id, status: refund.status,
                 amount: { value: amount.toFixed(2), currency_code: args.amount?.currency_code || cap.currency },
                 _mock: true };
      }
      case 'get_refund': {
        const r = this.refunds.get(args.refund_id);
        if (!r) throw new Error(`mock: refund ${args.refund_id} not found`);
        return { ...r, _mock: true };
      }
      default:
        throw new Error(`mock: tool "${name}" exists on the real server but is not implemented in the mock transport`);
    }
  }

  async close() {}
}
