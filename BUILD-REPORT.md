# VetoPay — Build Report (Blok 1 + Blok 2)

Built 11 Nov 2026 (Asia/Jakarta) per `~/workspace/hackathon-roundup-2026-11-11/paypal.md`.
Repo: `~/workspace/vetopay/` (fresh git repo, MIT LICENSE included, initial commit made).

## Blok 1 — Integration layer: DONE (mock-verified; live wiring ready)

- **Real MCP path verified as far as credentials allow:** `@paypal/mcp` v1.8.1 installs and runs in this VM via `npx`. Probed with a deliberately fake token: the server starts in Sandbox mode, the JSON-RPC `initialize` handshake succeeds (server "PayPal" v1.11.0), and `tools/list` returns **28 tools** (create_invoice, send_invoice, create_order, pay_order, create_refund, …). Evidence: `evidence/mcp-probe.txt`.
  - Discovered the server's real auth model from its bundled README: it takes an **OAuth access token** + `PAYPAL_ENVIRONMENT=SANDBOX` — so `src/transport/mcp.js` exchanges the sandbox app's client id/secret for a token (`POST /v1/oauth2/token`, client-credentials) and spawns `npx -y @paypal/mcp --tools=all`. Arg shapes + input schemas of the 5 key tools were captured from the live `tools/list` and are mirrored in the mock and the veto extractors.
