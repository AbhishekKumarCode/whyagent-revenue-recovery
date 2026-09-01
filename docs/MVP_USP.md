# WHY Agent — MVP & USP (Simple Version)

---

## MVP — the smallest version that still proves the idea

Build only these 5 things. If you removed any one, the demo would stop
proving the point.

1. **A small test dataset** — about 20-25 made-up failed payments,
   each one different (different reasons, different customers)
2. **The agent's core loop** — look at the failure, check the
   customer, check what's worked before, pick one safe action, and
   "run" it against a known correct answer so we can check if it
   worked
3. **A simple dashboard** — a table showing each payment, what the
   agent decided, and the key numbers (how much was recovered, vs. a
   basic "just retry once" approach)
4. **A live "why" chat** — someone can ask the agent a real question
   and get a real, live answer (not pre-written)
5. **An honest README** — explains how we tested it fairly (using
   data the agent never saw the answers to), not just showing our
   best examples

### Skip for now (add back only if time is left)
- The "what if this customer was different" live toggle feature
- Real payment gateway connection
- Real WhatsApp/email sending
- Login system / multiple accounts
- Extra analytics/charts beyond the key numbers

**Simple test:** could you cut it and still prove "this agent thinks,
and you can check its work"? If yes, cut it.

---

## USP — the one thing that makes us different

> **"Other recovery bots tell you what they did.
> Ours tells you why — and proves it live, on data it's never seen before."**

Three reasons this matters, most important first:

1. **You can ask it live, and it really answers.**
   No other payment recovery tool we found lets you interrupt it and
   ask "why did you do that?" and get a real answer built on the
   spot. Most just execute and move on.

2. **We show the real numbers, good and bad.**
   Most hackathon projects only show their best examples. We test on
   data the agent has never seen, and report the full result —
   wins and losses both. That's exactly what Razorpay's rules ask
   every team to do, and most teams probably won't bother.

3. **We're not fighting Razorpay's own tool — we're fixing its
   biggest weakness.**
   Razorpay already has a bot that retries payments. It doesn't
   explain itself. We're the missing piece that makes automation
   like theirs something a finance team can actually trust.

### One thing to keep in mind
The "retry a failed payment" part is not special — everyone does
that, including Razorpay already. **The explaining and proving part
is our whole edge.** Don't spend more demo time on "we retry
payments" than on "we show and prove exactly why."
