"""Decision engine — classify -> gather evidence -> decide -> hard rules -> regulatory timing.

See docs/TRD.md §4 for the layer-by-layer spec this implements. Deliberately rule-based,
not an opaque model: explainability is graded, and rule-based logic is inherently easier
to explain and test than a black box.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from .models import Action, CustomerHistory, Decision, HardRule, Transaction, TraceStep

# --- tunable thresholds (kept as named constants so the trace can cite them) ---
DELAYED_RETRY_ADVANTAGE_THRESHOLD = 0.15  # delayed must beat immediate by this much to prefer waiting
RETRY_WORTH_IT_THRESHOLD = 0.5  # below this, neither immediate nor delayed retry is worth attempting
FRAUD_RISK_THRESHOLD = True  # customer.is_fraud_flagged is already boolean in this synthetic model
COST_VALUE_CUTOFF = 0.15  # customer_value_score below this -> not worth recovering
MAX_RETRY_ATTEMPTS = 3
RETRY_COST_INR = 6.0  # synthetic cost of a wasted retry/messaging attempt (false-positive cost)

# NOT a tuned production parameter — a named, explicit placeholder for "same business
# cycle, not an immediate retry" (the working hypothesis being that insufficient-balance
# failures often resolve on a salary-credit/top-up cycle). In production this would be
# learned per-bank/per-segment from real retry-outcome telemetry, not a fixed constant.
# It is also largely superseded in practice by PRE_DEBIT_NOTIFICATION_LEAD_HOURS below:
# the RBI notification floor already pushes any real retry out to >=24h regardless of
# this value, so this constant mainly affects internal decision-preference ordering
# (retry_later vs retry_now), not the actual execution timestamp.
DELAYED_RETRY_WINDOW_HOURS = 6.0

# RBI Digital Payments E-mandate Framework 2026 — see docs/deep-research-why-agent.md
PRE_DEBIT_NOTIFICATION_LEAD_HOURS = 24
# NPCI execution windows — allowed hours (24h clock), blocked otherwise
BLOCKED_WINDOWS = [(10, 13), (17, 21.5)]


def _classify(txn: Transaction) -> TraceStep:
    return TraceStep(
        step="classify",
        detail={"failure_reason": txn.failure_reason.value},
    )


def _gather_evidence(txn: Transaction, customer: CustomerHistory) -> TraceStep:
    rates = customer.retry_success_by_reason[txn.failure_reason.value]
    return TraceStep(
        step="gather_evidence",
        detail={
            "checked": [
                "customer_history",
                "retry_success_rates",
                "fraud_signal",
                "cost_vs_value",
            ],
            "months_active": customer.months_active,
            "on_time_payment_rate": customer.on_time_payment_rate,
            "customer_value_score": customer.customer_value_score,
            "immediate_retry_success_rate": round(rates["immediate"], 3),
            "delayed_6h_retry_success_rate": round(rates["delayed_6h"], 3),
            "is_fraud_flagged": customer.is_fraud_flagged,
            "is_do_not_contact": customer.is_do_not_contact,
        },
    )


def _decide(txn: Transaction, customer: CustomerHistory) -> tuple[Action, float | None, float, TraceStep]:
    """Returns (action, scheduled_for_hours, confidence, trace_step). Ignores hard rules —
    those are applied as a separate, auditable layer afterward."""
    rates = customer.retry_success_by_reason[txn.failure_reason.value]
    immediate, delayed = rates["immediate"], rates["delayed_6h"]

    if delayed - immediate >= DELAYED_RETRY_ADVANTAGE_THRESHOLD and delayed >= RETRY_WORTH_IT_THRESHOLD:
        action, hours, confidence = Action.RETRY_LATER, DELAYED_RETRY_WINDOW_HOURS, delayed
        rationale = (
            f"{DELAYED_RETRY_WINDOW_HOURS:g}h-delayed retry success ({delayed:.0%}) exceeds immediate retry "
            f"({immediate:.0%}) by more than the {DELAYED_RETRY_ADVANTAGE_THRESHOLD:.0%} threshold — waiting is the smarter call"
        )
    elif immediate >= RETRY_WORTH_IT_THRESHOLD:
        action, hours, confidence = Action.RETRY_NOW, None, immediate
        rationale = f"Immediate retry success ({immediate:.0%}) already clears the {RETRY_WORTH_IT_THRESHOLD:.0%} bar — no reason to wait"
    elif txn.failure_reason.value in ("mandate_expiry", "app_uninstall"):
        action, hours, confidence = Action.MESSAGE_CUSTOMER, None, 1 - max(immediate, delayed)
        reason_label = txn.failure_reason.value.replace("_", " ")
        article = "an" if reason_label[0] in "aeiou" else "a"
        rationale = (
            f"Neither immediate ({immediate:.0%}) nor delayed ({delayed:.0%}) retry clears the "
            f"{RETRY_WORTH_IT_THRESHOLD:.0%} worth-it bar for {article} {reason_label} failure — a silent "
            "retry won't fix an expired mandate or a deleted app, the customer needs to act"
        )
    else:
        action, hours, confidence = Action.HOLD, None, 1 - max(immediate, delayed)
        rationale = f"Both immediate ({immediate:.0%}) and delayed ({delayed:.0%}) retry success are below the {RETRY_WORTH_IT_THRESHOLD:.0%} worth-it bar — holding rather than wasting an attempt"

    return action, hours, confidence, TraceStep(
        step="decide",
        detail={"chosen_action": action.value, "scheduled_for_hours": hours, "rationale": rationale},
    )


def violated_hard_rule(txn: Transaction, customer: CustomerHistory, action: Action) -> HardRule | None:
    """Which hard rule (if any) a *specific* action would violate for this txn/customer —
    independent of whatever the decision pipeline itself proposed. Used both by
    _apply_hard_rules below (checking the pipeline's own proposed action) and by the
    /execute endpoint's override path (checking a caller-supplied action), so an
    override that quietly violates a rule the pipeline would have blocked is never
    reported as bypass-free just because the pipeline happened to propose something else."""
    if txn.attempt_number >= MAX_RETRY_ATTEMPTS and action != Action.GIVE_UP:
        return HardRule.MAX_RETRIES
    if customer.is_fraud_flagged and action != Action.HOLD:
        return HardRule.FRAUD_ESCALATE
    if customer.is_do_not_contact and action == Action.MESSAGE_CUSTOMER:
        return HardRule.DO_NOT_CONTACT
    if customer.customer_value_score < COST_VALUE_CUTOFF and action in (
        Action.RETRY_NOW,
        Action.RETRY_LATER,
        Action.MESSAGE_CUSTOMER,
    ):
        return HardRule.COST_NOT_WORTH_IT
    return None


def _apply_hard_rules(
    txn: Transaction,
    customer: CustomerHistory,
    proposed_action: Action,
    proposed_hours: float | None,
) -> tuple[Action, float | None, HardRule | None, TraceStep]:
    """Non-negotiable gate — can only make the outcome MORE conservative, never less.
    See docs/PRD.md §6.3 for the four rules this enforces."""
    triggered = violated_hard_rule(txn, customer, proposed_action)

    if triggered == HardRule.MAX_RETRIES:
        action, hours = Action.GIVE_UP, None
        detail = {"result": "fail", "rule": "max_retries", "detail": f"attempt {txn.attempt_number} >= max {MAX_RETRY_ATTEMPTS}"}
    elif triggered == HardRule.FRAUD_ESCALATE:
        action, hours = Action.HOLD, None
        detail = {"result": "fail", "rule": "fraud_escalate", "detail": "customer fraud/risk signal is flagged — escalating to human hold, never auto-retrying"}
    elif triggered == HardRule.DO_NOT_CONTACT:
        action, hours = Action.GIVE_UP, None
        detail = {"result": "fail", "rule": "do_not_contact", "detail": "customer is flagged do-not-contact — cannot message, and a silent retry wouldn't fix this failure reason, so give up"}
    elif triggered == HardRule.COST_NOT_WORTH_IT:
        action, hours = Action.GIVE_UP, None
        detail = {"result": "fail", "rule": "cost_not_worth_it", "detail": f"customer value score {customer.customer_value_score:.2f} below cutoff {COST_VALUE_CUTOFF:.2f} — retry/messaging cost isn't justified"}
    else:
        action, hours = proposed_action, proposed_hours
        detail = {"result": "pass", "detail": f"attempt {txn.attempt_number} of {MAX_RETRY_ATTEMPTS}, not fraud-flagged, contact/value checks clear"}

    return action, hours, triggered, TraceStep(step="hard_rule_check", detail=detail)


def _next_allowed_slot(dt: datetime) -> datetime:
    """Shift a datetime forward out of any NPCI-blocked execution window. Loops
    until no window matches — a single pass would only be safe if BLOCKED_WINDOWS
    is guaranteed non-adjacent, which isn't a constraint worth relying on."""
    while True:
        hour = dt.hour + dt.minute / 60
        for start, end in BLOCKED_WINDOWS:
            if start <= hour < end:
                dt = dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=(end - hour))
                break
        else:
            return dt


