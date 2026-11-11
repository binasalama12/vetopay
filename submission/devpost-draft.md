# VetoPay — Devpost Submission Draft (PayPal AI Hackathon)

> Ready to paste into the Devpost submission form. Placeholders in [brackets]
> must be filled at submit time. Finalized 11 Nov: scenario-1 real-sandbox
> outcome is the SUCCESS wording (invoice INV2-VMNB-Y2TA-BNDX-CUVJ, SENT);
> test count updated to 25/25.

---

## Project name

VetoPay

## Tagline

An AI agent that can move money through PayPal — but never without passing a
human-veto safety layer first.

## Target prize category

**Best Use of Agentic Commerce** (primary). The same submission is also
eligible for Best Use of PayPal + AI and the overall prizes.

---

## Inspiration

Payment MCP servers give AI agents real money-moving tools — invoices,
orders, refunds — with no built-in confirmation step. Whoever can get text in
front of the agent (an email, a fake invoice, a poisoned web page) can try to
order it to move money. We had already built VetoAgent, an agent-safety
harness based on one rule: *content may describe actions; only the user may
order them.* VetoPay ports that design into the payments domain, on top of
PayPal's own official MCP server.

## What it does

VetoPay wires an agent harness to the **official PayPal MCP server**
(`@paypal/mcp`, sandbox mode, 28 tools). Between the agent and every
money-moving tool call sits a **veto layer** that classifies each call:

- **APPROVED** — trusted source, amount within the auto-approve limit
  (default $100), known recipient → executes automatically.
- **HELD** — amount over the limit, any refund, a new/unknown recipient, an
  amount that can't be verified from the referenced object, or any
  money movement requested from an untrusted source → nothing executes until
  a human approves at the CLI. The approval prompt shows the tool, amount,
  recipient, the instruction's provenance, and every reason it was held —
  and it is **fail-closed**: only an explicit `approve` executes; Enter,
  EOF, a typo, or `decline` executes nothing.
