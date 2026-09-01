# WHY Agent

**Track:** AI Revenue Recovery — Razorpay AI Buildathon 2026
**Deadline:** September 5, 2026

> An AI agent that decides how to recover failed payments, actually tries it, measures whether it worked, and can explain exactly why it made each call — instead of being a black box.

---

## TL;DR

When a payment fails, most recovery tools just retry it and hope. **WHY Agent decides the smartest way to retry it, actually executes that decision (in simulation), proves with real numbers that it worked, and can explain — live, on demand — exactly why it made that choice.**

---

## 1. The Problem

A payment fails — card declined, UPI timeout, insufficient funds, whatever. Now someone has to decide what to do:

| Mistake | What happens |
|---|---|
| Retry too soon | Fails again, wastes a retry attempt |
| Wrong channel/timing | Customer ignores the nudge |
| Over-contact a low-value customer | They churn anyway, and you annoyed them for nothing |

This isn't a small problem. Failed payments cost businesses an estimated **$129 billion a year** globally. Done well, AI-driven recovery can save **60–80%** of that — done badly (blind retry-only logic), it saves closer to 20–30%.

---

## 2. What the Agent Actually Does

Walk through one real example: a customer's **₹999 subscription payment fails.**

```
1. LOOK AT IT
   "Insufficient funds — not a stolen card, not a glitch."

2. CHECK THE CUSTOMER
   "8 months of on-time payments. Valuable customer, worth the effort."

3. CHECK WHAT'S WORKED BEFORE
   "Immediate retry on this failure type: 31% success.
    Retry after 6 hours: 72% success."

4. DECIDE
   "Wait 6 hours, then auto-retry. Don't message the customer yet."

5. EXECUTE (simulated — no real money touched)
   Run it against test data where the true outcome is already known,
   so we can honestly check: did it actually work?

6. WRITE DOWN WHY
   Every decision leaves a paper trail — what it checked, what it
   found, what it decided, how confident it was.

7. ANSWER "WHY?" ON DEMAND
   Ask it live: "Why didn't you retry immediately?"
   It answers using the real data it looked at — not a canned script.
```

Same failure type, different customer history → the agent can reach a **different decision**. That's the proof it's reasoning, not running a fixed rulebook.

---

## 3. Why This Idea (Not Just Another Retry Bot)

Razorpay already ships their own agent that retries failed payments and sends nudges. Building a copy of that means competing with something they've already built — and losing.

What their public agent **doesn't** show: its reasoning. It acts, but it doesn't explain itself.

More importantly — I checked Razorpay's **official competition rules**, and every submission is required to:

- Make every money-related action **explainable**
- Show an **audit trail** (a record of what it did and why)
- Report **honest, measured results** on real test data — no cherry-picked best cases

So explainability isn't a bonus feature here — it's literally what every applicant is being graded on. WHY Agent does the recovery job **and** does the explaining well, which most competing projects likely won't manage.

---

## 4. How It's Built (plain terms)

```
Failed payment
      │
      ▼
 ┌─────────────────────────────┐
 │  AGENT looks things up:      │
 │  - why it failed             │
 │  - who the customer is       │
 │  - what's worked before      │
 │  - any fraud/risk red flags  │
 └─────────────────────────────┘
      │
      ▼
 ┌─────────────────────────────┐
 │  AGENT decides (from a       │
 │  fixed, safe list of         │
 │  options):                   │
 │  retry now / retry later /   │
 │  message customer / hold /   │
 │  give up                     │
 └─────────────────────────────┘
      │
      ▼
 ┌─────────────────────────────┐
 │  Simulated execution +       │
 │  honest scorekeeping         │
 │  (did it actually work?)     │
 └─────────────────────────────┘
      │
      ▼
 ┌─────────────────────────────┐
 │  Decision paper trail saved  │
 │  → dashboard + live "why"    │
 │    chat can both read it     │
 └─────────────────────────────┘
```

The agent only ever picks from a **fixed, safe list of actions** (never invents something risky on its own), and has hard stopping rules — that's the "bounded and gated" part Razorpay's rules specifically ask for. The actual limits:

- **Max 3 retry attempts** per failed payment, then it stops and escalates instead of looping forever
- **Auto-escalate to human hold** if the fraud/risk signal crosses a set threshold — never blindly retries something that looks suspicious
- **Immediately stops** if a customer is flagged do-not-contact
- **Cost-aware cutoff**: if a customer's value is too low to justify the retry/messaging cost, the agent explicitly decides "not worth recovering" instead of trying anyway

---

## 5. Proving It Honestly (Evaluation Methodology)

Razorpay's rules require **measured results on held-out test sets — no cherry-picked examples.** Here's how WHY Agent honors that:

