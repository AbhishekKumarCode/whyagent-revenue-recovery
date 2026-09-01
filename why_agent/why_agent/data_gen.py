"""Synthetic dataset generator — see docs/TRD.md §2, §5.

Success-rate patterns per failure reason are calibrated to reflect the real-world
pattern this project is modeled on (insufficient-balance failures recover far better
on a delayed retry than an immediate one — see WHY_AGENT.md §2's worked example).
"""
from __future__ import annotations

import random
import string
from dataclasses import dataclass

from .engine import MAX_RETRY_ATTEMPTS
from .models import CustomerHistory, FailureReason, Transaction

# Weighted so most transactions are a first failure, but a realistic minority have
# already been retried before — including some already at MAX_RETRY_ATTEMPTS, so the
# max-retries hard rule actually gets exercised by the running app (it was previously
# dead code from the app's point of view: every transaction was generated at attempt 0,
# so nothing ever reached the >= MAX_RETRY_ATTEMPTS gate outside unit tests).
_ATTEMPT_NUMBER_WEIGHTS = [0.70, 0.15, 0.10, 0.05]  # attempts 0, 1, 2, MAX_RETRY_ATTEMPTS

# Organic-feeling synthetic identity data — still entirely synthetic (no real
# people), but shaped like a real Indian D2C subscription-box customer base
# instead of "cust_00042" placeholders. See WHY_AGENT.md persona: "Indian
# snack/beauty subscription-box brand, ~15k active UPI AutoPay subscribers."
FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
    "Ishaan", "Rohan", "Kabir", "Aryan", "Ananya", "Diya", "Saanvi", "Aadhya",
    "Kiara", "Myra", "Anika", "Riya", "Priya", "Neha", "Pooja", "Sneha",
    "Rahul", "Karan", "Nikhil", "Varun", "Siddharth", "Manish", "Deepak", "Amit",
    "Meera", "Kavya", "Ishita", "Tanya", "Sanya", "Nisha", "Divya", "Shreya",
]
LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Kumar", "Singh", "Patel", "Reddy", "Rao",
    "Iyer", "Nair", "Menon", "Pillai", "Chatterjee", "Banerjee", "Mukherjee",
    "Joshi", "Desai", "Shah", "Mehta", "Agarwal", "Bhat", "Kulkarni", "Pandey",
    "Mishra", "Yadav", "Chauhan", "Malhotra", "Kapoor", "Chopra", "Bose",
]

# Real subscription-box plan tiers with organic price points (₹) — small jitter
# applied per transaction so amounts don't look like a uniform random draw.
PLAN_TIERS = [
    ("Snack Box — Monthly", 349),
    ("Snack Box — Quarterly", 949),
    ("Beauty Box — Monthly", 599),
    ("Beauty Box — Quarterly", 1649),
    ("Grooming Kit — Monthly", 799),
    ("Grooming Kit — Quarterly", 2199),
    ("Pet Treats Box — Monthly", 449),
    ("Wellness Box — Monthly", 999),
    ("Wellness Box — Annual", 9999),
]

_ID_ALPHABET = string.ascii_letters + string.digits


def _razorpay_style_id(rng: random.Random, prefix: str, length: int = 14) -> str:
    """Mimics Razorpay's real ID format (e.g. pay_N7x3kLpQ9mZaBc) — organic-looking,
    still fully synthetic."""
    body = "".join(rng.choices(_ID_ALPHABET, k=length))
    return f"{prefix}_{body}"

# (immediate_success_rate, delayed_6h_success_rate) per failure reason.
# insufficient_balance matches the exact numbers from WHY_AGENT.md §2 (0.31 / 0.72):
# customers top up during the day, so waiting materially helps.
# mandate_expiry / app_uninstall barely improve with time — no amount of waiting
# fixes an expired mandate or a deleted app; these need MESSAGE_CUSTOMER instead.
# bank_downtime improves sharply with time — outages resolve.
BASE_SUCCESS_RATES: dict[FailureReason, tuple[float, float]] = {
    FailureReason.INSUFFICIENT_BALANCE: (0.31, 0.72),
    FailureReason.MANDATE_EXPIRY: (0.05, 0.10),
    FailureReason.BANK_DOWNTIME: (0.20, 0.85),
    FailureReason.APP_UNINSTALL: (0.04, 0.07),
}

