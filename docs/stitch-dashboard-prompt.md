# Google Stitch Prompt — WHY Agent Dashboard (v3, 5 screens)

Paste the block below into Stitch as-is. Note: I don't have access to your Google Stitch
project — no such connector is available to me — so this is a prompt for you to paste in
yourself; bring back the exported code/screens and I'll wire them to the API.

---

Design a clean, professional fintech dashboard called **"WHY Agent"** for an AI payment-recovery decisioning tool, in Razorpay's brand style — this should look like a real Razorpay internal product, not a generic dashboard template.

**Design system**
- Palette: primary electric blue **#3395FF** for buttons/active states/links, deep navy **#0A2540** for headers and primary text, white **#FFFFFF** card surfaces on a very light cool-grey **#F5F7FA** page background, soft border grey **#E3E8EF** for dividers and card outlines. Semantic colors kept strictly separate from the blue brand accent: green **#1BA672** for recovered/success states, amber **#E8A33D** for pending/gap states, red **#D64545** for fraud/risk states.
- Typography: clean sans-serif (Inter) for UI text and labels; **all ₹ amounts and percentages in a monospace or tabular-figure numeral style, right-aligned in tables** — this one detail is what makes a financial dashboard read as real instead of templated.
- Rounded 8-12px corners on cards, subtle soft shadows (not drop-shadows), no gradients, no clutter, generous but not wasteful whitespace.
- Layout: fixed left sidebar (white, soft right border) with 5 nav items — **Dashboard, Transactions, Evaluation, Rules & Actions, Settings** — active item shown with a blue left-border accent and blue-tinted label, not a filled background. Main content on a clean grid, comfortable margins, max content width around 1200px.
- Tone: trustworthy, auditable, precise — this is a financial decisioning tool, not a consumer app. Avoid playful illustrations; favor data density and clarity over decoration.

---

**Screen 1 — Main Dashboard (list view)**
- Top summary strip: 3 stat cards — "Recovered This Batch" (₹ amount, green accent), "Recovery Rate Lift vs. Naive Baseline" (% with an up arrow, blue accent, small caption "vs. always-retry-after-1h baseline"), "Held-Out Batch Size" (count, navy).
- Below: a table of failed UPI AutoPay payments. Columns: Customer (name + muted customer ID beneath), Amount (₹, right-aligned), Failure Reason (pill: "Insufficient Balance" / "Mandate Expiry" / "Bank Downtime" / "App Uninstall"), Agent Decision (pill: "Retry in 6h" / "Message Customer" / "Hold" / "Give Up"), Status.
- One row highlighted with a red "Fraud Flagged — Hold" pill and a subtle red-tinted left border, showing the agent correctly refusing to retry a risky transaction — this should read as deliberate, not broken.

**Screen 2 — Transaction Deep-Dive (reasoning trace)**
- Header: customer name, amount, failure reason as pills.
- Left/main column: a vertical, connected step-by-step reasoning trail — 5 steps (Classify → Gather Evidence → Decide → Hard Rule Check → Regulatory Timing Check), each step a card in navy text on white with a blue left-border accent, showing what was checked and what was found in plain language, with any real numbers cited (e.g. "immediate retry: 31% success, 6h-delayed retry: 72% success").
- Right column or lower panel: a confidence score as a horizontal progress bar (0-100%, blue fill on a light grey track), and a "Change one detail" panel with dropdowns for Customer Value (Low/Medium/High) and Failure Reason — changing a value visibly re-runs and updates the Decide step live, showing a small "was: X → now: Y" diff callout in amber.
- A prominent blue button: "Ask Why" — opens the live Q&A panel.

**Screen 3 — Live "Why" Q&A panel**
- A right-side slide-in panel (not a modal, so the transaction stays visible underneath), chat-style interface with a text input pinned at the bottom: "Ask why this decision was made…"
- User's question shown plainly; the agent's answer shown as a message in a light blue **#EAF3FF** background with navy text — answers must read as grounded and specific, citing real numbers from the trace (e.g. "72% success rate on a 6-hour delayed retry vs. 31% immediate for this failure reason"), never generic.

**Screen 4 — Evaluation Summary**
- A dedicated results view for the held-out batch, presented as an honest before/after comparison — this screen's whole job is proving the numbers weren't cherry-picked.
- A two-column comparison card: "WHY Agent" vs. "Naive Baseline (always retry after 1h)" — each showing Recovery Rate %, Total ₹ Recovered, and a small note on False-Positive Cost (wasted/annoying retries), agent's column in blue/green accents, baseline's column in muted grey.
- A simple bar or lift indicator visualizing the % lift between the two, labeled plainly (no chart-junk, no 3D, one clear visual).
- A small caption at the bottom: "Held-out batch — decision logic never saw these outcomes before deciding."

**Screen 5 — Rules & Bounded Actions**
- A transparency/config-style screen that shows the agent's constraints as fixed, visible facts — not editable toggles, this proves "bounded and gated" to a viewer at a glance.
- A "Bounded Action List" card listing the only 5 actions the agent can ever take: Retry Now, Retry Later, Message Customer, Hold, Give Up — shown as a fixed set, not a form.
- A "Hard Stopping Rules" list with 4 rows, each a rule name + one-line description: Max 3 Retry Attempts, Fraud/Risk Auto-Escalate, Do-Not-Contact Stop, Cost-Aware Cutoff — each with a small navy icon, no color unless a rule is actively triggered somewhere in the current batch (then show a small amber "triggered N times this batch" tag).
- A "Regulatory Compliance" card noting the RBI pre-debit-notification lead time (24h) and NPCI execution-window constraints the timing logic respects, stated plainly as facts the system enforces, not settings a user can turn off.

---

**Overall tone across all 5 screens:** restrained, numbers-first, zero unnecessary decoration. If in doubt, remove an element rather than add one.
