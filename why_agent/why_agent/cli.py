"""Quick end-to-end sanity check without starting the API — prints a summary to console."""
from __future__ import annotations

from datetime import datetime

from .data_gen import generate
from .engine import decide
from .evaluate import evaluate
from .explain import answer


def main() -> None:
    dataset = generate(n=300, held_out_fraction=0.4, seed=42)
    now = datetime(2026, 8, 31, 9, 0, 0)

    print(f"Generated {len(dataset.transactions)} transactions "
          f"({len(dataset.demo_set)} demo, {len(dataset.held_out_batch)} held-out)\n")

    print("--- Sample decisions (demo set, first 5) ---")
    for txn in dataset.demo_set[:5]:
        customer = dataset.customers[txn.customer_id]
        decision = decide(txn, customer, now=now)
        print(f"{txn.transaction_id} | ₹{txn.amount_inr:>8.2f} | {txn.failure_reason.value:<20} "
              f"-> {decision.action.value:<17} (confidence {decision.confidence:.0%})"
              + (f" [hard rule: {decision.hard_rule_triggered.value}]" if decision.hard_rule_triggered else ""))

    print("\n--- Live 'why' Q&A demo (first transaction) ---")
    txn = dataset.demo_set[0]
    customer = dataset.customers[txn.customer_id]
    decision = decide(txn, customer, now=now)
    for q in ["Why did you make this decision?", "Why not retry immediately?", "Is this compliant with the 24h rule?"]:
        print(f"Q: {q}")
        print(f"A: {answer(decision, q)}\n")

    print("--- Held-out batch evaluation vs. naive baseline ---")
    result = evaluate(dataset, now=now)
    print(f"Batch size:              {result.batch_size}")
    print(f"Agent recovery rate:     {result.agent_recovery_rate_pct}%  (₹{result.agent_total_recovered_inr:,.2f} recovered)")
    print(f"Naive baseline rate:     {result.naive_recovery_rate_pct}%  (₹{result.naive_total_recovered_inr:,.2f} recovered)")
    print(f"Lift vs. naive baseline: {result.lift_pct:+.2f}%")
    print(f"Agent false-positive cost: ₹{result.agent_false_positive_cost_inr:,.2f}")


if __name__ == "__main__":
    main()
