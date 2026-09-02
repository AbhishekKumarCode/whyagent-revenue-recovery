"""FastAPI backend — endpoints for the dashboard (list, deep-dive, why-Q&A, eval, simulate).

See docs/IMPLEMENTATION_APP_FLOW.md §3 for how each screen maps to these endpoints.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth
from .data_gen import GeneratedDataset, generate
from .engine import (
    BLOCKED_WINDOWS,
    COST_VALUE_CUTOFF,
    DELAYED_RETRY_ADVANTAGE_THRESHOLD,
    MAX_RETRY_ATTEMPTS,
    PRE_DEBIT_NOTIFICATION_LEAD_HOURS,
    RETRY_COST_INR,
    decide,
    violated_hard_rule,
)
from .evaluate import evaluate, evaluate_by_reason, execute_outcome
from .explain import answer
from .llm_explain import llm_answer
from .models import Action, FailureReason

app = FastAPI(title="WHY Agent API")
# Wide-open CORS is intentional for this local-only buildathon demo (no real money,
# single demo session — see docs/PRD.md §3 and docs/TRD.md §6). Auth is real (see
# why_agent/auth.py) even though CORS itself stays permissive; never carry the wide-open
# CORS forward if this API is ever exposed beyond localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

auth.init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    # Visiting the bare domain should land users in the app, not a 404 —
    # the SPA itself lives under /app (see the StaticFiles mount below).
    return RedirectResponse(url="/app/dashboard")


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/register")
def register(req: RegisterRequest):
    try:
        user = auth.create_user(req.email, req.password, req.name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    token = auth.create_session(user)
    return {"token": token, "user": auth.public_user(user)}


@app.post("/auth/login")
def login(req: LoginRequest):
    try:
        user = auth.authenticate(req.email, req.password)
    except ValueError as e:
        raise HTTPException(401, str(e))
    token = auth.create_session(user)
    return {"token": token, "user": auth.public_user(user)}


@app.post("/auth/logout")
def logout(user=Depends(auth.get_current_user)):
    auth.delete_session(user["token"])
    return {"ok": True}


@app.get("/auth/me")
def me(user=Depends(auth.get_current_user)):
    return auth.public_user(user)


# Single in-memory dataset for the demo session — regenerated on startup.
_dataset: GeneratedDataset = generate(n=300, held_out_fraction=0.4, seed=42)
_NOW = datetime(2026, 8, 31, 9, 0, 0)  # fixed clock so the demo is reproducible run-to-run


class WhyRequest(BaseModel):
    question: str


class SimulateRequest(BaseModel):
    customer_value_score: float | None = None
    failure_reason: str | None = None
    is_fraud_flagged: bool | None = None


class ExecuteRequest(BaseModel):
    # If omitted, executes the agent's actual decided action. If set, executes a
    # different action instead — the "try Retry Now instead" override — so the demo
    # can honestly show what a different call would really have done, per the
    # real (synthetic) ground truth. Ground truth is never used to decide, only to
    # score afterward — see evaluate.execute_outcome().
    action: str | None = None


@app.get("/transactions")
def list_transactions(user=Depends(auth.get_current_user)):
    rows = []
    for txn in _dataset.demo_set:
        customer = _dataset.customers[txn.customer_id]
        decision = decide(txn, customer, now=_NOW)
        rows.append(
            {
                "transaction_id": txn.transaction_id,
                "customer_id": txn.customer_id,
                "customer_name": customer.customer_name,
                "amount_inr": txn.amount_inr,
                "plan_name": txn.plan_name,
                "failure_reason": txn.failure_reason.value,
                "decision": decision.to_dict(),
            }
        )
    return rows


@app.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: str, user=Depends(auth.get_current_user)):
    txn = next((t for t in _dataset.transactions if t.transaction_id == transaction_id), None)
    if txn is None:
        raise HTTPException(404, "transaction not found")
    customer = _dataset.customers[txn.customer_id]
    decision = decide(txn, customer, now=_NOW)
    return {
        "transaction_id": txn.transaction_id,
        "customer_id": txn.customer_id,
        "customer_name": customer.customer_name,
        "amount_inr": txn.amount_inr,
        "plan_name": txn.plan_name,
        "failure_reason": txn.failure_reason.value,
        "decision": decision.to_dict(),
        "customer_context": {
            "months_active": customer.months_active,
            "on_time_payment_rate": customer.on_time_payment_rate,
            "customer_value_score": customer.customer_value_score,
        },
    }


_eval_summary_cache: dict | None = None


def _cached_evaluation_summary() -> dict:
    global _eval_summary_cache
    if _eval_summary_cache is None:
        r = evaluate(_dataset, now=_NOW)
        _eval_summary_cache = {
            "batch_size": r.batch_size,
            "agent_recovery_rate_pct": r.agent_recovery_rate_pct,
            "agent_total_recovered_inr": r.agent_total_recovered_inr,
            "naive_recovery_rate_pct": r.naive_recovery_rate_pct,
            "naive_total_recovered_inr": r.naive_total_recovered_inr,
            "lift_pct": r.lift_pct,
        }
    return _eval_summary_cache


@app.post("/transactions/{transaction_id}/why")
def ask_why(transaction_id: str, req: WhyRequest, user=Depends(auth.get_current_user)):
    txn = next((t for t in _dataset.transactions if t.transaction_id == transaction_id), None)
    if txn is None:
        raise HTTPException(404, "transaction not found")
    customer = _dataset.customers[txn.customer_id]
    decision = decide(txn, customer, now=_NOW)

    # Try the DeepSeek-backed answer first (broader question coverage) — grounded
    # in the full real context, falls back to the deterministic template on any
    # failure (missing key, network error, timeout) so the demo never goes blank.
    context = {
        "product": "WHY Agent — an AI agent that decides how to recover failed UPI AutoPay "
        "payments for Indian D2C subscription-box merchants, executes in simulation, and "
        "explains every decision on demand.",
        "transaction": {
            "transaction_id": txn.transaction_id,
            "amount_inr": txn.amount_inr,
            "plan_name": txn.plan_name,
            "failure_reason": txn.failure_reason.value,
        },
        "customer": {
            "name": customer.customer_name,
            "months_active": customer.months_active,
            "on_time_payment_rate": customer.on_time_payment_rate,
            "customer_value_score": customer.customer_value_score,
            "is_fraud_flagged": customer.is_fraud_flagged,
            "is_do_not_contact": customer.is_do_not_contact,
            "note": "All customer data is synthetic, generated for this demo — not a real person.",
        },
        "decision": decision.to_dict(),
        "held_out_batch_evaluation": _cached_evaluation_summary(),
        "bounded_action_list": ["retry_now", "retry_later", "message_customer", "hold", "give_up"],
        "hard_rules": {
            "max_retry_attempts": MAX_RETRY_ATTEMPTS,
            "fraud_auto_escalate": True,
            "do_not_contact_stop": True,
            "cost_aware_cutoff_customer_value_score": COST_VALUE_CUTOFF,
        },
        "regulatory_compliance": {
            "pre_debit_notification_lead_hours": PRE_DEBIT_NOTIFICATION_LEAD_HOURS,
            "npci_blocked_execution_windows": BLOCKED_WINDOWS,
        },
    }
    llm_response = llm_answer(context, req.question)
    if llm_response is not None:
        return {"question": req.question, "answer": llm_response, "source": "deepseek"}

    return {"question": req.question, "answer": answer(decision, req.question), "source": "template"}


@app.post("/transactions/{transaction_id}/simulate")
def simulate(transaction_id: str, req: SimulateRequest, user=Depends(auth.get_current_user)):
    """The "change one detail, watch the decision change" live-demo moment."""
    txn = next((t for t in _dataset.transactions if t.transaction_id == transaction_id), None)
    if txn is None:
        raise HTTPException(404, "transaction not found")
    original_customer = _dataset.customers[txn.customer_id]
    original_decision = decide(txn, original_customer, now=_NOW)

    modified_customer = replace(original_customer)
    if req.customer_value_score is not None:
        modified_customer.customer_value_score = req.customer_value_score
    if req.is_fraud_flagged is not None:
        modified_customer.is_fraud_flagged = req.is_fraud_flagged

    modified_txn = replace(txn)
    if req.failure_reason is not None:
        try:
            modified_txn.failure_reason = FailureReason(req.failure_reason)
        except ValueError:
            raise HTTPException(400, f"invalid failure_reason: {req.failure_reason}")

    new_decision = decide(modified_txn, modified_customer, now=_NOW)
    return {
        "before": original_decision.to_dict(),
        "after": new_decision.to_dict(),
        "changed": original_decision.action != new_decision.action,
    }


@app.post("/transactions/{transaction_id}/execute")
def execute_transaction(transaction_id: str, req: ExecuteRequest, user=Depends(auth.get_current_user)):
    """Runs the retry window forward and reveals the real (synthetic) outcome —
    the "simulate it, don't just claim it" moment. With no override, executes the
    agent's actual decision. With an override (e.g. "try retry_now instead"), reveals
    what a different call would really have done — including honestly flagging when
    that override would have bypassed a hard rule the agent enforced."""
    txn = next((t for t in _dataset.transactions if t.transaction_id == transaction_id), None)
    if txn is None:
        raise HTTPException(404, "transaction not found")
    customer = _dataset.customers[txn.customer_id]
    decision = decide(txn, customer, now=_NOW)

    executed_action = decision.action
    bypassed_hard_rule = None
    if req.action is not None:
        try:
            executed_action = Action(req.action)
        except ValueError:
            raise HTTPException(400, f"invalid action: {req.action}")
        # Check the rule against the action actually being executed, not against
        # whatever rule (if any) fired for the pipeline's own proposed action — an
        # override can violate a rule the original decision never touched (e.g.
        # overriding to message_customer for a do-not-contact customer whose
        # original decision was retry_now, which never hit the DNC branch).
        violated = violated_hard_rule(txn, customer, executed_action)
        if violated is not None:
            bypassed_hard_rule = violated.value

    recovered, fp_cost = execute_outcome(txn, executed_action)
    return {
        "transaction_id": txn.transaction_id,
        "agent_action": decision.action.value,
        "executed_action": executed_action.value,
        "is_override": req.action is not None,
        "bypassed_hard_rule": bypassed_hard_rule,
        "recovered": recovered,
        "recovered_inr": round(txn.amount_inr, 2) if recovered else 0.0,
        "false_positive_cost_inr": round(fp_cost, 2),
    }


@app.get("/evaluation")
def get_evaluation(user=Depends(auth.get_current_user)):
    result = evaluate(_dataset, now=_NOW)
    return {
        "batch_size": result.batch_size,
        "agent_recovery_rate_pct": result.agent_recovery_rate_pct,
        "agent_total_recovered_inr": result.agent_total_recovered_inr,
        "agent_false_positive_cost_inr": result.agent_false_positive_cost_inr,
        "agent_false_positive_rate_pct": result.agent_false_positive_rate_pct,
        "naive_recovery_rate_pct": result.naive_recovery_rate_pct,
        "naive_total_recovered_inr": result.naive_total_recovered_inr,
        "naive_false_positive_cost_inr": result.naive_false_positive_cost_inr,
        "naive_false_positive_rate_pct": result.naive_false_positive_rate_pct,
        "lift_pct": result.lift_pct,
    }


@app.get("/evaluation/by-reason")
def get_evaluation_by_reason(user=Depends(auth.get_current_user)):
    return evaluate_by_reason(_dataset, now=_NOW)


@app.get("/rules")
def get_rules(user=Depends(auth.get_current_user)):
    """Reads the actual engine constants — see why_agent/engine.py — rather than a
    hand-maintained copy, so this screen can never drift out of sync with what the
    decision engine actually enforces."""
    trigger_counts = {"max_retries": 0, "fraud_escalate": 0, "do_not_contact": 0, "cost_not_worth_it": 0}
    for txn in _dataset.demo_set:
        customer = _dataset.customers[txn.customer_id]
        d = decide(txn, customer, now=_NOW)
        if d.hard_rule_triggered:
            trigger_counts[d.hard_rule_triggered.value] += 1

    return {
        "bounded_action_list": ["retry_now", "retry_later", "message_customer", "hold", "give_up"],
        "hard_rules": [
            {
                "id": "max_retries",
                "name": "Max 3 Retry Attempts",
                "detail": f"After {MAX_RETRY_ATTEMPTS} failed tries, the agent stops and hands it to a person — it never loops forever.",
                "triggered_count": trigger_counts["max_retries"],
            },
            {
                "id": "fraud_escalate",
                "name": "Fraud/Risk Auto-Escalate",
                "detail": "If a customer is flagged as risky, the agent never retries automatically — it hands the case to a person instead.",
                "caveat": "In this demo, the fraud flag is a synthetic input we set on the data — there's no real fraud-detection model behind it. What's real is the agent's response once a transaction is flagged.",
                "triggered_count": trigger_counts["fraud_escalate"],
            },
            {
                "id": "do_not_contact",
                "name": "Do-Not-Contact Stop",
                "detail": "If a customer has opted out of contact, the agent stops immediately — no retry, no message.",
                "triggered_count": trigger_counts["do_not_contact"],
            },
            {
                "id": "cost_not_worth_it",
                "name": "Cost-Aware Cutoff",
                "detail": f"If recovering this payment costs more effort than it's worth (customer value score under {COST_VALUE_CUTOFF:.2f}), the agent gives up instead of trying anyway.",
                "triggered_count": trigger_counts["cost_not_worth_it"],
            },
        ],
        "regulatory_compliance": {
            "pre_debit_notification_lead_hours": PRE_DEBIT_NOTIFICATION_LEAD_HOURS,
            "npci_blocked_windows": BLOCKED_WINDOWS,
            "retry_cost_inr": RETRY_COST_INR,
            "delayed_retry_advantage_threshold_pct": round(DELAYED_RETRY_ADVANTAGE_THRESHOLD * 100, 1),
        },
        "demo_session": {
            "dataset_size": len(_dataset.transactions),
            "demo_set_size": len(_dataset.demo_set),
            "held_out_batch_size": len(_dataset.held_out_batch),
            "unique_customers": len(_dataset.customers),
            "clock": _NOW.isoformat(),
            "llm_backed_qa_enabled": _load_deepseek_key_present(),
        },
    }


def _load_deepseek_key_present() -> bool:
    from .llm_explain import _load_api_key

    return _load_api_key() is not None


# Serve the built React SPA under /app — kept off the root path so its client-side
# routes (e.g. /app/evaluation) never collide with the API routes above (e.g.
# GET /evaluation). Built via `npm run build` in frontend-react/ (see vite.config.js's
# base: "/app/" and main.jsx's basename="/app", which keep dev and prod consistent).
_REACT_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend-react" / "dist"
if _REACT_DIST_DIR.is_dir():
    app.mount("/app/assets", StaticFiles(directory=_REACT_DIST_DIR / "assets"), name="frontend-assets")

    @app.get("/app")
    @app.get("/app/{full_path:path}")
    def serve_spa(full_path: str = ""):
        # SPA fallback: any /app/* path that isn't a static asset (e.g. /app/rules,
        # /app/transactions/txn_00001) is a client-side route — always serve
        # index.html and let React Router handle it. The bare "/app" route (no
        # trailing slash) needs its own decorator since {full_path:path} won't match it.
        return FileResponse(_REACT_DIST_DIR / "index.html")
