"""Held-out batch evaluation vs. naive baseline — see docs/TRD.md §5, docs/PRD.md §6.6.

Ground truth is read ONLY here, never inside engine.py — this is the enforcement point
for "the decision logic must never see the answer key before deciding."
"""
from __future__ import annotations

from datetime import datetime

from .data_gen import GeneratedDataset
from .engine import RETRY_COST_INR, decide
from .models import Action, EvaluationResult, Transaction


def execute_outcome(txn: Transaction, action: Action) -> tuple[bool, float]:
    """Reveal the real (synthetic) outcome for one transaction under one action.

    This is the ONLY place ground truth is read, and only ever AFTER a decision has
    already been made — by evaluate() for the honest batch scoring, and by the
    /transactions/{id}/execute endpoint for the live "simulate the retry window"
    demo moment. engine.py's decide() never calls this and never sees these fields.
    """
    if action == Action.RETRY_NOW:
        succeeded = bool(txn.ground_truth_would_succeed_immediate)
        return succeeded, 0.0 if succeeded else RETRY_COST_INR
    if action == Action.RETRY_LATER:
        succeeded = bool(txn.ground_truth_would_succeed_delayed)
        return succeeded, 0.0 if succeeded else RETRY_COST_INR
    if action == Action.MESSAGE_CUSTOMER:
        # synthetic assumption: messaging recovers at the delayed rate, at a smaller cost
        succeeded = bool(txn.ground_truth_would_succeed_delayed)
        return succeeded, 0.0 if succeeded else RETRY_COST_INR / 2
    # HOLD / GIVE_UP: no attempt made, no recovery, no false-positive cost
    return False, 0.0


def _naive_baseline_outcome(txn: Transaction) -> tuple[bool, float]:
    """Naive policy: always retry once, ~1 hour later, no classification, no hard rules.
    Approximated against the immediate-outcome ground truth (1h is close enough to
    "immediate" that this is the correct comparison bucket — documented assumption)."""
    succeeded = bool(txn.ground_truth_would_succeed_immediate)
    return succeeded, 0.0 if succeeded else RETRY_COST_INR


def evaluate(dataset: GeneratedDataset, now: datetime | None = None) -> EvaluationResult:
    batch = dataset.held_out_batch
    if not batch:
        raise ValueError("held-out batch is empty — regenerate with a nonzero held_out_fraction")

    agent_recovered_inr = 0.0
    agent_successes = 0
    agent_fp_cost = 0.0
    agent_fp_count = 0

    naive_recovered_inr = 0.0
    naive_successes = 0
    naive_fp_cost = 0.0
    naive_fp_count = 0

    for txn in batch:
        customer = dataset.customers[txn.customer_id]
        decision = decide(txn, customer, now=now)
        recovered, fp_cost = execute_outcome(txn, decision.action)
        agent_fp_cost += fp_cost
        if fp_cost > 0:
            agent_fp_count += 1
        if recovered:
            agent_successes += 1
            agent_recovered_inr += txn.amount_inr

        naive_recovered, naive_fp = _naive_baseline_outcome(txn)
        naive_fp_cost += naive_fp
        if naive_fp > 0:
            naive_fp_count += 1
        if naive_recovered:
            naive_successes += 1
            naive_recovered_inr += txn.amount_inr

    n = len(batch)
    agent_rate = 100.0 * agent_successes / n
    naive_rate = 100.0 * naive_successes / n
    lift = ((agent_rate - naive_rate) / naive_rate * 100.0) if naive_rate > 0 else float("inf")

    return EvaluationResult(
        batch_size=n,
        agent_recovery_rate_pct=round(agent_rate, 2),
        agent_total_recovered_inr=round(agent_recovered_inr, 2),
        agent_false_positive_cost_inr=round(agent_fp_cost, 2),
        agent_false_positive_rate_pct=round(100.0 * agent_fp_count / n, 2),
        naive_recovery_rate_pct=round(naive_rate, 2),
        naive_total_recovered_inr=round(naive_recovered_inr, 2),
        naive_false_positive_cost_inr=round(naive_fp_cost, 2),
        naive_false_positive_rate_pct=round(100.0 * naive_fp_count / n, 2),
        lift_pct=round(lift, 2),
    )


def evaluate_by_reason(dataset: GeneratedDataset, now: datetime | None = None) -> list[dict]:
    """Same held-out evaluation as evaluate(), broken down per failure reason —
    powers the Insights page. Reads ground truth here only, same discipline as
    evaluate() above."""
    batch = dataset.held_out_batch
    buckets: dict[str, list[Transaction]] = {}
    for txn in batch:
        buckets.setdefault(txn.failure_reason.value, []).append(txn)

    results = []
    for reason, txns in buckets.items():
        agent_successes = 0
        naive_successes = 0
        recovered_inr = 0.0
        for txn in txns:
            customer = dataset.customers[txn.customer_id]
            decision = decide(txn, customer, now=now)
            recovered, _ = execute_outcome(txn, decision.action)
            if recovered:
                agent_successes += 1
                recovered_inr += txn.amount_inr
            naive_recovered, _ = _naive_baseline_outcome(txn)
            if naive_recovered:
                naive_successes += 1

        n = len(txns)
        agent_rate = 100.0 * agent_successes / n
        naive_rate = 100.0 * naive_successes / n
        lift = ((agent_rate - naive_rate) / naive_rate * 100.0) if naive_rate > 0 else float("inf")
        results.append(
            {
                "failure_reason": reason,
                "batch_size": n,
                "agent_recovery_rate_pct": round(agent_rate, 2),
                "naive_recovery_rate_pct": round(naive_rate, 2),
                "recovered_inr": round(recovered_inr, 2),
                "lift_pct": round(lift, 2) if lift != float("inf") else None,
            }
        )
    results.sort(key=lambda r: r["batch_size"], reverse=True)
    return results
