# Technical Requirements Document — WHY Agent

**Companion to:** docs/PRD.md · **Scope discipline source:** founder-outputs/scope-output.md

---

## 1. System Overview

```
                    ┌─────────────────────────────────────────┐
                    │           SYNTHETIC DATA STORE           │
                    │  transactions · customer history ·       │
                    │  hidden ground truth (held-out only)      │
                    └───────────────────┬───────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                        DECISION ENGINE                              │
│                                                                       │
│  ① CLASSIFY          ② GATHER EVIDENCE       ③ DECIDE                │
│  failure reason  →   customer history,   →   pick ONE of:            │
│  (insufficient        prior retry            retry now / retry       │
│  balance / mandate    success rates,          later / message /       │
│  expiry / bank         fraud/risk signal,      hold / give up          │
│  downtime / app-        cost-vs-value                                  │
│  uninstall)                                                             │
│                                                                       │
│  ④ HARD RULE CHECK (always runs, can override the decision above)   │
│     - max 3 retries      - fraud threshold → hold                    │
│     - do-not-contact stop - cost-aware "not worth recovering"         │
│                                                                       │
│  ⑤ REGULATORY TIMING CHECK                                           │
│     - RBI: fresh pre-debit notification ≥24h before any retry        │
│     - NPCI: no execution during peak-hour windows                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │     SIMULATED EXECUTION         │
                 │  (no real money, no real APIs)  │
                 │  outcome scored against hidden   │
                 │  ground truth (held-out batch    │
                 │  only — never seen by decision    │
                 │  logic before deciding)            │
                 └───────────────┬───────────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │      DECISION TRACE STORE        │
                 │  what was checked, found,         │
                 │  decided, confidence — persisted  │
                 │  per transaction                   │
                 └───────┬───────────────────┬───────┘
                         │                   │
                         ▼                   ▼
              ┌───────────────────┐ ┌───────────────────────┐
              │     DASHBOARD       │ │   LIVE "WHY" Q&A        │
              │  list + deep-dive   │ │  answers grounded in    │
              │  + eval summary      │ │  the real trace data     │
              └───────────────────┘ └───────────────────────┘
```

## 2. Data Model

### 2.1 `transaction`
| Field | Type | Notes |
|---|---|---|
| `transaction_id` | string | |
| `customer_id` | string | |
| `amount` | number (₹) | |
| `failure_reason` | enum | `insufficient_balance` \| `mandate_expiry` \| `bank_downtime` \| `app_uninstall` |
| `failed_at` | timestamp | |
| `attempt_number` | int | 0 = original attempt |
| `is_held_out` | bool | true = part of the held-out evaluation batch |
| `ground_truth_would_succeed` | bool (held-out only, never exposed to decision logic) | the answer key |

### 2.2 `customer_history`
| Field | Type | Notes |
|---|---|---|
| `customer_id` | string | |
| `months_active` | int | |
| `on_time_payment_rate` | float | |
| `customer_value_score` | float | drives cost-aware cutoff |
| `is_fraud_flagged` | bool | |
| `is_do_not_contact` | bool | |
| `retry_success_by_reason` | map<failure_reason, float> | e.g. "immediate retry on insufficient_balance: 31%, retry after 6h: 72%" |

### 2.3 `decision`
| Field | Type | Notes |
|---|---|---|
| `transaction_id` | string | FK |
| `action` | enum | `retry_now` \| `retry_later` \| `message_customer` \| `hold` \| `give_up` |
| `scheduled_for` | timestamp \| null | only for `retry_later` |
| `reasoning_trace` | object | see §3 |
| `confidence` | float 0–1 | |
| `hard_rule_triggered` | enum \| null | which stopping rule fired, if any |

### 2.4 `evaluation_result` (held-out batch only)
| Field | Type |
|---|---|
| `batch_id` | string |
| `recovery_rate_pct` | float |
| `total_recovered_inr` | number |
| `false_positive_cost_inr` | number |
| `naive_baseline_recovery_rate_pct` | float |
| `lift_pct` | float |

## 3. Reasoning Trace Schema (the explainability core)

```json
{
  "transaction_id": "txn_00123",
  "steps": [
    { "step": "classify", "input": "...", "output": "insufficient_balance" },
    { "step": "gather_evidence", "checked": ["customer_history", "retry_success_rates", "fraud_signal", "cost_vs_value"], "found": { "months_active": 8, "immediate_retry_success": 0.31, "retry_after_6h_success": 0.72 } },
    { "step": "decide", "chosen_action": "retry_later", "scheduled_for": "+6h", "rationale": "6h retry success (72%) far exceeds immediate retry (31%) for this failure reason and customer profile" },
    { "step": "hard_rule_check", "result": "pass", "detail": "attempt 1 of 3, not fraud-flagged, not DNC, value justifies retry" },
    { "step": "regulatory_timing_check", "result": "pass", "detail": "pre-debit notification scheduled 24h+ ahead; execution window is non-peak" }
  ],
  "confidence": 0.83
}
```

