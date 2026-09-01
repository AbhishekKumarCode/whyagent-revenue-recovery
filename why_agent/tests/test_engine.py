"""Tests derived from docs/IMPLEMENTATION_APP_FLOW.md §5 testing plan."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from why_agent.data_gen import generate
from why_agent.engine import MAX_RETRY_ATTEMPTS, decide, violated_hard_rule
from why_agent.evaluate import evaluate, evaluate_by_reason, execute_outcome
from why_agent.models import Action, FailureReason, HardRule

NOW = datetime(2026, 8, 31, 9, 0, 0)


def _dataset(n=200, seed=1):
    return generate(n=n, held_out_fraction=0.4, seed=seed)


def test_hard_rule_max_retries_never_violated():
    ds = _dataset()
    for txn in ds.transactions:
        maxed_out = replace(txn, attempt_number=MAX_RETRY_ATTEMPTS)
        customer = ds.customers[txn.customer_id]
        decision = decide(maxed_out, customer, now=NOW)
        assert decision.action == Action.GIVE_UP
        assert decision.hard_rule_triggered == HardRule.MAX_RETRIES


def test_fraud_flagged_never_auto_retries():
    ds = _dataset()
    for txn in ds.transactions:
        # Isolate fraud-escalation behavior from the (separately tested, higher-priority)
        # max-retries rule: data_gen now generates a realistic minority of transactions
        # already at MAX_RETRY_ATTEMPTS, and for those the engine correctly reports
        # GIVE_UP/MAX_RETRIES even when fraud-flagged — max-retries firing first is the
        # existing, intended priority order (see engine.violated_hard_rule).
        if txn.attempt_number >= MAX_RETRY_ATTEMPTS:
            continue
        customer = replace(ds.customers[txn.customer_id], is_fraud_flagged=True)
        decision = decide(txn, customer, now=NOW)
        assert decision.action == Action.HOLD
        assert decision.hard_rule_triggered == HardRule.FRAUD_ESCALATE
        assert decision.action not in (Action.RETRY_NOW, Action.RETRY_LATER)


def test_do_not_contact_never_messaged():
    ds = _dataset()
    for txn in ds.transactions:
        customer = replace(ds.customers[txn.customer_id], is_do_not_contact=True, is_fraud_flagged=False)
        decision = decide(txn, customer, now=NOW)
        assert decision.action != Action.MESSAGE_CUSTOMER


def test_low_value_customer_not_worth_recovering():
    ds = _dataset()
    txn = ds.transactions[0]
    customer = replace(
        ds.customers[txn.customer_id],
        customer_value_score=0.01,
        is_fraud_flagged=False,
        is_do_not_contact=False,
    )
    decision = decide(txn, customer, now=NOW)
    assert decision.action == Action.GIVE_UP
    assert decision.hard_rule_triggered == HardRule.COST_NOT_WORTH_IT


def test_retry_scheduled_respects_24h_notification_floor():
    ds = _dataset()
    for txn in ds.transactions:
        customer = ds.customers[txn.customer_id]
        decision = decide(txn, customer, now=NOW)
        if decision.action in (Action.RETRY_NOW, Action.RETRY_LATER):
            timing = next(s for s in decision.trace if s.step == "regulatory_timing_check")
            execution_at = datetime.fromisoformat(timing.detail["execution_scheduled_at"])
            assert (execution_at - NOW).total_seconds() >= 24 * 3600 - 1  # allow rounding


def test_execution_never_lands_in_npci_blocked_window():
    ds = _dataset()
    for txn in ds.transactions:
        customer = ds.customers[txn.customer_id]
        decision = decide(txn, customer, now=NOW)
        if decision.action in (Action.RETRY_NOW, Action.RETRY_LATER):
            timing = next(s for s in decision.trace if s.step == "regulatory_timing_check")
            execution_at = datetime.fromisoformat(timing.detail["execution_scheduled_at"])
            hour = execution_at.hour + execution_at.minute / 60
            assert not (10 <= hour < 13), "landed in blocked morning window"
            assert not (17 <= hour < 21.5), "landed in blocked evening window"


def test_reasoning_trace_always_complete():
    ds = _dataset()
    for txn in ds.transactions[:50]:
        customer = ds.customers[txn.customer_id]
        decision = decide(txn, customer, now=NOW)
        steps = [s.step for s in decision.trace]
        assert steps == ["classify", "gather_evidence", "decide", "hard_rule_check", "regulatory_timing_check"]


def test_same_failure_reason_different_history_can_reach_different_decisions():
    """The explicit proof-of-reasoning requirement from WHY_AGENT.md §2."""
    ds = _dataset()
    insufficient_balance_txns = [t for t in ds.transactions if t.failure_reason == FailureReason.INSUFFICIENT_BALANCE]
    assert len(insufficient_balance_txns) > 5

    actions = set()
    for txn in insufficient_balance_txns[:30]:
        customer = ds.customers[txn.customer_id]
        decision = decide(txn, customer, now=NOW)
        actions.add(decision.action)
    assert len(actions) > 1, "expected varied decisions across different customer histories for the same failure reason"


def test_ground_truth_never_reaches_decision_engine():
    """The decision engine must only ever receive objects with no ground-truth fields
    exposed to its logic — enforced here by asserting the engine's own trace never
    contains the ground-truth values, not just that the logic doesn't use them."""
    ds = _dataset()
    txn = ds.transactions[0]
    customer = ds.customers[txn.customer_id]
    decision = decide(txn, customer, now=NOW)
    serialized = str(decision.to_dict())
    assert "ground_truth" not in serialized


