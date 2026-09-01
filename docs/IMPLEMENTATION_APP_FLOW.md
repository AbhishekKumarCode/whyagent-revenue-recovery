# Implementation & App Flow — WHY Agent

**Companion to:** docs/PRD.md, docs/TRD.md · **Deadline:** 2026-09-05 (6 build days from 2026-08-30)

---

## 1. Build Timeline

| Day | Date | Deliverable | Demoable at end of day? |
|---|---|---|---|
| 1 | Aug 30 | Spec lock: fold in RBI-24h correction, NPCI execution windows, name Intelligent Revenue-Protect explicitly in differentiation materials | Docs only |
| 2 | Aug 31 | Synthetic dataset generated (with hidden ground truth) + decision engine v1 (classify → decide) | Yes — CLI/script output of decisions |
| 3 | Sep 1 | Hard stopping rules + regulatory timing layer + simulated execution harness | Yes — full pipeline runs end-to-end |
| 4 | Sep 2 | Held-out batch evaluation vs. naive baseline + reasoning trace persistence + live "why" Q&A | Yes — can answer "why" for any transaction |
| 5 | Sep 3 | Dashboard (list view, deep-dive view, eval summary view) + demo script wiring | Yes — full visual demo |
| 6 | Sep 4 | Rehearse full 7-minute demo script end-to-end; fix whatever breaks | Full dry run |
| — | Sep 5 | Submit | — |

**Principle:** every day ends with something that can be shown, not a day of pure infrastructure with nothing visible.

## 2. App Flow (screens/states)

```
┌─────────────────┐
│  DASHBOARD (home) │
│  ─────────────────│
│  Table: failed      │
│  payments, each row  │
│  showing:              │
│   - amount, customer,    │
│     failure reason         │
│   - agent's decision        │
│     (action + timing)         │
│   - status pill                │
│                                    │
│  Summary strip (top):               │
│   - recovered ₹ vs naive baseline    │
│   - recovery-rate lift %               │
└─────────┬───────────────────────────┘
          │ click a row
          ▼
┌──────────────────────────────┐
│  TRANSACTION DEEP-DIVE          │
│  ─────────────────────────────  │
│  Full reasoning trace, step by    │
│  step:                              │
│   1. classify → failure reason        │
│   2. evidence gathered (history,       │
│      success rates, fraud signal,       │
│      cost/value)                          │
│   3. decision + rationale                   │
│   4. hard-rule check result                  │
│   5. regulatory timing check result           │
│                                                 │
│  [ Ask "why?" ] → opens live Q&A box             │
│  [ Change one detail ] → sliders/toggles for       │
│    customer value, failure reason, fraud flag —      │
│    re-run decision live, show the new outcome           │
└─────────┬───────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────┐
│  LIVE "WHY" Q&A                  │
│  ─────────────────────────────  │
│  Free-text question box            │
│  Answer generated grounded in        │
│  this transaction's reasoning trace   │
│  only — never a scripted response       │
└──────────────────────────────────────┘

┌──────────────────────────────┐
│  EVALUATION SUMMARY              │
│  ─────────────────────────────  │
│  Held-out batch results, full,     │
│  unedited:                           │
│   - recovery rate % (agent vs         │
│     naive baseline)                     │
│   - total ₹ recovered                    │
│   - false-positive cost                    │
│  One fraud-flagged case highlighted:         │
│  agent correctly refuses to retry              │
└──────────────────────────────────────────────┘
```

## 3. Component Breakdown

| Component | Owns | Depends on |
|---|---|---|
| Synthetic data generator | `transaction`, `customer_history` records, hidden ground truth | — |
| Decision engine | classify → gather evidence → decide → hard rules → regulatory timing | synthetic data |
| Simulated execution harness | applies the decision, scores against hidden ground truth (held-out only) | decision engine |
| Reasoning trace store | persists the step-by-step trace per transaction | decision engine |
| Evaluation module | held-out batch scoring, naive baseline comparison | simulated execution harness |
| Dashboard (list + deep-dive + summary) | UI | reasoning trace store, evaluation module |
| Live "why" Q&A | grounded LLM answer over one transaction's trace | reasoning trace store |
| "Change one detail" live re-decision | re-invokes decision engine with a modified input, diffs the outcome | decision engine |

## 4. Demo Script (7 minutes — from WHY_AGENT.md §6, sequenced against the app flow above)

1. **Dashboard** — show the failed-payments list and what the agent decided for each. (~1 min)
2. **Real numbers** — held-out batch: recovered ₹ vs. naive "always retry after 1 hour" baseline, proving genuine improvement. (~1 min)
3. **Deep dive** — pick one transaction, walk the full reasoning trail out loud. (~1.5 min)
4. **Live "why" question** — ask it something not pre-scripted, get a grounded answer. (~1 min)
5. **Change one detail live** — flip customer value from high to low (or the failure reason), watch the decision change in real time. This is the single most important proof-of-reasoning moment — protect the time for it. (~1.5 min)
6. **Fraud-flagged case** — one transaction where the agent correctly refuses to retry. (~1 min)

**Closing line:** *"We don't just recover revenue — we prove it, safely, and every decision can be interrogated."*

**Differentiation beat to insert before the closing line:** name Razorpay's own Intelligent Revenue-Protect explicitly — "that product already does smart retry timing. What it doesn't do is explain itself, decision by decision, on demand. That's what we built."

## 5. Testing Plan

| What | How |
|---|---|
| Hard rules never violated | Run the full held-out batch; assert zero transactions exceed 3 retries, zero DNC-flagged transactions get contacted, zero fraud-flagged transactions retry without escalation |
| Regulatory timing respected | Assert every scheduled retry has a notification timestamp ≥24h prior and an execution timestamp outside blocked peak windows |
| Reasoning trace completeness | Assert every decision has all 5 trace steps present, no transaction reaches a dashboard view with a partial trace |
| Held-out isolation | Assert the decision engine's code path never reads `ground_truth_would_succeed` — enforce via a test that the field is absent from the object the decision engine receives, not just "the logic doesn't use it" |
| Reasoning changes with input | Assert that at least one same-failure-reason pair of transactions with different customer histories reaches different decisions (the explicit proof-of-reasoning requirement) |
| Live Q&A grounding | Spot-check that answers reference actual values from the trace, not generic language |

## 6. Rollout / Presentation Order for Sept 4 Rehearsal

1. Full dry run of the 7-minute script against a fixed demo dataset — timed.
2. Deliberately break one thing (e.g., disconnect the live Q&A) and confirm there's a fallback talking point.
3. Have one team member play "skeptical judge" and ask: "Isn't this just Intelligent Revenue-Protect?" and "Have you validated this with a real merchant?" — rehearse the honest answers from docs/PRD.md §9 and §10.
