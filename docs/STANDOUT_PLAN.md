# Standout Plan — WHY Agent

**Context:** As of 2026-08-30, at least 17 other AI Revenue Recovery submissions are live on YouTube, several already claiming bounded/gated/audited agents and at least one with a quantified lift number (Recoup: +31.1% vs. hand-written rulebook). The generic "bounded, explainable, audited agent" pitch is now the median submission, not a differentiator. This plan is what's left to actually stand out, prioritized by leverage against 5 remaining build days.

---

## 1. Get a real, defensible number (highest leverage item)

Build the held-out batch evaluation early enough to actually use the result in the pitch. Report **recovery-rate lift % and ₹ recovered vs. a naive 1-hour-retry baseline, unedited, on the full held-out batch** — no retuning the dataset after seeing the number. Target: complete by Sep 2 per the build timeline (`IMPLEMENTATION_APP_FLOW.md`).

## 2. Make the live "why" Q&A genuinely live, not scripted

This is the one differentiator no competitor's description claims. In the pitch video, ask it something not pre-written on camera and let it answer from the real trace data. In the panel round, rehearse fielding a live, unscripted question grounded in the actual JSON trace — a scripted-sounding answer undermines the exact thing this feature is supposed to prove.

## 3. Reorder the pitch: niche first, architecture second

Current framing leads with "bounded, explainable, audited agent." Flip it:
1. **Open (≈20s):** UPI AutoPay fails 3-5x more than card mandates. Subscription-box merchants lose up to 30% of churn to it. RBI's 2026 framework requires 24h advance notification before any retry; NPCI blocks debits during peak hours. Nobody's retry logic accounts for either yet.
2. **Then:** unlike Razorpay's own Intelligent Revenue-Protect, every decision this agent makes, it can explain live, on demand.
3. **Only then:** bounded actions, hard stopping rules, held-out evaluation — as supporting proof, not the headline.

## 4. Name the crowded field explicitly — turn it into a strength

One line in the pitch: *"Most Revenue Recovery submissions will show you bounded actions and an audit trail — that's necessary, not the hard part. The hard part is knowing UPI fails for reasons cards never see, and that a new regulatory rule just made timing a compliance question, not just a UX one."* Preempts the "isn't this the same as everyone else" reaction before it forms.

## 5. Preempt the idempotency objection

Competitor "Revenue Resilience AI" has real exactly-once execution guarantees against double-charging. WHY Agent doesn't need to build this (simulation-only by design), but should say: *"In production this sits behind an idempotency layer — out of scope for a simulated demo, but the decision logic is deterministic given the same inputs, so it's idempotency-safe by construction."* Closes a gap a technical judge might otherwise probe, for ~30 seconds of prep.

## 6. Rehearse the skeptical-judge pass

- **"Isn't this just Intelligent Revenue-Protect?"** → "That product does smart timing. It doesn't explain a single decision on demand. Watch — [ask it why, live]."
- **"Have you validated this with a real merchant?"** → "Category evidence is strong and sourced — subscription-box has the worst involuntary churn of any vertical we benchmarked. Firsthand validation is the honest next step, not something I'm claiming today."

---

## Bottom line

The idea doesn't need more validation or more docs — it needs a working number and a live demo moment that actually lands. Everything from here is execution, not strategy.
