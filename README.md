# WHY Agent

**Razorpay AI Buildathon 2026 — AI Revenue Recovery track.**

An AI agent that decides how to recover a failed UPI AutoPay payment, actually executes that
decision (in simulation), measures whether it worked against a held-out synthetic batch, and can
explain — live, on demand — exactly why it made each call. Not a black box, and not a static demo:
you can run the retry window forward and watch the real (synthetic) outcome resolve.

## Quickest path to seeing it work

```bash
cd why_agent
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd frontend-react && npm install && npm run build && cd ..
.venv/bin/uvicorn why_agent.api:app --port 8000
```
Open `http://localhost:8000/app/login` → **Continue as Demo Reviewer** (a seeded account,
`demo@razorpay.com` / `demo1234`), or register your own email/password — both are real accounts
(PBKDF2-hashed passwords, server-side sessions); it's the transaction data behind them that's
synthetic. See [`why_agent/README.md`](why_agent/README.md) for dev mode, tests, and the optional
DeepSeek Q&A setup.

## The problem, in one paragraph

When a UPI AutoPay payment fails (insufficient balance, an expired mandate, bank downtime, or the
customer uninstalling the app), most recovery tooling just retries on a fixed schedule and hopes.
It can't tell you *why* it chose that schedule, doesn't adapt per customer or failure reason, and
increasingly has to respect real RBI/NPCI timing rules it wasn't designed around. WHY Agent decides
the smartest recoverable action per transaction, actually runs that decision forward to a real
outcome, measures whether it beat a naive "always retry" baseline, and can explain any single
decision on demand — in plain English, grounded in the actual evidence it looked at.

## The decision pipeline

Every failed transaction goes through the same five-step pipeline
(`why_agent/why_agent/engine.py`), and the full trace is visible on the Deep-Dive page for every
transaction — nothing is decided off-screen.

```
1. Classify        → what failure reason is this? (insufficient_balance, mandate_expiry,
                      bank_downtime, app_uninstall)
2. Gather evidence  → this customer's history: months active, on-time payment rate,
                      customer value score, and their retry-success rates (immediate vs.
                      6h-delayed) for this specific failure reason
3. Decide           → pick one of a bounded action list based on that evidence:
                        retry_now · retry_later · message_customer · hold · give_up
4. Hard rule check  → a separate, non-negotiable gate that can only make the outcome
                      MORE conservative, never less (see below) — always runs after step
                      3 and can override it
5. Regulatory timing→ if a retry was chosen, schedule it to respect the RBI pre-debit
                      notification window and NPCI-blocked execution hours
```

### Step 3 — how the decision itself is made

The engine compares this customer's historical success rate for an **immediate** retry vs. a
**6-hour-delayed** retry, for this specific failure reason:

- If delayed beats immediate by more than **15 percentage points** *and* delayed clears a **50%**
  worth-it bar → `retry_later`
- Else if immediate already clears the 50% bar → `retry_now`
- Else if the failure reason is `mandate_expiry` or `app_uninstall` (a silent retry can't fix
  either — the customer has to act) → `message_customer`
- Else → `hold` (neither retry path is worth attempting)

This is why two transactions with the *identical* failure reason can get different decisions — the
call depends on that specific customer's own retry-success history, not a fixed per-reason rule.
(See "Ask Why" below to watch this reasoning for any single transaction.)

### Step 4 — the four hard rules (non-negotiable)

These can only pull the decision toward *more* caution, never less, checked independently of step
3's reasoning:

| Rule | Trigger | Result |
|---|---|---|
| **Max 3 Retry Attempts** | `attempt_number >= 3` | forces `give_up` — never loops forever |
| **Fraud/Risk Auto-Escalate** | customer flagged as fraud risk | forces `hold` — never auto-retries a flagged account |
| **Do-Not-Contact Stop** | customer opted out *and* the decision was `message_customer` | forces `give_up` — never messages an opted-out customer |
| **Cost-Aware Cutoff** | customer value score < 0.15 *and* the decision would retry/message | forces `give_up` — not worth the attempt cost |