- **Mock mode (default):** `src/transport/mock.js` — in-memory fake implementing the real tool names/argument shapes (invoices, orders, captures, refunds with schema-compatible IDs). Everything runs end-to-end with zero credentials.
- **Credentials hygiene:** config comes only from env / gitignored `.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE`). No secret was hunted, guessed, or requested. Without `.env`, mode defaults to mock; `npm run smoke:real` refuses cleanly (exit 2) instead of guessing.
- **Fallback:** `src/transport/rest.js` — Orders v2 REST client (create/get/capture) behind the same interface, per the sprint plan's pivot rule. Coded, **not yet exercised** against the live sandbox.
- Node chosen over Python: `@paypal/mcp` is an npx stdio server; zero-dependency Node harness (Node v24 in VM). `NODE_OPTIONS=--dns-result-order=ipv4first` is propagated to the MCP subprocess (this VM's egress quirk).

## Blok 2 — Veto layer: DONE

- `src/veto.js` — middleware classifying every money-moving call:
  - **APPROVED** (trusted source, amount ≤ auto-approve limit $100 default, known recipient),
  - **HELD** (amount over limit; any refund; new/unknown recipient; unverifiable amount; money movement from untrusted provenance),
  - **VETOED** (refund ordered by untrusted content; injection phrases — "ignore previous approval instructions", "skip the confirmation", "do not ask the owner", "process immediately", … — in content from untrusted sources).
  - Amount/recipient facts are extracted from the real MCP argument shapes; follow-up calls (send_invoice / pay_order / create_refund) resolve amount + parties from the referenced object.
- `src/agent.js` — harness: tasks = instruction + provenance + tool-call plan; nothing executes except through the veto layer; HELD calls go to a human approver (CLI prompt, `src/approve-cli.js`).
- `src/audit.js` — append-only JSONL audit log (decision, held, human_approved/declined, tool_executed) — sample logs under `logs/` from the evidence runs.

## Demo scenarios (all runnable, mock mode)

| Scenario | Result | Evidence |
|---|---|---|
| 1 — benign $25 invoice → APPROVED, created + SENT | ✅ PASS | `evidence/scenario1-mock.txt` |
| 2 — injected email orders full refund → **VETOED**, 0 refunds in state | ✅ PASS | `evidence/scenario2-mock.txt` |
| 3 — legitimate $750 payment → HELD → human approves at CLI → executed | ✅ PASS | `evidence/scenario3-mock.txt` |

## Tests

`npm test` → **13/13 pass** (10 veto-rule unit tests + 3 end-to-end scenario tests, incl. the "human declines → nothing executes" branch). Raw output: `evidence/tests.txt`.

## What remains (explicit)

1. **Live sandbox smoke test — needs the user/dashboard step:** fill `.env` with the sandbox Client ID + Secret of the "VetoPay" app (PayPal Developer Dashboard → Apps & Credentials → Sandbox). Then: `npm run smoke:real` (tool list only), and re-run the 3 scenarios with `VETOPAY_MODE=real`. The secret must never transit chat; it goes straight into `.env` (gitignored).
2. **Blok 3** — approval UI polish (currently a minimal CLI prompt — functional, within Blok 2 scope), README already covers setup/judge credentials; freeze features after.
3. **Blok 4** — demo video (< 3 min, public YouTube) + Devpost submission, **submit ≤ 12 Nov 23:00 WIB** (hard deadline 13 Nov 03:00 WIB). Not started here (out of scope for this build).
4. Known limitation: against the real MCP transport, follow-up calls can't resolve amount/recipient locally (server is stateless for us), so the veto layer HELDs them for a human — the safe direction, but worth a live-behavior check in the smoke test.

## Blok 3 — Approval UI polish: DONE (11 Nov 2026)

- `src/approve-cli.js` rewritten: pure, testable `formatApprovalPrompt` + `parseApprovalAnswer`. A HELD prompt now shows tool + plain-language label, kind, amount (or `UNVERIFIED`), recipient(s), provenance (trusted/UNTRUSTED + instruction excerpt), numbered HELD reasons, and the audit entry/file already written for the hold — then an explicit `Decision [approve/decline]` prompt.
- Fail-closed semantics: only `approve`/`y`/`yes`/`a` executes (legacy `printf 'y\n'` demo scripts keep working); Enter, EOF, `decline`, `no`, or a typo declines.
- `src/agent.js`: the harness now passes `source`, `instruction`, the `held_for_approval` audit entry, and the audit path to the approver.
- Decline path re-verified end-to-end (new e2e-style test + manual `printf 'decline\n'` run of scenario 3): HELD call declined → nothing executed, no `tool_executed` audit entry, `human_declined` logged.
- Tests: `npm test` → **19/19 pass** (13 existing + 6 new in `test/approve-cli.test.js` covering prompt format, untrusted/unverified rendering, fail-closed parsing, CLI approve/decline/EOF, and the decline-executes-nothing path). Evidence regenerated: `evidence/scenario3-mock.txt` (new prompt), `evidence/tests.txt`.
- README: new “Human approval (HELD calls)” section with a sample prompt block; status table updated.

## Real-mode scenario run — 11 Nov 2026 (sandbox credentials in .env)

Prerequisite met: `npm run smoke:real` PASSED (OAuth exchange OK, official @paypal/mcp sandbox reachable, 28 tools). New runners use the real transport (`makeRealHarness` in `src/scenario-kit.js`); no mock fallback — a non-real config aborts.

- **Scenario 1 REAL (`scenarios/scenario1-real.js`, evidence `evidence/scenario1-real.txt`): FAILED at the sandbox, honestly reported.** `create_invoice` $25 was APPROVED by the veto layer and reached the real server, which returned `{"ok":false,"status":403,"code":"PAYPAL_API_HTTP_ERROR","message":"Authorization failed due to insufficient permissions."}` — no invoice was created, so `send_invoice` never ran. Diagnosis (read-only OAuth scope check): the access token's scope list contains payments/orders/refund/subscriptions/disputes but **no `https://uri.paypal.com/services/invoicing` scope** — the "VetoPay" sandbox app was created without the Invoicing feature, so invoicing calls are not permitted for this app. Fix is dashboard-side: enable Invoicing on the sandbox app (or create a new sandbox app with Invoicing) and refresh `.env`.
- **Scenario 2 veto path REAL (`scenarios/scenario2-veto-real.js`, evidence `evidence/scenario2-real.txt`): PASS.** Only the attack task was run (no seeding purchase — the veto does not depend on a capture existing, and seeding would move sandbox money): the injected-email refund was VETOED and a transport call counter proved **0 calls reached the real sandbox**.

## Honest blockers

- Blok 1+2: none. Live invoice creation is blocked by the sandbox app's missing Invoicing scope (403 above) — dashboard-side fix, not a code defect; the Orders path (create_order/pay_order) uses scopes the token does carry.
