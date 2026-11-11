# VetoPay — Demo Video Script & Shot List

**Target length:** 2:30 of narration (hard cap: video < 3:00 total).
**Format:** screen recording of a terminal, 1080p, terminal font large
(18–20pt), dark theme. Narration recorded as voiceover (or captions-only if
no mic — captions text = narration text below, verbatim).
**Rule:** no third-party copyrighted material — terminal footage and our own
text only.

## Pre-flight setup (before recording)

- [ ] Fresh terminal at `~/workspace/vetopay`, window sized so lines don't wrap
- [ ] Pre-generate evidence so the recording can cut instead of wait:
      `npm run scenarios` (regenerates `evidence/scenario*-mock.txt`)
- [ ] Have these files openable in tabs/panes:
      `evidence/mcp-probe.txt`, `evidence/scenario1-mock.txt`,
      `evidence/scenario2-mock.txt`, `evidence/scenario3-mock.txt`,
      `evidence/scenario2-real.txt`, `logs/audit-scenario3.jsonl`
- [ ] Scenario 1 on screen: use the mock transcript, OR the real-mode
      transcript if the parallel scope-fix run has landed by recording time
      — pick ONE and keep the narration line for Segment 2 as written
      (it does not claim a real invoice).

## Shot list & narration

### Segment 0 — Cold open (0:00–0:15)

- **On screen:** black/terminal. Type and run: `npm run scenario2`.
  Freeze on the `[VETOED] create_refund` line; zoom/highlight it.
- **Narration (≈35 words):**
  "This email just ordered an AI agent to refund forty dollars, skip
  confirmation, and not tell the owner. The agent refused — because before
  an agent can move money with PayPal, it has to pass VetoPay."

### Segment 1 — What it is (0:15–0:45)

- **On screen:** README architecture diagram (scroll slowly), then
  `evidence/mcp-probe.txt` showing the live server handshake + "28 tools".
- **Narration (≈70 words):**
  "VetoPay puts a veto layer between an AI agent and PayPal's official MCP
  server — sandbox mode, twenty-eight real tools: invoices, orders,
  refunds. Every money-moving call is classified. Approved: low-risk calls
  from the user execute automatically. Held: risky calls wait for a human.
  Vetoed: calls ordered by untrusted content — like that email — never
  execute at all. And every decision lands in an append-only audit log."

### Segment 2 — Scenario 1: the boring case just works (0:45–1:05)

- **On screen:** `evidence/scenario1-mock.txt` (or real transcript if
  available) — highlight `[APPROVED] create_invoice $25.00` and
  `[EXECUTED] … "status":"SENT"`.
- **Narration (≈45 words):**
  "Normal work shouldn't need babysitting. The user asks for a
  twenty-five-dollar invoice to a known customer: trusted source, under the
  hundred-dollar auto-approve limit. Approved, created, sent — no human
  interrupted."

### Segment 3 — Scenario 2: the attack, in REAL mode (1:05–1:40)

- **On screen:** switch to `evidence/scenario2-real.txt`. Scroll slowly:
  the `[TASK] source=email :: URGENT — PayPal Support Desk…` line, then the
  `[VETOED]` line with its reasons, then stop on
  `[CHECK] real transport calls made: 0` and `[RESULT] PASS`.
- **Narration (≈80 words):**
  "Now the attack — and this run is real mode, wired to the actual PayPal
  sandbox. A fake support email tells the agent to refund in full, ignore
  approval instructions, and not ask the owner. The veto engine reads the
  provenance: email — untrusted. It counts five injection phrases. A refund
  is money out, and money never moves on an untrusted instruction. Vetoed.
  And the proof matters: a transport counter shows zero calls reached the
  sandbox. The attack died at the safety layer, not at the API."

### Segment 4 — Scenario 3: big but legitimate → human decides (1:40–2:15)

- **On screen:** run or show `evidence/scenario3-mock.txt`; linger on the
  full "HUMAN APPROVAL REQUIRED" block (tool, $750.00, recipient,
  provenance, numbered reason), the typed `approve`, then `[EXECUTED]`.
  Cut to `logs/audit-scenario3.jsonl` — show `held_for_approval`,
  `human_approved`, `tool_executed` lines.
- **Narration (≈80 words):**
  "A seven-hundred-fifty-dollar payment from the real user is legitimate —
  but over the limit, so it's held. The human sees exactly what they're
  approving: the tool, the amount, the recipient, who ordered it, and why
  it was held. Approving is fail-closed — only an explicit 'approve'
  executes; Enter, a typo, or declining executes nothing. The decision
  itself is written to the same audit log, next to the hold and the
  execution."

### Segment 5 — Close (2:15–2:30)

- **On screen:** terminal: `npm test` → "25/25 pass" (or the tail of
  `evidence/tests.txt`), then the repo README title screen. End card text:
  "VetoPay — content may describe payments; only the user may order them."
  + repo URL.
- **Narration (≈40 words):**
  "Nineteen of nineteen tests pass, zero dependencies, clone and run it
  yourself. Agents are going to move money. VetoPay makes sure they only
  move it when a human actually said so. Thank you."

## Timing summary

| Segment | Window | Content |
|---|---|---|
| 0 | 0:00–0:15 | Veto cold open |
| 1 | 0:15–0:45 | Concept + official MCP, 28 tools |
| 2 | 0:45–1:05 | Scenario 1 — APPROVED invoice |
| 3 | 1:05–1:40 | Scenario 2 — REAL-mode VETO, 0 calls |
| 4 | 1:40–2:15 | Scenario 3 — HELD → approve → executed + audit log |
| 5 | 2:15–2:30 | Tests + closing line |
| — | 2:30–3:00 | Buffer: intro/outro cards, pauses — never exceed 3:00 |

Total narration ≈ 350 words ≈ 2:20–2:35 at natural pace. If a take runs
long, trim Segment 1 first (drop the audit-log sentence — Segment 4 covers
it).