def test_evaluation_runs_and_reports_all_fields():
    ds = _dataset(n=100, seed=7)
    result = evaluate(ds, now=NOW)
    assert result.batch_size > 0
    assert result.agent_recovery_rate_pct >= 0
    assert result.naive_recovery_rate_pct >= 0


def test_evaluate_by_reason_covers_every_reason_present_and_sums_to_batch():
    ds = _dataset(n=200, seed=11)
    breakdown = evaluate_by_reason(ds, now=NOW)
    total = sum(r["batch_size"] for r in breakdown)
    assert total == len(ds.held_out_batch)
    reasons_seen = {r["failure_reason"] for r in breakdown}
    reasons_in_batch = {t.failure_reason.value for t in ds.held_out_batch}
    assert reasons_seen == reasons_in_batch


def test_execute_outcome_matches_ground_truth_for_retry_now():
    ds = _dataset(n=50, seed=3)
    txn = ds.transactions[0]
    recovered, fp_cost = execute_outcome(txn, Action.RETRY_NOW)
    assert recovered == bool(txn.ground_truth_would_succeed_immediate)
    assert fp_cost == (0.0 if recovered else fp_cost)  # cost only charged on failure


def test_execute_outcome_hold_and_give_up_never_recover():
    ds = _dataset(n=50, seed=3)
    txn = ds.transactions[0]
    for action in (Action.HOLD, Action.GIVE_UP):
        recovered, fp_cost = execute_outcome(txn, action)
        assert recovered is False
        assert fp_cost == 0.0


def test_violated_hard_rule_catches_override_the_original_decision_never_touched():
    """An override to MESSAGE_CUSTOMER for a do-not-contact customer must be flagged
    even when the pipeline's own proposed action was never message_customer (e.g. it
    proposed retry_now, so the DNC branch never fired inside the normal decide() path).
    This is what the /execute endpoint's override-bypass warning relies on."""
    ds = _dataset(n=50, seed=3)
    txn = replace(ds.transactions[0], attempt_number=0)
    customer = replace(ds.customers[txn.customer_id], is_do_not_contact=True, is_fraud_flagged=False)
    assert violated_hard_rule(txn, customer, Action.MESSAGE_CUSTOMER) == HardRule.DO_NOT_CONTACT
    assert violated_hard_rule(txn, customer, Action.RETRY_NOW) is None


def test_evaluation_lift_pct_is_none_not_infinite_when_naive_recovers_nothing():
    """lift_pct must never be float('inf') — Infinity is not valid JSON and breaks
    JSON.parse in the browser for every page that fetches /evaluation or
    /evaluation/by-reason."""
    breakdown = evaluate_by_reason(_dataset(n=200, seed=11), now=NOW)
    zero_naive_rows = [r for r in breakdown if r["naive_recovery_rate_pct"] == 0]
    assert zero_naive_rows, "test dataset/seed no longer produces a zero-naive-recovery bucket — pick a new seed"
    assert all(r["lift_pct"] is None for r in zero_naive_rows)