- The synthetic dataset is split into two parts: a **demo set** (used to show reasoning traces in the UI) and a **held-out test batch** the agent's decision logic was never tuned against.
- Every transaction in the held-out batch has a hidden ground-truth outcome (would this retry have actually worked or not) — like an answer key the agent doesn't get to see while deciding.
- We report the **full held-out batch result**, not just the wins: recovery rate %, total simulated ₹ recovered, and **false-positive cost** (retries attempted that were predictably going to fail, wasting effort or annoying the customer).
- These numbers are compared against a **naive baseline** (always retry once, 1 hour later) so the improvement is provable, not just claimed.

This is the difference between "trust me, it works" and "here's the batch result, unedited."

---

## 6. The Demo — What Makes It Land

1. **Dashboard** of failed payments, showing what the agent decided for each
2. **Real numbers**: how much was recovered (simulated) vs. a naive "always retry after 1 hour" approach — proving it's genuinely smarter
3. **One transaction, deep dive**: full reasoning trail shown clearly
4. **Live "why" question**, answered on the spot using real data — not scripted
5. **Change one detail live** (e.g. "what if this customer had low value instead of high?") and watch the decision change in real time
6. **One fraud-flagged case** where the agent correctly refuses to retry — proving it knows when to stop

Closing line: *"We don't just recover revenue — we prove it, safely, and every decision can be interrogated."*

---

## 7. What We're Deliberately NOT Building

To stay realistic before the deadline:

- ❌ No real connection to actual banks/payment systems — realistic **pretend (synthetic)** data only
- ❌ No real WhatsApp/email/SMS sending — simulated and logged instead
- ❌ No login system or multiple business accounts — one demo view is enough
- ❌ No analytics beyond the numbers that actually matter for the pitch

---

## 8. Market, Scalability & Revenue Potential

*(Not required for the buildathon submission itself — but worth understanding, since "does this create real value" is part of what Razorpay is evaluating, and it's the honest answer to "could this be a real product.")*

### Market size — the problem is genuinely big
**[Sourced fact]** Failed subscription payments cost businesses an estimated **$129 billion in 2025** (industry-wide estimate closer to **$440 billion/year** including all involuntary churn). Involuntary churn — payments that failed and were never recovered — is **20–40% of all customer loss** for subscription businesses. AI-driven recovery tools already recover **60–80%** of failed payments vs. 20–30% for basic retry-only logic. This is not a niche problem; it's a standing leak in every subscription/recurring-payment business.

### Existing market validation — real companies already sell this
**[Sourced fact]** Recurly, Butter Payments, Chargeflow, and FlyCode all sell "recover failed payments" as a paid product today — several on a **percentage-of-revenue-recovered** pricing model (you only pay when they actually recover money for you). Recurly alone recovered **$214 million** in one year through dunning automation. This proves the category is fundable and monetizable, not speculative.

### Where WHY Agent specifically fits
**[Inference]** The explainability/audit layer is the part none of those existing vendors visibly sell — most are pure execution tools (retry + nudge), not interrogatable ones. If built out past the hackathon, WHY Agent's angle would be: **"the recovery tool finance and compliance teams can actually trust and audit,"** not just another retry bot. That's a real wedge, especially as more of this becomes autonomous AI agents making financial decisions — the more autonomy, the more auditability matters.

### Scalability of the approach
**[Inference]** The core design generalizes past payment retries with very little rework, because the pattern (gather evidence → decide from a bounded action set → execute → explain) doesn't change:
- **Checkout abandonment** recovery (same reasoning pattern, different trigger)
- **Overdue B2B receivables** (same reasoning pattern, applied to invoices instead of subscriptions)
- **Other geographies** — the India-specific piece (UPI/e-mandate failure patterns) is a wedge, not a ceiling; the same architecture works for any market's payment-failure taxonomy
- Razorpay's own track description literally lists all three (payment failures, checkout abandonment, overdue receivables) as one track — so this scalability path is already the direction they're pointing you toward, not a stretch you'd have to invent.

### Revenue potential, if this became a real product
**[Inference — illustrative, not a forecast]** Following the existing market's pricing pattern (Butter/FlyCode-style, % of revenue actually recovered — typically cited in the 5–20% range for this category), a tool recovering even a modest slice of a $129B+ annual problem has a large addressable revenue pool. The realistic version of this claim for your pitch: **don't quote a specific ₹/$ revenue projection you can't back up** — instead say "this follows the same proven monetization model as Recurly/Chargeflow/Butter, applied to a segment (auditable, agent-driven recovery) none of them currently serve well."

### The honest caveat
**[Inference]** None of this is required to win the buildathon — the judges are scoring your working demo against their rubric, not a business plan. But if asked "could this be a real product," the answer is a genuine yes, and now you have the evidence to say why instead of just asserting it.

---

## 9. One Sentence, for Anyone

> "When a payment fails, most AI tools just retry it and hope. Ours decides the smartest way to retry it, actually tries it, proves with real numbers that it worked, and can explain exactly why it made that choice — like a smart, honest assistant instead of a robot that just does things without telling you why."
