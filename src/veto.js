/**
 * VetoPay veto layer (Blok 2).
 *
 * Intercepts every tool call an agent wants to make against the PayPal
 * MCP server and classifies it:
 *
 *   APPROVED — low risk, execute immediately
 *   HELD     — pause; a human must approve before execution
 *   VETOED   — blocked outright, never executed
 *
 * Risk signals: amount, action type (refund/payout = money leaving),
 * recipient novelty, and instruction provenance — instructions that
 * arrive inside untrusted content (email bodies, invoice notes, web
 * pages) are treated as potential prompt injection, never as orders.
 */

export const DECISIONS = { APPROVED: 'APPROVED', HELD: 'HELD', VETOED: 'VETOED' };

/** Tools that move (or commit to move) money. Everything else is a read. */
export const MONEY_TOOLS = new Set([
  'create_invoice', 'send_invoice', 'send_invoice_reminder',
  'cancel_sent_invoice', 'create_order', 'pay_order', 'create_refund',
  'accept_dispute_claim', 'create_subscription', 'cancel_subscription',
  'create_subscription_plan', 'create_product', 'update_product',
]);

/** Money-LEAVING tools: the highest-risk class. */
const OUTFLOW_TOOLS = new Set(['create_refund', 'pay_order', 'accept_dispute_claim']);

const TRUSTED_SOURCES = new Set(['user', 'cli', 'system']);

/** Phrases that scream "injected instruction" when found in content. */
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|approval|confirmation)/i,
  /skip (the )?(approval|confirmation|verification)/i,
  /without (any )?(approval|confirmation|asking)/i,
  /do not (ask|confirm|notify|tell)/i,
  /bypass/i,
  /process (this|it) immediately/i,
  /refund .* to (this|the following|a new) account/i,
  /disregard (the )?(owner|user|approval)/i,
];

export function findInjectionSignals(text = '') {
  return INJECTION_PATTERNS.filter(re => re.test(text)).map(re => re.source);
}

function emailsOf(recipients) {
  if (!Array.isArray(recipients)) return [];
  const out = [];
  for (const r of recipients) {
    if (typeof r === 'string') out.push(r);
    else if (r?.email_address) out.push(r.email_address);
    else if (r?.billing_info?.email_address) out.push(r.billing_info.email_address);
  }
  return out.map(e => String(e).toLowerCase());
}

/**
 * Extract { amount, currency, recipient, kind } from a tool call using
 * the real @paypal/mcp argument shapes. `lookup(kind, id)` resolves
 * follow-up calls (send_invoice / pay_order / create_refund) to the
 * amounts and parties of the object they act on.
 */
export function extractFacts(tool, args = {}, lookup = () => null) {
  switch (tool) {
    case 'create_invoice': {
      const items = args.items || [];
      const amount = items.reduce((sum, it) =>
        sum + Number(it?.unit_amount?.value ?? it?.itemCost ?? 0) * Number(it?.quantity ?? 1), 0);
      return { kind: 'invoice', amount, currency: args.currency_code || 'USD',
               recipients: emailsOf(args.primary_recipients) };
    }
    case 'send_invoice':
    case 'send_invoice_reminder':
    case 'cancel_sent_invoice': {
      const inv = lookup('invoice', args.invoice_id);
      return { kind: 'invoice_send', amount: inv?.amount ?? null,
               currency: inv?.currency || 'USD',
               recipients: inv?.recipients || emailsOf(args.additional_recipients) };
    }
    case 'create_order': {
      const items = args.items || [];
      const itemsTotal = items.reduce((sum, it) =>
        sum + (it?.itemTotal != null ? Number(it.itemTotal)
               : Number(it?.itemCost ?? 0) * Number(it?.quantity ?? 1)), 0);
      const amount = itemsTotal - Number(args.discount || 0) + Number(args.shippingCost || 0);
      return { kind: 'payment', amount, currency: args.currencyCode || 'USD',
               recipients: emailsOf(args.recipients) };
    }
    case 'pay_order': {
      const ord = lookup('order', args.id);
      return { kind: 'outflow', amount: ord?.amount ?? null,
               currency: ord?.currency || 'USD', recipients: ord?.recipients || [] };
    }
    case 'create_refund': {
      const cap = lookup('capture', args.capture_id);
      const amount = args.amount?.value != null ? Number(args.amount.value)
        : (cap?.amount ?? null);
      return { kind: 'refund', amount,
               currency: args.amount?.currency_code || cap?.currency || 'USD',
               recipients: cap?.recipients || [], captureKnown: Boolean(cap) };
    }
    default:
      return { kind: MONEY_TOOLS.has(tool) ? 'money_other' : 'read',
               amount: null, currency: 'USD', recipients: [] };
  }
}

