# Product Requirements Document — WHY Agent

**Status:** Draft for build · **Track:** AI Revenue Recovery — Razorpay AI Buildathon 2026 · **Deadline:** 2026-09-05
**Sources:** WHY_AGENT.md · docs/idea-hunt-why-agent.md · founder-outputs/pressure-test-output.md · founder-outputs/scope-output.md · docs/deep-research-why-agent.md

---

## 1. Problem Statement

When a recurring UPI AutoPay debit fails for an Indian D2C subscription-box merchant, existing recovery tooling — including Razorpay's own default retry logic and its more advanced "Intelligent Revenue-Protect" product — retries on a schedule but does not explain *why* it chose that schedule, and does not differentiate its reasoning by failure cause in a way the merchant can audit. This matters more than it used to because:

- UPI AutoPay fails 8–15% of debits (vs. 2–3% for card mandates) — a 3–5x higher failure surface than the rail most recovery tooling was designed around.
- Subscription-box (physical recurring commerce) merchants have the worst involuntary-churn exposure of any benchmarked vertical: 10–15% monthly churn, 68% of it failed-payment-driven, up to 30% of total churn.
- RBI's Digital Payments E-mandate Framework 2026 (RBI/DPSS/2026-27/396, issued 2026-04-21) now requires a fresh pre-debit notification at least 24 hours before any retry, plus NPCI-enforced execution windows that block debits during peak hours — real, current constraints that most existing dunning logic has not visibly adapted to.
- Every submission to this buildathon is graded on making financial decisions explainable, showing an audit trail, and reporting honest (not cherry-picked) measured results — explainability is a judging requirement, not a nice-to-have.

**Job to be done:** *"When a UPI AutoPay payment fails for my subscription-commerce business, I want to know the retry was handled the smartest possible way — not just retried and hoped — so I recover revenue I'd otherwise lose to involuntary churn, without annoying customers I could have kept, and without falling foul of the new RBI rules."*

## 2. Goals

1. Decide, for each failed payment, the smartest action from a bounded, safe list — not "retry and hope."
2. Execute that decision in simulation against synthetic data with a hidden ground truth, so results can be honestly measured.
3. Explain any decision, on demand, using the real evidence the agent looked at — not a canned script.
4. Prove the approach beats a naive baseline using a held-out test batch, reported unedited.
5. Model the real regulatory constraints (RBI pre-debit notification timing, NPCI execution windows) explicitly, not just claim compliance.

## 3. Non-Goals (explicit exclusions — do not let scope creep back in)

