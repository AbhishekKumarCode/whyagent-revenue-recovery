"""Data model for WHY Agent — see docs/TRD.md §2 for the schema this implements."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class FailureReason(str, Enum):
    INSUFFICIENT_BALANCE = "insufficient_balance"
    MANDATE_EXPIRY = "mandate_expiry"
    BANK_DOWNTIME = "bank_downtime"
    APP_UNINSTALL = "app_uninstall"


class Action(str, Enum):
    RETRY_NOW = "retry_now"
    RETRY_LATER = "retry_later"
    MESSAGE_CUSTOMER = "message_customer"
    HOLD = "hold"
    GIVE_UP = "give_up"


class HardRule(str, Enum):
    MAX_RETRIES = "max_retries"
    FRAUD_ESCALATE = "fraud_escalate"
    DO_NOT_CONTACT = "do_not_contact"
    COST_NOT_WORTH_IT = "cost_not_worth_it"


@dataclass
class CustomerHistory:
    customer_id: str
    customer_name: str
    months_active: int
    on_time_payment_rate: float
    customer_value_score: float  # 0-1, drives cost-aware cutoff
    is_fraud_flagged: bool
    is_do_not_contact: bool
    # failure_reason -> {"immediate": success_rate, "delayed_6h": success_rate}
    retry_success_by_reason: dict[str, dict[str, float]]


@dataclass
class Transaction:
    transaction_id: str
    customer_id: str
    amount_inr: float
    plan_name: str
    failure_reason: FailureReason
    attempt_number: int = 0
    is_held_out: bool = False
    # Hidden ground truth — never passed to the decision engine, only used by evaluate.py
    ground_truth_would_succeed_immediate: bool | None = field(default=None, repr=False)
    ground_truth_would_succeed_delayed: bool | None = field(default=None, repr=False)


@dataclass
class TraceStep:
    step: str
    detail: dict


@dataclass
class Decision:
    transaction_id: str
    action: Action
    scheduled_for_hours: float | None  # hours from now, for retry_later
    confidence: float
    hard_rule_triggered: HardRule | None
    trace: list[TraceStep]

    def to_dict(self) -> dict:
        return {
            "transaction_id": self.transaction_id,
            "action": self.action.value,
            "scheduled_for_hours": self.scheduled_for_hours,
            "confidence": self.confidence,
            "hard_rule_triggered": self.hard_rule_triggered.value if self.hard_rule_triggered else None,
            "trace": [{"step": t.step, "detail": t.detail} for t in self.trace],
        }


@dataclass
class EvaluationResult:
    batch_size: int
    agent_recovery_rate_pct: float
    agent_total_recovered_inr: float
    agent_false_positive_cost_inr: float
    agent_false_positive_rate_pct: float
    naive_recovery_rate_pct: float
    naive_total_recovered_inr: float
    naive_false_positive_cost_inr: float
    naive_false_positive_rate_pct: float
    lift_pct: float | None  # None when the naive baseline recovered nothing (division by zero)
