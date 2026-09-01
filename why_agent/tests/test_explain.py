"""Tests for the live 'why' Q&A — see docs/TRD.md §3.

Regression test for a real bug caught via browser testing (2026-08-31): when a
hard rule overrides the decide step's initial inclination, the "why" answer must
disclose the override, not just describe the pre-override rationale as if it were
the final decision.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from why_agent.data_gen import generate
from why_agent.engine import decide
from why_agent.explain import answer
from why_agent.models import Action

NOW = datetime(2026, 8, 31, 9, 0, 0)


def test_why_answer_discloses_hard_rule_override():
    ds = generate(n=100, held_out_fraction=0.4, seed=3)
    txn = ds.transactions[0]
    customer = replace(ds.customers[txn.customer_id], is_fraud_flagged=True)

    decision = decide(txn, customer, now=NOW)
    assert decision.action == Action.HOLD

    response = answer(decision, "Why did you make this decision?")
    assert "override" in response.lower() or "hard stopping rule" in response.lower()
    # Must not claim a retry action as the final decision when it was overridden to HOLD
    assert "retry_later" not in response.split("overrode")[-1] if "overrode" in response else True


def test_why_answer_matches_final_action_when_no_override():
    ds = generate(n=100, held_out_fraction=0.4, seed=3)
    # find a transaction whose decision passes hard rules cleanly
    for txn in ds.transactions:
        customer = ds.customers[txn.customer_id]
        decision = decide(txn, customer, now=NOW)
        if decision.hard_rule_triggered is None:
            response = answer(decision, "Why did you make this decision?")
            assert "overrode" not in response.lower()
            return
    raise AssertionError("expected at least one transaction with no hard-rule override in this sample")