export class VetoEngine {
  constructor({ autoApproveLimit = 100, knownRecipients = [] } = {}) {
    this.autoApproveLimit = autoApproveLimit;
    this.knownRecipients = new Set(knownRecipients.map(e => e.toLowerCase()));
  }

  /**
   * @param call    { tool, args }
   * @param context { source, instructionText, lookup }
   * @returns { decision, reasons[], facts }
   */
  analyze(call, context = {}) {
    const { tool, args } = call;
    const source = context.source || 'user';
    const trusted = TRUSTED_SOURCES.has(source);
    const facts = extractFacts(tool, args, context.lookup || (() => null));
    const reasons = [];

    if (!MONEY_TOOLS.has(tool)) {
      return { decision: DECISIONS.APPROVED, reasons: ['read-only tool'], facts };
    }

    const instructionText = [context.instructionText || '',
      args?.note || '', args?.note_to_payer || ''].join(' ');
    const injections = findInjectionSignals(instructionText);
    const unknownRecipients = facts.recipients.filter(e => !this.knownRecipients.has(e));
    const newRecipient = unknownRecipients.length > 0;

    // --- VETO rules (hard blocks) ---
    if (!trusted && facts.kind === 'refund') {
      reasons.push(`instruction provenance is untrusted (${source}): refund ordered by content, not by the user`);
      if (injections.length) reasons.push(`injection phrases detected: ${injections.length}`);
      reasons.push('refund is a money-outflow action and is never executed on untrusted instructions');
      return { decision: DECISIONS.VETOED, reasons, facts };
    }
    if (!trusted && injections.length > 0) {
      reasons.push(`instruction provenance is untrusted (${source}) and the content carries injection phrases (${injections.length} matched)`);
      reasons.push('untrusted content may describe payments; it may never order them');
      return { decision: DECISIONS.VETOED, reasons, facts };
    }

    // --- HOLD rules (human decides) ---
    if (facts.kind === 'refund' && newRecipient) {
      reasons.push(`refund beneficiary is a new/unknown recipient (${unknownRecipients.join(', ')})`);
    }
    if (facts.kind === 'refund') {
      reasons.push('refunds are money-outflow: human approval always required');
    }
    if (OUTFLOW_TOOLS.has(tool) && facts.kind !== 'refund' && !trusted) {
      reasons.push(`money-outflow tool ordered from untrusted source (${source})`);
    }
    if (!trusted) {
      reasons.push(`instruction provenance is untrusted (${source}): a human must confirm money movement`);
    }
    if (facts.amount != null && facts.amount > this.autoApproveLimit) {
      reasons.push(`amount $${facts.amount.toFixed(2)} exceeds the auto-approve limit of $${this.autoApproveLimit.toFixed(2)}`);
    }
    if (newRecipient && (facts.kind === 'payment' || facts.kind === 'outflow')) {
      reasons.push(`recipient is new/unknown (${unknownRecipients.join(', ')})`);
    }
    if (facts.amount == null && facts.kind !== 'invoice') {
      reasons.push('amount could not be verified from the referenced object');
    }
    if (reasons.length) return { decision: DECISIONS.HELD, reasons, facts };

    return { decision: DECISIONS.APPROVED,
             reasons: [`within policy: trusted source, amount $${(facts.amount ?? 0).toFixed(2)} <= $${this.autoApproveLimit.toFixed(2)}, known recipient`],
             facts };
  }
}
