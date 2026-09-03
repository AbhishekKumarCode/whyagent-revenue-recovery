import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getTransaction, simulate, inr } from "../api.js";
import { FAILURE_REASON_LABEL, ACTION_LABEL } from "../constants.js";
import RetryTimeline from "../components/RetryTimeline.jsx";
import TraceStep from "../components/TraceStep.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useActivity } from "../context/ActivityContext.jsx";

function fmtTime(iso) {
  return new Date(iso).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Turns the raw trace-step payload into one plain-English sentence instead of a
// key:value field dump — that dump was the thing the user said felt unreadable.
function summarizeStep(step) {
  const d = step.detail;
  if (step.step === "classify") {
    return `Read the failure reason: "${FAILURE_REASON_LABEL[d.failure_reason] || d.failure_reason}".`;
  }
  if (step.step === "gather_evidence") {
    const bits = [];
    if (d.months_active != null) bits.push(`${d.months_active} months as a customer`);
    if (d.on_time_payment_rate != null) bits.push(`${Math.round(d.on_time_payment_rate * 100)}% on-time payment history`);
    if (d.customer_value_score != null) bits.push(`value score ${d.customer_value_score}`);
    let sentence = `Pulled up this customer's record: ${bits.join(", ")}.`;
    if (d.immediate_retry_success_rate != null && d.delayed_6h_retry_success_rate != null) {
      sentence += ` For this failure type, retrying immediately works ~${Math.round(
        d.immediate_retry_success_rate * 100
      )}% of the time; waiting works ~${Math.round(d.delayed_6h_retry_success_rate * 100)}% of the time.`;
    }
    if (d.is_fraud_flagged) sentence += " Fraud flag is set on this customer.";
    if (d.is_do_not_contact) sentence += " Customer is marked do-not-contact.";
    return sentence;
  }
  if (step.step === "regulatory_timing_check") {
    if (d.result !== "pass") return "No retry window needed — nothing scheduled.";
    return `Notice sent ${fmtTime(d.notification_sent_at)}. Retry scheduled for ${fmtTime(d.execution_scheduled_at)} — ${
      d.pre_debit_notification_lead_hours
    }h notice, as required${d.npci_execution_window_shift_applied ? ", shifted later to avoid a blocked bank window" : ""}.`;
  }
  if (typeof d.rationale === "string") return d.rationale; // "decide" step already writes a plain sentence
  if (typeof d.detail === "string") return d.detail; // "hard_rule_check" step already writes a plain sentence
  return Object.entries(d)
    .filter(([k]) => k !== "result")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join(" · ");
}

// The four zones the brief asks to keep visually distinct: what was observed
// (evidence), what the agent concluded from it (reasoning), what non-negotiable
// constraint gated the outcome (policy), and when it's actually allowed to run
// (timing/outcome) — same trace data as before, just grouped instead of one flat list.
const TRACE_ZONES = [
  { key: "evidence", label: "Evidence", icon: "manage_search", steps: ["classify", "gather_evidence"] },
  { key: "reasoning", label: "Agent Reasoning", icon: "psychology", steps: ["decide"] },
  { key: "policy", label: "Policy Validation", icon: "gavel", steps: ["hard_rule_check"] },
  { key: "outcome", label: "Outcome Timing", icon: "schedule", steps: ["regulatory_timing_check"] },
];

function TraceZone({ zone, trace }) {
  const steps = trace.filter((s) => zone.steps.includes(s.step));
  if (steps.length === 0) return null;
  const anyFail = steps.some((s) => s.detail.result === "fail");
  return (
    <div className={`border-l-2 pl-md ${anyFail ? "border-error" : "border-outline-variant"}`}>
      <div className="flex items-center gap-xs mb-xs">
        <span className={`material-symbols-outlined text-[15px] ${anyFail ? "text-error" : "text-on-surface-variant"}`} aria-hidden="true">
          {zone.icon}
        </span>
        <h4 className={`font-label-sm text-label-sm uppercase tracking-wider ${anyFail ? "text-error" : "text-on-surface-variant"}`}>
          {zone.label}
        </h4>
      </div>
      <div className="divide-y divide-outline-variant/40">
        {steps.map((step) => (
          <TraceStep key={step.step} index={trace.indexOf(step)} step={step} summary={summarizeStep(step)} />
        ))}
      </div>
    </div>
  );
}

export default function DeepDive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [simValue, setSimValue] = useState(0.5);
  const [simReason, setSimReason] = useState("insufficient_balance");
  const [simResult, setSimResult] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(true);
  const { logAction } = useActivity();

  const load = useCallback(() => {
    setData(null);
    setError(null);
    setSimResult(null);
    getTransaction(id)
      .then((d) => {
        setData(d);
        setSimReason(d.failure_reason);
      })
      .catch(() => setError(true));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto p-lg">
        <ErrorState message="Couldn't load this transaction." onRetry={load} />
      </div>
    );
  }

  if (!data) {
    return <div className="p-lg text-on-surface-variant">Loading…</div>;
  }

  const runSimulation = async () => {
    setSimBusy(true);
    try {
      const result = await simulate(id, { customer_value_score: simValue, failure_reason: simReason });
      setSimResult(result);
      logAction({
        icon: "tune",
        text: `Changed one detail on ${id}`,
        sub: result.changed
          ? `${ACTION_LABEL[result.before.action]} → ${ACTION_LABEL[result.after.action]}`
          : `Decision unchanged: ${ACTION_LABEL[result.after.action]}`,
        path: `/transactions/${id}`,
      });
    } finally {
      setSimBusy(false);
    }
  };

  const confidencePct = Math.round(data.decision.confidence * 100);
  const confidenceLabel = confidencePct >= 70 ? "High Probability" : confidencePct >= 40 ? "Medium Probability" : "Low Probability";
  const evidence = data.decision.trace.find((s) => s.step === "gather_evidence")?.detail || {};
  const hardRuleStep = data.decision.trace.find((s) => s.step === "hard_rule_check");
  const policyBlocked = hardRuleStep?.detail?.result === "fail";
  const evidenceBullets = [];
  if (evidence.immediate_retry_success_rate != null) {
    evidenceBullets.push(`Immediate retry success: ~${Math.round(evidence.immediate_retry_success_rate * 100)}%`);
  }
  if (evidence.delayed_6h_retry_success_rate != null) {
    evidenceBullets.push(`6h-delayed retry success: ~${Math.round(evidence.delayed_6h_retry_success_rate * 100)}%`);
  }
  if (evidence.months_active != null) {
    evidenceBullets.push(`${evidence.months_active} months as a customer, ${Math.round((evidence.on_time_payment_rate || 0) * 100)}% on-time`);
  }
  evidenceBullets.push(`Failure reason: ${FAILURE_REASON_LABEL[data.failure_reason]}`);

  return (
    <div className="flex-1 overflow-y-auto p-gutter md:p-margin-desktop bg-background">
      <div className="max-w-[1440px] mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-xs text-on-surface-variant font-label-md text-label-md mb-md">
          <Link className="hover:text-primary transition-colors" to="/transactions">
            Transactions
          </Link>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="text-on-surface font-mono">{data.transaction_id}</span>
        </div>

        {/* Payment failed + customer context — "what happened, who is involved" */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-md">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-semibold flex items-center gap-sm">
              Transaction Reasoning Trace
              <span className="bg-error-container text-on-error-container font-label-sm text-label-sm px-2 py-0.5 rounded-full border border-error/20 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                  error
                </span>
                Failed
              </span>
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-3xl">
              Customer: <span className="font-medium text-on-surface">{data.customer_name}</span> | Plan:{" "}
              <span className="font-medium text-on-surface">{data.plan_name}</span> | Amount:{" "}
              <span className="font-medium text-on-surface">{inr(data.amount_inr)}</span> | Failure:{" "}
              <span className="font-medium text-on-surface">"{FAILURE_REASON_LABEL[data.failure_reason]}"</span>
            </p>
          </div>
        </div>

        {/* RECOMMENDATION HERO — the single most important element on this screen.
            Unmistakable action, the evidence behind it, and whether policy allowed
            it to stand, all in one glance before any scrolling. */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-lg mb-gutter relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-1 ${policyBlocked ? "bg-error" : "bg-primary"}`} />
          <div className="flex flex-col lg:flex-row lg:items-center gap-lg">
            <div className="flex-1 min-w-0">
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Recommended Action</p>
              <div className="flex items-center gap-md flex-wrap">
                <h1 className="font-headline-lg text-headline-lg text-on-surface">{ACTION_LABEL[data.decision.action]}</h1>
                <span className="font-label-sm text-label-sm text-on-surface-variant">{confidencePct}% confidence — {confidenceLabel}</span>
                <span
                  className={`inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full border ${
                    policyBlocked
                      ? "bg-error-container text-on-error-container border-error/30"
                      : "bg-tertiary-container/15 text-tertiary-container border-tertiary-container/30"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                    {policyBlocked ? "gavel" : "gpp_good"}
                  </span>
                  {policyBlocked ? "Policy blocked the raw retry math" : "Policy validated"}
                </span>
              </div>
              <ul className="mt-sm flex flex-col gap-1">
                {evidenceBullets.map((b) => (
                  <li key={b} className="font-body-md text-body-md text-on-surface-variant flex items-center gap-xs">
                    <span className="w-1 h-1 rounded-full bg-outline shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => navigate(`/transactions/${id}/why`)}
              className="shrink-0 bg-primary hover:bg-primary/90 transition-colors text-white font-headline-sm text-headline-sm py-3 px-6 rounded-lg flex justify-center items-center gap-sm shadow-sm hover:shadow"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                help_center
              </span>
              Ask Why
            </button>
          </div>
        </div>

        {/* Execution + counterfactual comparison — full width, this is where the
            side-by-side "what actually happened vs. the alternative" lives. */}
        <div className="mb-gutter">
          <RetryTimeline transactionId={id} decision={data.decision} />
        </div>

        {/* Execution Trace (grouped into Evidence / Reasoning / Policy / Timing)
            side by side with Change one detail. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
          <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setTraceOpen((v) => !v)}
              className="w-full p-md flex items-center justify-between gap-sm hover:bg-surface-container-low transition-colors"
            >
              <span className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  account_tree
                </span>
                Execution Trace
                <span className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                  — {data.decision.trace.length} steps, grouped by what's observed vs. decided vs. enforced
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                {traceOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {traceOpen && (
              <div className="px-md pb-md flex flex-col gap-md">
                {TRACE_ZONES.map((zone) => (
                  <TraceZone key={zone.key} zone={zone} trace={data.decision.trace} />
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div
              className="p-md border-b border-outline-variant bg-surface-container-low flex justify-between items-center cursor-pointer"
              onClick={() => setSimOpen((v) => !v)}
            >
              <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-sm">
                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                  tune
                </span>
                Change one detail
              </h3>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                {simOpen ? "expand_less" : "expand_more"}
              </span>
            </div>
            {simOpen && (
              <div className="p-md flex flex-col gap-md bg-surface-container-lowest">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-xs">Customer Value</label>
                  <div className="grid grid-cols-3 gap-xs">
                    {[
                      ["Low", 0.1],
                      ["Med", 0.5],
                      ["High", 0.9],
                    ].map(([label, val]) => (
                      <button
                        key={label}
                        onClick={() => setSimValue(val)}
                        className={
                          simValue === val
                            ? "border border-primary bg-primary/5 rounded py-1.5 font-label-md text-label-md text-primary font-medium"
                            : "border border-outline-variant rounded py-1.5 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-xs">Failure Reason</label>
                  <div className="relative">
                    <select
                      value={simReason}
                      onChange={(e) => setSimReason(e.target.value)}
                      className="w-full appearance-none border border-outline-variant rounded p-2 pr-8 font-body-md text-body-md text-on-surface bg-transparent focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      {Object.entries(FAILURE_REASON_LABEL).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <span
                      className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                      aria-hidden="true"
                    >
                      arrow_drop_down
                    </span>
                  </div>
                </div>
                <button
                  onClick={runSimulation}
                  disabled={simBusy}
                  className="w-full bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors text-on-surface font-label-md text-label-md py-2 px-4 rounded mt-sm disabled:opacity-60 flex items-center justify-center gap-xs"
                >
                  {simBusy && (
                    <span className="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">
                      progress_activity
                    </span>
                  )}
                  {simBusy ? "Running…" : "Run Simulation"}
                </button>
                {simResult && (
                  <div className="font-body-md text-body-md">
                    {simResult.changed ? (
                      <span className="text-error font-medium">
                        was: {ACTION_LABEL[simResult.before.action]} → now: {ACTION_LABEL[simResult.after.action]}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant">Decision unchanged: {ACTION_LABEL[simResult.after.action]}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