REASON_WEIGHTS = {
    # Roughly reflects the ~74% "business decline" (predominantly insufficient
    # balance) share found in deep-research — see docs/deep-research-why-agent.md
    FailureReason.INSUFFICIENT_BALANCE: 0.55,
    FailureReason.MANDATE_EXPIRY: 0.18,
    FailureReason.BANK_DOWNTIME: 0.15,
    FailureReason.APP_UNINSTALL: 0.12,
}


@dataclass
class GeneratedDataset:
    transactions: list[Transaction]
    customers: dict[str, CustomerHistory]

    @property
    def demo_set(self) -> list[Transaction]:
        return [t for t in self.transactions if not t.is_held_out]

    @property
    def held_out_batch(self) -> list[Transaction]:
        return [t for t in self.transactions if t.is_held_out]


def _weighted_reason(rng: random.Random) -> FailureReason:
    reasons = list(REASON_WEIGHTS.keys())
    weights = list(REASON_WEIGHTS.values())
    return rng.choices(reasons, weights=weights, k=1)[0]


def _make_customer_name(rng: random.Random) -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def _make_customer(rng: random.Random, customer_id: str) -> CustomerHistory:
    name = _make_customer_name(rng)
    months_active = rng.randint(1, 24)
    on_time_rate = rng.uniform(0.4, 0.98)
    # Longer tenure + higher on-time rate -> higher value score (drives cost-aware cutoff)
    value_score = min(1.0, 0.3 * (months_active / 24) + 0.7 * on_time_rate)
    is_fraud = rng.random() < 0.03
    is_dnc = rng.random() < 0.05

    retry_success_by_reason = {}
    for reason, (imm, delayed) in BASE_SUCCESS_RATES.items():
        # small per-customer jitter so it's not a flat lookup table
        jitter = rng.uniform(-0.04, 0.04)
        retry_success_by_reason[reason.value] = {
            "immediate": max(0.0, min(1.0, imm + jitter)),
            "delayed_6h": max(0.0, min(1.0, delayed + jitter)),
        }

    return CustomerHistory(
        customer_id=customer_id,
        customer_name=name,
        months_active=months_active,
        on_time_payment_rate=round(on_time_rate, 3),
        customer_value_score=round(value_score, 3),
        is_fraud_flagged=is_fraud,
        is_do_not_contact=is_dnc,
        retry_success_by_reason=retry_success_by_reason,
    )


def generate(
    n: int = 500,
    held_out_fraction: float = 0.4,
    seed: int = 42,
) -> GeneratedDataset:
    rng = random.Random(seed)
    customers: dict[str, CustomerHistory] = {}
    customer_ids: list[str] = []
    transactions: list[Transaction] = []

    n_customers = max(1, n // 3)
    for _ in range(n_customers):
        cid = _razorpay_style_id(rng, "cust")
        customer_ids.append(cid)
        customers[cid] = _make_customer(rng, cid)

    for i in range(n):
        customer_id = customer_ids[i % n_customers]  # customers can have multiple failed txns
        customer = customers[customer_id]

        reason = _weighted_reason(rng)
        plan_name, base_price = rng.choice(PLAN_TIERS)
        # organic per-transaction jitter (e.g. a partial refund adjustment, a
        # promo code) rather than a flat, obviously-synthetic tier price
        amount = round(base_price * rng.uniform(0.97, 1.06), 2)
        rates = customer.retry_success_by_reason[reason.value]

        # Ground truth: independent Bernoulli draws against the customer's true
        # success rates for this reason. Held out entirely from the decision engine.
        gt_immediate = rng.random() < rates["immediate"]
        gt_delayed = rng.random() < rates["delayed_6h"]

        is_held_out = rng.random() < held_out_fraction

        transactions.append(
            Transaction(
                transaction_id=_razorpay_style_id(rng, "pay"),
                customer_id=customer_id,
                amount_inr=amount,
                plan_name=plan_name,
                failure_reason=reason,
                attempt_number=rng.choices(range(MAX_RETRY_ATTEMPTS + 1), weights=_ATTEMPT_NUMBER_WEIGHTS)[0],
                is_held_out=is_held_out,
                ground_truth_would_succeed_immediate=gt_immediate,
                ground_truth_would_succeed_delayed=gt_delayed,
            )
        )

    return GeneratedDataset(transactions=transactions, customers=customers)