This is the object the live "why" Q&A reads from — answers must be generated by grounding on this trace, never a scripted/canned string.

## 4. Decision Logic Detail

### 4.1 Classification
Rule-based or LLM-classified from synthetic failure metadata — deterministic enough to be explainable, not a black-box model. Prefer explicit rules over an opaque classifier here specifically because explainability is graded.

### 4.2 Evidence gathering
Pull `customer_history` for the transaction's customer, plus the failure-reason-specific historical retry-success rates (synthetic, but internally consistent — e.g., insufficient-balance failures should show meaningfully higher success on a delayed retry than an immediate one, reflecting the real-world pattern this project is modeled on).

### 4.3 Decision
A scoring or rule-based policy over the bounded action list. Must be able to reach **different decisions for the same failure reason** given different customer histories (this is the explicit proof-of-reasoning requirement from WHY_AGENT.md §2).

### 4.4 Hard rule layer (runs after, can override step 4.3)
Implement as a final gate, not baked into the scoring — this keeps the stopping rules auditable and independently testable:
1. `attempt_number >= 3` → force `give_up` or `hold`, log `hard_rule_triggered = max_retries`
2. `is_fraud_flagged` above threshold → force `hold`, log `hard_rule_triggered = fraud_escalate`
3. `is_do_not_contact` → force `give_up` (no further contact), log `hard_rule_triggered = do_not_contact`
4. `customer_value_score` below cutoff relative to retry/messaging cost → force `give_up`, log `hard_rule_triggered = cost_not_worth_it`

### 4.5 Regulatory timing layer (runs after 4.4, can only push timing, never the action itself)
- Any `retry_now`/`retry_later` must schedule a synthetic "pre-debit notification" timestamp ≥24h before the retry's execution timestamp.
- Retry execution timestamp must fall outside modeled NPCI peak-hour blocked windows; if the natural schedule lands in a blocked window, shift to the next allowed window and log the shift in the trace.

## 5. Evaluation Harness

1. Partition synthetic data at generation time into `demo_set` and `held_out_batch` (flag via `is_held_out`).
2. Decision logic must never read `ground_truth_would_succeed` — enforce this at the data-access layer (e.g., that field simply isn't included in the object passed to the decision engine), not by convention.
3. After decisions are made for the entire held-out batch, run scoring: compare `action` outcome against `ground_truth_would_succeed`, tally recovery rate, ₹ recovered, false-positive cost.
4. Compute the same tally for a naive baseline policy (always `retry_now` scheduled +1h, no classification, no hard rules beyond a basic retry cap) run over the identical held-out batch.
5. Report both, unedited, side by side. No cherry-picking transactions for the demo set that flatter the result.

## 6. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| No real integrations | No real bank/UPI/payment gateway calls, no real WhatsApp/SMS/email sending — everything simulated and logged |
| Explainability latency | Live "why" Q&A must respond fast enough for a live demo (seconds, not minutes) |
| Determinism for demo transactions | The specific transactions used in the live demo walkthrough should be reproducible run-to-run |
| No auth/multi-tenant | Single demo view, no login system |
| Auditability | Every decision must be traceable end-to-end from raw transaction to final action with no missing steps in the trace |

## 7. Suggested Tech Stack (implementation detail, not prescriptive)

- **Decision engine + evaluation harness:** plain application code (Python or TypeScript) — deliberately not a black-box ML model, since explainability is graded and rule/score-based logic is inherently easier to explain and test.
- **Reasoning trace storage:** simple structured store (JSON files or a lightweight DB) — no need for anything heavier at this scale.
- **Dashboard:** whatever the team is fastest in — this is UI, not the differentiator; don't over-invest here relative to the explainability layer.
- **Live "why" Q&A:** an LLM call grounded strictly on the persisted reasoning trace for the selected transaction (retrieval-style prompting against that JSON object) — not a general-purpose chatbot with open context.

## 8. Explicit Technical Non-Goals

- No real payment gateway SDK integration.
- No production-grade auth, rate limiting, or multi-tenancy.
- No fraud-detection model training — `is_fraud_flagged` is synthetic input data, not a built classifier.
- No horizontal scaling concerns — single-demo-session scale only.