The Settings page shows these live, plus how many times each one actually fired in the current
batch.

### Step 5 — regulatory timing (not just claimed, actually modeled)

- **RBI pre-debit notification**: any scheduled retry must be at least 24 hours after notifying
  the customer — this floor alone usually dominates over whatever "retry in Nh" step 3 picked.
- **NPCI execution windows**: retries can't land in blocked hours (10:00–13:00 or 17:00–21:30) —
  if the calculated time falls inside one, it's shifted forward to the next open slot.

## What's real vs. synthetic

- **Real**: the decision logic above, the hard-rule enforcement, the regulatory timing math, the
  held-out batch evaluation, login/auth (hashed passwords, real sessions), and the
  retry-simulation's outcome logic.
- **Synthetic**: the transaction and customer data itself — generated fresh on every backend start
  (`why_agent/why_agent/data_gen.py`), with realistic Indian names, plan tiers, and Razorpay-style
  transaction IDs, but no real payments or real people. Ground truth (whether a retry *would*
  actually have succeeded) is generated but deliberately hidden from the decision engine — it's
  only read afterward, to score the decision.

## Using the app

**Dashboard** — batch-level overview: total recovered, recovery-rate lift vs. a naive baseline,
failure-reason breakdown, hard-rule trigger counts, and a **Needs Attention** panel of every fraud
hold.

**Transactions** — the full searchable, paginated table of every failed payment, each row showing
the agent's decision. Search by name or ID; export to CSV. Click a row for its Deep-Dive.

**Transaction Deep-Dive** — the core "prove it" screen:
- **Retry Window Simulation** — click **"Simulate Agent's Decision"** to actually play the retry
  window forward (~2.4s across 4 visible stages: notifying → waiting → retrying → verifying) and
  reveal the real synthetic outcome. Click **"Try Retry Now Instead"** to see what a *different*
  action would honestly have done — including a warning if it would bypass a real hard rule.
- **Execution Trace** — all 5 pipeline steps in one plain-English sentence each, with raw
  underlying data behind a "Raw data" toggle.
- **Change one detail (Simulation)** — nudge the customer's value score or failure reason and
  re-run step 3 to see whether the decision changes — proof it's reasoning, not a fixed rulebook.
- **Ask Why** — a live chat grounded in this transaction's full context. DeepSeek-backed when an
  API key is configured, with an automatic fallback to a deterministic template so it never goes
  blank.

**Insights** — agent recovery rate and ₹ recovered vs. the naive baseline, on a **held-out batch**
the decision logic never saw while deciding — plus the same breakdown per failure reason, and each
side's false-positive cost.

**Settings** — the four hard rules and the bounded action list in plain language with live trigger
counts, plus an explicit note on where the 6-hour delayed-retry window comes from (a documented
starting assumption, not a tuned production value).

**Header — session activity & history** — the bell logs what *you* did this session (simulations
run, questions asked), the history icon logs pages/transactions *you* visited — neither repeats the
Dashboard's data feed.

## Architecture

```
why_agent/why_agent/
  data_gen.py     synthetic dataset generator (hidden ground truth)
  engine.py       the 5-step decision pipeline described above
  evaluate.py     held-out batch scoring vs. naive baseline (only place ground truth is read)
  explain.py      deterministic "why" Q&A fallback
  llm_explain.py  DeepSeek-backed "why" Q&A (optional)
  auth.py         real auth: sqlite users, salted password hashing, server sessions
  api.py          FastAPI endpoints + serves the built React app
why_agent/frontend-react/   React + Vite + Tailwind, Razorpay-branded UI
```

## Repository layout

```
README.md    — this file
WHY_AGENT.md — original idea/spec
docs/        — PRD, TRD, implementation flow, standout plan, design research
why_agent/   — the actual application (Python FastAPI backend + React frontend)
  README.md  — run instructions, login, tests
```
