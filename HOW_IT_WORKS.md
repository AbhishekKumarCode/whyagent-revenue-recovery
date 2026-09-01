# How WHY Agent Works — and How to Use It

This is the guide for a first-time reader: what the app does, how the decision-making
actually works under the hood, and a walkthrough of every screen. For the original
pitch/spec see [`WHY_AGENT.md`](WHY_AGENT.md); for run instructions see
[`why_agent/README.md`](why_agent/README.md).

## The problem, in one paragraph

When a UPI AutoPay payment fails (insufficient balance, an expired mandate, bank
downtime, or the customer uninstalling the app), most recovery tooling just retries on
a fixed schedule and hopes. It can't tell you *why* it chose that schedule, doesn't
adapt per customer or failure reason, and increasingly has to respect real RBI/NPCI
timing rules it wasn't designed around. WHY Agent decides the smartest recoverable
action per transaction, actually runs that decision forward to a real outcome, measures
whether it beat a naive "always retry" baseline, and can explain any single decision on
demand — in plain English, grounded in the actual evidence it looked at.

## The decision pipeline

Every failed transaction goes through the same five-step pipeline
(`why_agent/why_agent/engine.py`), and the full trace is visible on the Deep-Dive page
for every transaction — nothing is decided off-screen.

```
1. Classify        → what failure reason is this? (insufficient_balance, mandate_expiry,
                      bank_downtime, app_uninstall)
2. Gather evidence  → this customer's history: months active, on-time payment rate,
                      customer value score, and their retry-success rates (immediate vs.
                      6h-delayed) for this specific failure reason
3. Decide           → pick one of a bounded action list based on that evidence:
                        retry_now · retry_later · message_customer · hold · give_up
4. Hard rule check  → a separate, non-negotiable gate that can only make the outcome
                      MORE conservative, never less (see below) — this always runs
                      after step 3 and can override it
5. Regulatory timing→ if a retry was chosen, schedule it to respect the RBI pre-debit
                      notification window and NPCI-blocked execution hours
```

### Step 3 — how the decision itself is made

The engine compares this customer's historical success rate for an **immediate** retry
vs. a **6-hour-delayed** retry, for this specific failure reason:

- If delayed beats immediate by more than **15 percentage points** *and* delayed clears
  a **50%** worth-it bar → `retry_later`
- Else if immediate already clears the 50% bar → `retry_now`
- Else if the failure reason is `mandate_expiry` or `app_uninstall` (a silent retry can't
  fix either — the customer has to act) → `message_customer`
- Else → `hold` (neither retry path is worth attempting)

This is why two transactions with the *identical* failure reason can get different
decisions — the call depends on that specific customer's own retry-success history, not
a fixed per-reason rule. (See "Ask Why" below to watch this reasoning for any single
transaction.)

### Step 4 — the four hard rules (non-negotiable)

These can only pull the decision toward *more* caution, never less, and they're checked
independently of step 3's reasoning:

| Rule | Trigger | Result |
|---|---|---|
| **Max 3 Retry Attempts** | `attempt_number >= 3` | forces `give_up` — never loops forever |
| **Fraud/Risk Auto-Escalate** | customer flagged as fraud risk | forces `hold` — never auto-retries a flagged account |
| **Do-Not-Contact Stop** | customer opted out *and* the decision was `message_customer` | forces `give_up` — never messages an opted-out customer |
| **Cost-Aware Cutoff** | customer value score < 0.15 *and* the decision would retry/message | forces `give_up` — not worth the attempt cost |

The Settings page shows these live, plus how many times each one actually fired in the
current batch.

### Step 5 — regulatory timing (not just claimed, actually modeled)

- **RBI pre-debit notification**: any scheduled retry must be at least 24 hours after
  notifying the customer — this floor alone usually dominates over whatever "retry in
  Nh" step 3 picked.
- **NPCI execution windows**: retries can't land in blocked hours (10:00–13:00 or
  17:00–21:30) — if the calculated time falls inside one, it's shifted forward to the
  next open slot.

## What's real vs. synthetic

- **Real**: the decision logic above, the hard-rule enforcement, the regulatory timing
  math, the held-out batch evaluation, login/auth (hashed passwords, real sessions), and
  the retry-simulation's outcome logic.
- **Synthetic**: the transaction and customer data itself — generated fresh on every
  backend start (`why_agent/why_agent/data_gen.py`), with realistic Indian names, plan
  tiers, and Razorpay-style transaction IDs, but no real payments or real people. Ground
  truth (whether a retry *would* actually have succeeded) is generated but deliberately
  hidden from the decision engine — it's only read afterward, to score the decision.

## Using the app

### 1. Log in

Open `/app/login`. Either click **"Continue as Demo Reviewer"** (a seeded account,
`demo@razorpay.com` / `demo1234`) or register your own email/password — both are real
accounts (PBKDF2-hashed passwords, server-side sessions), the data behind them is what's
synthetic.

### 2. Dashboard

A batch-level overview: total recovered this run, recovery-rate lift vs. a naive
"always retry once" baseline, which failure reasons are most common, which hard rules
fired and how often, and a **Needs Attention** panel listing every fraud-hold — the
cases the agent refused to touch automatically.

### 3. Transactions

The full searchable, paginated table of every failed payment in this batch, each row
showing the agent's decision. Search by customer name or transaction ID; export to CSV.
Click any row to go to its Deep-Dive.

### 4. Transaction Deep-Dive

The core "prove it" screen for one transaction:

- **Retry Window Simulation** — click **"Simulate Agent's Decision"** to actually play
  the retry window forward (compressed to ~2.4 seconds across 4 visible stages:
  notifying → waiting → retrying → verifying) and reveal the real synthetic outcome —
  recovered or not, and why. Click **"Try Retry Now Instead"** to see what a *different*
  action would honestly have done — including a warning if that override would have
  bypassed a real hard rule (e.g. messaging a do-not-contact customer).
- **Execution Trace** — every one of the 5 pipeline steps above, in one plain-English
  sentence each, with the raw underlying data available behind a "Raw data" toggle if
  you want to verify it yourself.
- **Change one detail (Simulation)** — nudge the customer's value score or the failure
  reason and re-run just step 3 to see whether the decision changes. This is the
  "prove it's reasoning, not a fixed rulebook" moment.
- **Ask Why** — opens a live chat grounded in this exact transaction's full context
  (decision, evidence, hard rules, regulatory constraints). Backed by DeepSeek when an
  API key is configured, with an automatic fallback to a deterministic template if the
  key is missing or the call fails — the chat never goes blank.

### 5. Insights

The honesty check: agent recovery rate and total ₹ recovered vs. the naive baseline, on
a **held-out batch** the decision logic never saw while deciding — plus the same
breakdown per failure reason, and each side's false-positive cost (money spent on
attempts that didn't work).

### 6. Settings

The four hard rules and the bounded action list, in plain language, each with how many
times it actually fired in this batch — plus an explicit note on where the 6-hour
delayed-retry window number comes from (an explicit, documented starting assumption,
not a tuned production value) and a demo-session info card (dataset size, held-out batch
size, whether LLM-backed Q&A is currently enabled).

### 7. Header — session activity & history

The bell icon logs what *you* did this session (simulations you ran, questions you
asked the agent) — not a repeat of the Dashboard. The history icon logs the pages and
transactions *you* personally visited, so you can jump back to where you were.

## Architecture, briefly

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
