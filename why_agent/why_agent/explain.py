"""Live "why" Q&A — answers grounded strictly in one transaction's reasoning trace.

Deliberately template-based rather than a free-form LLM call: for a live demo, a
deterministic answer that's always correct beats a fluent one that might hallucinate.
The template selection is itself grounded in trace content, so different questions
about the same transaction surface different real facts from the trace — see
docs/TRD.md §3.

Kept deliberately number-light and conversational — the precise percentages and
thresholds already live in the Decision Audit Trail / Execution Trace panel next to
this chat, so repeating them here just makes the chat read like a systems log. This
file answers the way you'd explain it out loud to a colleague; the trail panel is
where someone goes to check the actual math.
"""
from __future__ import annotations

from .models import Action, Decision

FAILURE_REASON_PLAIN = {
    "insufficient_balance": "the account didn't have enough money at the time",
    "mandate_expiry": "the auto-pay mandate had expired",
    "bank_downtime": "the bank's systems were down",
    "app_uninstall": "the customer had uninstalled the app",
}

# Several phrasings per situation instead of one fixed sentence — picked
# deterministically per transaction (see _pick) so the SAME transaction always
# gets the SAME answer on refresh (still a deterministic template, per the
# module docstring's design principle), but different transactions land on
# different wording instead of every retry_later case reading identically.
HARD_RULE_PLAIN_VARIANTS = {
    "max_retries": [
        "we'd already tried this the max number of times we allow, so we stopped instead of trying again",
        "this one's hit our retry limit — we don't keep hammering away past that, no matter the odds",
        "we're out of allowed attempts on this one, so it stops here rather than trying again",
    ],
    "fraud_escalate": [
        "this account is flagged as high-risk, so we never auto-retry it — it goes to a person to review instead",
        "there's a fraud/risk flag on this account, which always routes to a human review, never an automatic retry",
        "this one's flagged as risky, and flagged accounts always get escalated to a person instead of an auto-retry",
    ],
    "do_not_contact": [
        "this customer asked not to be contacted, and a silent retry wouldn't fix this anyway, so we stopped",
        "this customer's opted out of contact, and since a quiet retry wouldn't have fixed it either, we just stopped",
        "we can't message this customer — they've opted out — and a silent retry wasn't going to help anyway",
    ],
    "cost_not_worth_it": [
        "this customer isn't valuable enough to justify the cost of retrying or messaging, so we didn't pursue it",
        "the cost of chasing this one doesn't pencil out against this customer's value, so we let it go",
        "this account's value score is too low to justify spending a retry or a message on it",
    ],
}

COST_TIER_CUTOFF = 0.3

ACTION_PLAIN_VARIANTS = {
    "retry_now": ["we're retrying it right away", "we're just retrying it immediately", "no delay — retrying now"],
    "retry_later": ["we're waiting a bit before retrying", "we're holding off and retrying a little later", "we're giving it a few hours before trying again"],
    "message_customer": [
        "we're messaging the customer instead of retrying silently",
        "we're reaching out to the customer rather than quietly retrying",
        "we're getting the customer involved instead of a silent retry",
    ],
    "hold": ["we're holding rather than acting", "we're pausing rather than doing anything yet", "this one's on hold for now"],
    "give_up": ["we're not pursuing this one further", "we're closing this one out", "this one's not worth chasing further"],
}


def _pick(txn_id: str, options: list[str]) -> str:
    return options[sum(ord(c) for c in txn_id) % len(options)]


def _find_step(decision: Decision, step_name: str) -> dict | None:
    for step in decision.trace:
        if step.step == step_name:
            return step.detail
    return None


