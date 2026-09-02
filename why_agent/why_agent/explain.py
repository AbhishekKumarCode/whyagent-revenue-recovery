"""Live "why" Q&A — answers grounded strictly in one transaction's reasoning trace.

Deliberately template-based rather than a free-form LLM call: for a live demo, a
deterministic answer that's always correct beats a fluent one that might hallucinate.
The template selection is itself grounded in trace content, so different questions
about the same transaction surface different real numbers from the trace — see
docs/TRD.md §3.
"""
from __future__ import annotations

from .models import Decision


def _find_step(decision: Decision, step_name: str) -> dict | None:
    for step in decision.trace:
        if step.step == step_name:
            return step.detail
    return None


def _rationale_with_override_note(decide_detail: dict, hard_rule: dict, final_action: str) -> str:
    """The `decide` step's rationale describes what the retry-timing logic alone
    would pick — but a hard rule can block that outcome afterward (see
    docs/TRD.md §4.4). Never surface the pre-override rationale as if it were
    the final decision; always state the final action plainly when a rule fired."""
    base = decide_detail.get("rationale", "")
    if hard_rule.get("result") == "fail":
        return (
            f"By the numbers, '{decide_detail.get('chosen_action')}' looked right — {base}. "
            f"But a fixed rule blocks it here: {hard_rule.get('detail', '')}. "
            f"Final action: {final_action}."
        )
    return base


def answer(decision: Decision, question: str) -> str:
    q = question.lower()
    evidence = _find_step(decision, "gather_evidence") or {}
    decide_detail = _find_step(decision, "decide") or {}
    hard_rule = _find_step(decision, "hard_rule_check") or {}
    timing = _find_step(decision, "regulatory_timing_check") or {}

    if any(k in q for k in ["fraud", "risk", "suspicious"]):
        if hard_rule.get("rule") == "fraud_escalate":
            return (
                "This customer's fraud/risk signal is flagged, so the hard stopping rule "
                "overrode whatever the retry logic would have chosen and escalated to a "
                "human hold instead — the agent never auto-retries a flagged transaction."
            )
        return "This transaction wasn't fraud-flagged, so the fraud escalation rule didn't apply here."

    if any(k in q for k in ["immediate", "right away", "now"]):
        imm = evidence.get("immediate_retry_success_rate")
        delayed = evidence.get("delayed_6h_retry_success_rate")
        if imm is not None and delayed is not None:
            return (
                f"Immediate retry succeeds {imm:.0%} of the time for this failure reason and "
                f"customer history, versus {delayed:.0%} if we wait 6 hours instead. "
                f"{_rationale_with_override_note(decide_detail, hard_rule, decision.action.value)}"
            )

    if any(k in q for k in ["why", "reason", "decide", "decision"]):
        if decide_detail:
            return _rationale_with_override_note(decide_detail, hard_rule, decision.action.value) or "No rationale recorded for this decision."

    if any(k in q for k in ["wait", "timing", "24", "notification", "compliant", "rbi", "npci"]):
        if timing.get("result") == "pass":
            return (
                f"A pre-debit notification would go out at {timing.get('notification_sent_at')}, "
                f"and RBI's e-mandate rules require at least {timing.get('pre_debit_notification_lead_hours')} "
                f"hours' notice before any retry executes — so the earliest this can run is "
                f"{timing.get('execution_scheduled_at')}."
                + (" That time was also shifted to respect an NPCI peak-hour execution window." if timing.get("npci_execution_window_shift_applied") else "")
            )
        return "No retry was scheduled for this transaction, so no timing constraint applies."

    if any(k in q for k in ["cost", "worth", "value"]):
        value = evidence.get("customer_value_score")
        if value is not None:
            return f"This customer's value score is {value:.2f}. {_rationale_with_override_note(decide_detail, hard_rule, decision.action.value)}"

    # Fallback: surface the full rationale + confidence rather than a generic non-answer
    return (
        f"Decision: {decision.action.value} (confidence {decision.confidence:.0%}). "
        f"{_rationale_with_override_note(decide_detail, hard_rule, decision.action.value)}"
    )
