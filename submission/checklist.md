# VetoPay — Submission Checklist (Blok 4)

**Hard deadline: 13 Nov 2026, 03:00 WIB** (12 Nov 12:00 PT).
**Internal target: SUBMIT ≤ 12 Nov 2026, 23:00 WIB** (4-hour buffer).
Draft text: `submission/devpost-draft.md` · Video plan:
`submission/video-script.md`.

## 1. Finalize the code-side facts (before recording)

- [ ] Confirm the outcome of the parallel real-mode scenario-1 work
      (OAuth scope fix). Read the final `evidence/scenario1-real.txt`.
- [ ] In `submission/devpost-draft.md`, resolve the ONE marked sentence
      **[FINALIZE: scenario-1 outcome]** in Scenario 1 of "What it does":
      keep the wording that matches the verified result, delete the other,
      remove the marker. Do not ship the marker.
- [ ] Re-run `npm test` and note the exact count. The draft and the video
      script say **25/25** (updated 11 Nov after the OAuth scope fix added 6 tests) — if the count has
      changed (e.g. new transport tests), update BOTH files to match.
- [ ] Confirm `evidence/scenario2-real.txt` is the final real-mode veto
      transcript (PASS, 0 transport calls) — this is the video's Segment 3
      screen material.
- [ ] Regenerate mock evidence if any code changed: `npm run scenarios`.

## 2. Repo readiness (Devpost rules)

- [ ] Repo is **public** on GitHub, all source committed, working tree clean.
- [ ] MIT `LICENSE` present and detected in the GitHub "About" section.
- [ ] README has complete setup/run instructions (mock mode needs no
      credentials; real mode documents the sandbox app + `.env` steps).
- [ ] README/description states how judges can test: mock scenarios run
      free with zero credentials; live mode needs only a free PayPal
      Developer sandbox app.
- [ ] `.env` is gitignored and NOT in history; no real secret anywhere in
      the repo (grep for the sandbox secret prefix before pushing).

## 3. Video (< 3 minutes, public YouTube)

- [ ] Record per `submission/video-script.md` (narration ≈ 2:30, total
      runtime < 3:00 — verify the exported file's duration).
- [ ] Screen material: scenario transcripts + audit log only; no
      third-party copyrighted material, no credentials on screen
      (do NOT show `.env` or the dashboard secret).
- [ ] Upload to YouTube as **Public** (not unlisted-only if the form
      requires public — rules say public), title: "VetoPay — a human-veto
      safety layer for PayPal's MCP agent tools".
- [ ] Paste the video URL into `submission/devpost-draft.md` link
      placeholder.

## 4. Devpost form

- [ ] Project name: **VetoPay**; tagline per draft.
- [ ] Paste description from `submission/devpost-draft.md` (Inspiration /
      What it does / How we built it / Challenges / Accomplishments /
      What we learned / What's next).
- [ ] **Tools field** filled (PayPal MCP + how AI is used — text is at the
      bottom of the draft).
- [ ] **Built-with** list added: @paypal/mcp, PayPal sandbox, Node.js, MCP.
- [ ] Prize category selected: **Best Use of Agentic Commerce**.
- [ ] Repo URL filled (draft placeholder) and verified to open logged-out.
- [ ] Video URL filled and verified to play logged-out.
- [ ] All materials in English. Team/participant info correct
      (registration 31302-paypal-ai-hackathon).

## 5. Submit

- [ ] Submit on Devpost **≤ 12 Nov 2026, 23:00 WIB**.
- [ ] After submitting, open the public project page logged-out and verify:
      description renders, repo link works, video plays, category shown.
- [ ] Screenshot / save the submission confirmation for the record.
- [ ] Keep the repo public and the sandbox demo runnable through the
      judging period (1–15 Dec 2026 PT).
