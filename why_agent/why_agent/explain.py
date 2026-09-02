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

HARD_RULE_PLAIN = {
    "max_retries": "we'd already tried this the max number of times we allow, so we stopped instead of trying again",
    "fraud_escalate": "this account is flagged as high-risk, so we never auto-retry it — it goes to a person to review instead",
    "do_not_contact": "this customer asked not to be contacted, and a silent retry wouldn't fix this anyway, so we stopped",
    "cost_not_worth_it": "this customer isn't valuable enough to justify the cost of retrying or messaging, so we didn't pursue it",
}

COST_TIER_CUTOFF = 0.3

ACTION_PLAIN = {
    "retry_now": "we're retrying it right away",
    "retry_later": "we're waiting a bit before retrying",
    "message_customer": "we're messaging the customer instead of retrying silently",
    "hold": "we're holding rather than acting",
    "give_up": "we're not pursuing this one further",
}


def _find_step(decision: Decision, step_name: str) -> dict | None:
    for step in decision.trace:
        if step.step == step_name:
            return step.detail
    return None


def _plain_reason(decision: Decision, evidence: dict, hard_rule: dict, classify: dict) -> str:
    """A conversational, number-light explanation of the final action — what a
    person would actually say out loud, not a recap of the trace's raw fields."""
    final = ACTION_PLAIN.get(decision.action.value, decision.action.value)

    if hard_rule.get("result") == "fail":
        rule_plain = HARD_RULE_PLAIN.get(hard_rule.get("rule"), hard_rule.get("detail", ""))
        return f"The retry math actually looked fine here, but {rule_plain}. So {final}."

    reason_label = (classify or {}).get("failure_reason", "")
    reason_plain = FAILURE_REASON_PLAIN.get(reason_label, "this kind of failure")
    imm = evidence.get("immediate_retry_success_rate")
    delayed = evidence.get("delayed_6h_retry_success_rate")

    if decision.action == Action.RETRY_LATER:
        return f"Waiting a few hours works noticeably better than retrying right away for this kind of failure, so {final}."
    if decision.action == Action.RETRY_NOW:
        return f"Retrying right away already works well enough here, so there's no real reason to wait — {final}."
    if decision.action == Action.MESSAGE_CUSTOMER:
        return f"A silent retry can't fix this — {reason_plain}, so the customer has to act themselves. That's why we're reaching out instead of quietly retrying."
    if decision.action == Action.HOLD:
        return f"Neither retrying now nor waiting looks likely to work here, so {final} instead of wasting an attempt."
    if imm is not None and delayed is not None:
        return f"Neither retrying now nor waiting looked promising here, so {final}."
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
            return f"For this kind of failure, {comparison}. {_plain_reason(decision, evidence, hard_rule, classify)}"

    if any(k in q for k in ["why", "reason", "decide", "decision"]):
        return _plain_reason(decision, evidence, hard_rule, classify)

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
        return f"This is {tier} customer based on their history. {_plain_reason(decision, evidence, hard_rule, classify)}"

    # Fallback: still plain-English, no raw trace dump
    return _plain_reason(decision, evidence, hard_rule, classify)