def _apply_regulatory_timing(action: Action, hours: float | None, now: datetime) -> tuple[datetime | None, TraceStep]:
    """RBI pre-debit-notification lead time + NPCI execution windows.
    See docs/deep-research-why-agent.md for why this is modeled as a notification
    lead time, not a literal "24h cooldown"."""
    if action not in (Action.RETRY_NOW, Action.RETRY_LATER):
        return None, TraceStep(step="regulatory_timing_check", detail={"result": "n/a", "detail": "no retry scheduled, no timing constraint applies"})

    notification_sent_at = now
    earliest_allowed_execution = notification_sent_at + timedelta(hours=PRE_DEBIT_NOTIFICATION_LEAD_HOURS)
    desired_execution = now + timedelta(hours=hours or 0)
    execution_at = max(desired_execution, earliest_allowed_execution)

    pre_shift = execution_at
    execution_at = _next_allowed_slot(execution_at)
    npci_shifted = execution_at != pre_shift

    return execution_at, TraceStep(
        step="regulatory_timing_check",
        detail={
            "result": "pass",
            "notification_sent_at": notification_sent_at.isoformat(),
            "pre_debit_notification_lead_hours": PRE_DEBIT_NOTIFICATION_LEAD_HOURS,
            "execution_scheduled_at": execution_at.isoformat(),
            "npci_execution_window_shift_applied": npci_shifted,
        },
    )


def decide(txn: Transaction, customer: CustomerHistory, now: datetime | None = None) -> Decision:
    """Run the full pipeline for one transaction. `customer` must never expose
    ground-truth fields — Transaction's ground-truth fields are simply not read here."""
    now = now or datetime.now()
    trace: list[TraceStep] = []

    trace.append(_classify(txn))
    trace.append(_gather_evidence(txn, customer))

    action, hours, confidence, decide_step = _decide(txn, customer)
    trace.append(decide_step)

    action, hours, hard_rule_triggered, hard_rule_step = _apply_hard_rules(txn, customer, action, hours)
    trace.append(hard_rule_step)

    execution_at, timing_step = _apply_regulatory_timing(action, hours, now)
    trace.append(timing_step)

    return Decision(
        transaction_id=txn.transaction_id,
        action=action,
        scheduled_for_hours=hours,
        confidence=round(confidence, 3),
        hard_rule_triggered=hard_rule_triggered,
        trace=trace,
    )