def _plain_reason(decision: Decision, hard_rule: dict, classify: dict) -> str:
    """A conversational, number-light explanation of the final action — what a
    person would actually say out loud, not a recap of the trace's raw fields."""
    txn_id = decision.transaction_id
    final = _pick(txn_id, ACTION_PLAIN_VARIANTS.get(decision.action.value, [decision.action.value]))

    if hard_rule.get("result") == "fail":
        rule_plain = _pick(txn_id, HARD_RULE_PLAIN_VARIANTS.get(hard_rule.get("rule"), [hard_rule.get("detail", "")]))
        opener = _pick(txn_id, [
            "The retry math actually looked fine here, but",
            "On paper this looked retryable, but",
            "The numbers weren't the problem here —",
        ])
        return f"{opener} {rule_plain}. So {final}."

    reason_label = (classify or {}).get("failure_reason", "")
    reason_plain = FAILURE_REASON_PLAIN.get(reason_label, "this kind of failure")

    if decision.action == Action.RETRY_LATER:
        return _pick(txn_id, [
            f"Waiting a few hours works noticeably better than retrying right away for this kind of failure, so {final}.",
            f"This one's worth being patient with — a delayed retry clearly beats an immediate one here, so {final}.",
            f"Retrying immediately wouldn't be the smart move here; waiting first gives it a much better shot, so {final}.",
        ])
    if decision.action == Action.RETRY_NOW:
        return _pick(txn_id, [
            f"Retrying right away already works well enough here, so there's no real reason to wait — {final}.",
            f"This one's straightforward — an immediate retry already clears the bar, so {final}.",
            f"No need to wait on this one; the odds are already good enough right away, so {final}.",
        ])
    if decision.action == Action.MESSAGE_CUSTOMER:
        return _pick(txn_id, [
            f"A silent retry can't fix this — {reason_plain}, so the customer has to act themselves. That's why {final}.",
            f"Retrying quietly won't help here — {reason_plain}. Only the customer can fix that, so {final}.",
            f"This isn't something a retry can solve on its own — {reason_plain}. So {final}, rather than burning a retry attempt on it.",
        ])
    if decision.action == Action.HOLD:
        return _pick(txn_id, [
            f"Neither retrying now nor waiting looks likely to work here, so {final} instead of wasting an attempt.",
            f"The odds aren't good either way — now or later — so {final} rather than guessing.",
            f"This one doesn't clear the bar for retrying now or later, so {final}.",
        ])
    return f"{final.capitalize()}."


def answer(decision: Decision, question: str) -> str:
    q = question.lower()
    evidence = _find_step(decision, "gather_evidence") or {}
    hard_rule = _find_step(decision, "hard_rule_check") or {}
    timing = _find_step(decision, "regulatory_timing_check") or {}
    classify = _find_step(decision, "classify") or {}

    if any(k in q for k in ["fraud", "risk", "suspicious"]):
        if hard_rule.get("rule") == "fraud_escalate":
            return (
                "This account is flagged as high-risk, so we never auto-retry it — it's "
                "escalated to a person to review instead, no matter how good the retry odds looked."
            )
        return "No, nothing about this one raised a fraud or risk flag."

    if any(k in q for k in ["immediate", "right away", "now"]) and "delayed" not in q:
        imm = evidence.get("immediate_retry_success_rate")
        delayed = evidence.get("delayed_6h_retry_success_rate")
        if imm is not None and delayed is not None:
            if delayed - imm >= 0.15:
                comparison = "waiting works meaningfully better than retrying right away"
            elif imm - delayed >= 0.15:
                comparison = "retrying right away works meaningfully better than waiting"
            else:
                comparison = "retrying right away and waiting work about the same"
            return f"For this kind of failure, {comparison}. {_plain_reason(decision, hard_rule, classify)}"

    if any(k in q for k in ["why", "reason", "decide", "decision"]):
        return _plain_reason(decision, hard_rule, classify)

    if any(k in q for k in ["wait", "timing", "24", "notification", "compliant", "rbi", "npci"]):
        if timing.get("result") == "pass":
            note = " It also had to shift slightly to avoid a blocked bank execution window." if timing.get("npci_execution_window_shift_applied") else ""
            return (
                "Indian regulations require the customer be notified at least a day before any "
                "retry actually runs, so the earliest this can execute is bound by that notice period."
                + note
            )
        return "No retry was scheduled for this one, so that timing rule doesn't come into play."

    if any(k in q for k in ["cost", "worth", "value"]):
        value = evidence.get("customer_value_score", 0)
        tier = "a high-value" if value >= 0.6 else "a lower-value" if value < COST_TIER_CUTOFF else "an average-value"
        return f"This is {tier} customer based on their history. {_plain_reason(decision, hard_rule, classify)}"

    # Fallback: still plain-English, no raw trace dump
    return _plain_reason(decision, hard_rule, classify)