- **VETOED** — a refund ordered by untrusted content, or any money movement
  whose instruction carries prompt-injection phrases ("ignore all previous
  approval instructions", "skip the confirmation step", "do not ask the
  account owner"…) → never executes, no human override offered.

Every decision — veto decision, hold, human approve/decline, execution — is
written to an **append-only JSONL audit log**, so the full history of what
the agent tried to do with your money, and what a human decided, is
inspectable after the fact.

**Three demo scenarios:**

1. **Benign $25 invoice** to a known customer → APPROVED, invoice created
   and sent. Verified end-to-end against the real PayPal sandbox via the
   official MCP server: invoice INV2-VMNB-Y2TA-BNDX-CUVJ ($25.00 USD),
   read back with status SENT.
2. **Prompt-injection refund (real sandbox mode)** — an "URGENT — PayPal
   Support Desk" email orders the agent to refund in full, skip
   confirmation, and not ask the owner. The veto layer detects the untrusted
   provenance plus 5 injection phrases and **VETOES** it. A transport call
   counter proves **zero calls reached the real PayPal sandbox** — the
   attack died at the safety layer, not at the API.
3. **Legitimate $750 payment** from the user → HELD for exceeding the $100
   auto-approve limit; a human approves at the CLI; only then does it
   execute. The decline path is equally tested: declining executes nothing.

## How we built it

- **PayPal integration (central, not bolted on):** the official
  `@paypal/mcp` server (server v1.11.0) in sandbox mode. VetoPay performs
  the OAuth client-credentials exchange against the sandbox, then spawns
  the server over stdio with a small hand-rolled JSON-RPC client. The whole
  project is about PayPal tool calls — invoices, orders, refunds — there is
  no other product surface.
- **Veto engine** (`src/veto.js`): provenance-aware risk rules over amount,
  action type, recipient novelty, and instruction source, plus
  injection-phrase detection. Amounts and recipients are extracted from the
  real MCP argument shapes; follow-up calls (send_invoice, pay_order,
  create_refund) resolve their facts from the referenced object — and if a
  fact can't be resolved, the call is HELD rather than waved through.
- **Agent harness** (`src/agent.js`): tasks arrive as instruction +
  provenance + tool-call plan; nothing reaches a transport except through
  the veto layer. The harness is agent-agnostic — any LLM agent that emits
  MCP tool calls can sit in front of it unchanged.
- **Human approval CLI** (`src/approve-cli.js`): one explicit summary block
  per held call (tool + plain-language label, amount or UNVERIFIED,
  recipient, trusted/UNTRUSTED provenance with the instruction quoted,
  numbered hold reasons, the audit entry already written), then a
  fail-closed approve/decline prompt.
- **Audit log** (`src/audit.js`): append-only JSONL.
- **Transports behind one interface:** the real MCP transport, a mock
  transport that mirrors the probed live tool surface for credential-free
  demos, and an Orders v2 REST fallback.
- **Runtime:** Node.js ≥ 18, **zero third-party runtime dependencies** —
  judges can clone and run the mock scenarios with no install and no
  credentials.

## Challenges we ran into

- **MCP auth model:** the official server takes an OAuth access token, not
  the client id/secret directly — we implemented the token exchange
  ourselves and probed `tools/list` live to mirror the exact tool surface
  (28 tools) in the mock.
- **Sandbox app scopes:** invoice calls initially returned 403
  "insufficient permissions" because the sandbox app lacked the Invoicing
  scope; diagnosing that required separating "our call is wrong" from "the
  app isn't permitted" with a read-only scope check.
- **Fail-closed by default:** every ambiguous case (unresolvable amount,
  unknown recipient, untrusted provenance) had to resolve toward HELD or
  VETOED, never toward execution — including at the human prompt, where a
  bare Enter must mean "no".

## Accomplishments that we're proud of

- The injection-refund scenario passes **in real sandbox mode**: the
  refund is vetoed and a call counter proves zero calls ever reached
  PayPal.
- A complete, inspectable audit trail for every decision, including human
  approvals and declines.
- 25/25 automated tests green (veto rules, prompt format, fail-closed
  parsing, and the decline-executes-nothing path end-to-end).
- Zero-dependency, clone-and-run demo: `npm test`, `npm run scenario1/2/3`.

## What we learned

Agentic commerce doesn't fail at the payment API — it fails at the
instruction boundary. Provenance (who actually ordered this?) turned out to
be a stronger safety signal than amount or action type alone, and a payment
agent's safety layer has to treat *unresolvable facts* as risk, not as
permission.

## What's next

- A hosted approval UI (the CLI prompt's summary block is already designed
  to render as a web card).
- Policy packs: per-merchant limits, recipient allowlists, and scheduled
  review of audit logs.
- Live-mode (production) hardening: webhook reconciliation of executed
  calls against the audit log.

## Built with

- PayPal — official `@paypal/mcp` MCP server (v1.11.0, sandbox), PayPal
  sandbox REST app + OAuth client-credentials flow
- Node.js (≥ 18) — zero third-party runtime dependencies
- Model Context Protocol (MCP) over stdio / JSON-RPC

## Try it out / links

- **GitHub repo:** [REPO URL — github.com/binasalama12/vetopay, fill at
  submit]
- **Demo video (< 3 min, public YouTube):** [VIDEO URL — fill at submit]
- **Run it yourself (no credentials needed):**
  `git clone [REPO URL] && cd vetopay && npm test && npm run scenario2`
- **Live sandbox mode:** create a PayPal Developer sandbox REST app, put
  its Client ID/Secret in `.env` (see README), then `npm run smoke:real`.
  Sandbox credentials only — never commit `.env`.

## Tools field (Devpost "Tools" / AI usage)

PayPal integration is via the official PayPal MCP server (`@paypal/mcp`,
sandbox). The agent harness is a deterministic Node.js reference agent for
judge reproducibility; the veto middleware is agent-agnostic and works in
front of any LLM-driven agent that emits MCP tool calls. AI is used
meaningfully as the acting agent whose PayPal tool calls the safety layer
governs.