- No real bank/UPI/payment-gateway integration — synthetic data only.
- No real WhatsApp/SMS/email sending — simulated and logged.
- No login system, multi-tenant accounts, or user management.
- No analytics beyond what the pitch needs.
- No GTM/pricing/business-model build work — optional context only if asked live.
- No coverage of non-UPI payment rails, or non-subscription-box D2C sub-verticals, as first-class demo paths.
- Not attempting to prove firsthand product-market fit — this is a buildathon submission, not a funded company (demand verdict is UNCLEAR by design, and that's an acceptable, labeled starting point at this stage).

## 4. Target User / Persona

**Primary (demo persona):** Ops lead at a 40-person Indian snack/beauty subscription-box brand, ~15,000 active UPI AutoPay subscribers. Measured on subscriber retention and recovered revenue, not technical metrics. Currently relying on whatever default retry logic their payment gateway ships with.

**Real buyer (if this became a product):** Razorpay itself, or a Razorpay merchant with compliance/finance stakeholders who need to justify automated retry decisions to auditors — not just recover money.

## 5. User Stories

| # | As a... | I want... | So that... |
|---|---|---|---|
| 1 | Ops lead | to see every failed payment and what the agent decided to do about it | I understand my recovery pipeline at a glance |
| 2 | Ops lead | to click into one transaction and see the full reasoning trail | I can verify the agent isn't guessing |
| 3 | Ops lead / judge | to ask "why didn't you retry immediately?" live and get a grounded answer | I can trust and audit an autonomous financial decision |
| 4 | Ops lead | to see recovered ₹ vs. a naive baseline, on a held-out batch | I know the tool is genuinely smarter, not just claimed to be |
| 5 | Compliance stakeholder | to see that retries respect the RBI pre-debit-notification window and NPCI execution windows | the business isn't exposed to regulatory risk |
| 6 | Ops lead | to see the agent refuse to retry a fraud-flagged transaction | I trust it won't do something reckless with customer money |
| 7 | Ops lead | to change one input (e.g., customer value) and watch the decision change live | I believe the agent is reasoning, not running a fixed rulebook |

## 6. Functional Requirements

### 6.1 Failure classification
Classify each failed payment into one of: **insufficient balance** (flagship case), mandate expiry, bank downtime, app-uninstall.

### 6.2 Decision engine (bounded action list)
For each failed payment, choose exactly one of: **retry now / retry later / message customer / hold / give up.** No action outside this list is ever permitted.

### 6.3 Hard stopping rules (non-negotiable, always enforced)
- Max 3 retry attempts per failed payment (matches the real NPCI 1-execution + 3-retry cap).
- Auto-escalate to human hold if the fraud/risk signal crosses a set threshold.
- Immediately stop if the customer is flagged do-not-contact.
- Cost-aware cutoff: if a customer's value doesn't justify the retry/messaging cost, explicitly decide "not worth recovering" rather than trying anyway.

### 6.4 Regulatory-timing model
- Enforce the RBI pre-debit-notification lead time: any retry must be preceded by a fresh notification sent ≥24 hours in advance — model this as the actual mechanism, not a flat "wait 24h" rule.
- Enforce NPCI execution windows: no debit attempts during peak hours (e.g., ~10:00 AM); schedule into allowed non-peak windows.

### 6.5 Simulated execution + honest scoring
Execute the chosen action against synthetic transaction data with a hidden ground-truth outcome. Never let the decision logic see the ground truth before deciding.

### 6.6 Evaluation
- Split synthetic data into a demo set (for showing reasoning traces) and a held-out test batch the decision logic was never tuned against.
- Report, on the full held-out batch, unedited: recovery rate %, total simulated ₹ recovered, false-positive cost (wasted/annoying retries).
- Compare against a naive baseline: always retry once, 1 hour later.

### 6.7 Explainability layer
- Every decision produces a persisted reasoning trace: what was checked, what was found, what was decided, confidence level.
- A live "why" Q&A surface answers questions grounded in the real trace data for that transaction — not scripted responses.
- Changing one input for a transaction (e.g., customer value, failure reason) and re-running the decision must visibly change the outcome, proving reasoning over fixed rules.

### 6.8 Dashboard
- List view of failed payments with the agent's decision per row.
- Deep-dive view per transaction showing the full reasoning trail.
- Summary view: recovered ₹ and recovery-rate lift vs. naive baseline on the held-out batch.

## 7. Success Metrics (for the buildathon submission)

| Metric | Target |
|---|---|
| Held-out batch recovery-rate lift vs. naive baseline | Clearly positive and explainable per failure-reason bucket |
| Every decision explainable on demand | 100% — no "black box" answers |
| Hard stopping rules never violated in the held-out batch | 100% compliance |
| Judging rubric coverage (explainability, audit trail, honest measured results) | Full coverage, demonstrated live |

## 8. Kill Criteria (buildathon-appropriate, not "0 paying customers")

If the held-out-batch recovery-rate lift over the naive baseline is not clearly positive and explainable per failure-reason, the niche/differentiation claim collapses back to generic "payment recovery" and the competitive argument (§9 below) weakens. This is the signal to watch, not customer acquisition.

## 9. Competitive Positioning (validated by research — see docs/deep-research-why-agent.md)

| Player | What they ship | Explainability/audit trail |
|---|---|---|
| Razorpay (default) | Fixed T+1/T+2/T+3 retry, same for every failure reason | No |
| **Razorpay — Intelligent Revenue-Protect** | AI-driven retry timing, RBI-compliant scheduling, WhatsApp fallback | **No** |
| Chargebee / Juspay | UPI failure-reason documentation, generic dunning | No |
| Stripe / Recurly / Chargeflow / Butter / FlyCode | Smart retry timing (no UPI/India support found) | No |

**WHY Agent's actual wedge is narrower and sharper than "smart retries": it's the only reason-classified, explainable, audited decision layer found anywhere in this market — including inside Razorpay's own most advanced product.** The pitch must name Intelligent Revenue-Protect directly, not compete against a generic strawman.

## 10. Open Risks

- No firsthand merchant/operator conversation confirms insufficient-balance is the actual dominant failure mode for subscription-box merchants specifically (category-level evidence only) — demand verdict remains UNCLEAR.
- Real-world merchant complaints found skew toward notification/UX ("I didn't know it failed"), adjacent to but not identical to this product's core value prop.
- If a judge is already familiar with Intelligent Revenue-Protect, an undifferentiated pitch reads as redundant — mitigated by naming it explicitly per §9.
