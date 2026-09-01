import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getTransaction, simulate, inr } from "../api.js";
import { FAILURE_REASON_LABEL, TRACE_STEP_LABEL, ACTION_LABEL } from "../constants.js";
import RetryTimeline from "../components/RetryTimeline.jsx";
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

const STEP_ICON = {
  classify: "label",
  gather_evidence: "manage_search",
  decide: "psychology",
  hard_rule_check: "gavel",
  regulatory_timing_check: "schedule",
};

// A flat, numbered checklist row instead of a timeline-with-connector-line —
// reads more like a report and holds up better in a narrower column.
function TraceStep({ index, step }) {
  const isFail = step.detail.result === "fail";
  const isPass = step.detail.result === "pass";
  const sentence = summarizeStep(step);
  const badgeClasses = isFail
    ? "bg-error-container text-error"
    : isPass
    ? "bg-tertiary-container/20 text-tertiary-container"
    : "bg-primary-container/40 text-primary";

  return (
    <div className="flex gap-sm py-sm">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${badgeClasses}`}>
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          {STEP_ICON[step.step] || "check_circle"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-sm">
          <h4 className="font-label-md text-label-md font-semibold text-on-surface">
            {index + 1}. {TRACE_STEP_LABEL[step.step] || step.step}
          </h4>
          {step.detail.result && (
            <span
              className={`font-label-sm text-label-sm shrink-0 px-1.5 py-0.5 rounded ${
                isFail ? "text-error bg-error-container/60" : "text-tertiary-container bg-tertiary-container/15"
              }`}
            >
              {step.detail.result.toUpperCase()}
            </span>
          )}
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant leading-snug mt-0.5">{sentence}</p>
        <details className="mt-1 group">
          <summary className="font-label-sm text-label-sm text-outline cursor-pointer select-none list-none inline-flex items-center gap-0.5 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[13px] transition-transform group-open:rotate-90" aria-hidden="true">
              chevron_right
            </span>
            Raw data
          </summary>
          <div className="mt-1 font-mono text-[11px] leading-relaxed text-on-surface-variant bg-surface-container rounded p-2 overflow-x-auto">
            {Object.entries(step.detail)
              .filter(([k]) => k !== "result")
              .map(([k, v]) => (
                <div key={k}>
                  <span className="text-primary">{k}</span>: {Array.isArray(v) ? v.join(", ") : String(v)}
                </div>
              ))}
          </div>
        </details>
      </div>
    </div>
  );
}

export default function DeepDive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [simValue, setSimValue] = useState(0.5);
  const [simReason, setSimReason] = useState("insufficient_balance");
  const [simResult, setSimResult] = useState(null);
  const [simOpen, setSimOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const { logAction } = useActivity();

  useEffect(() => {
    setData(null);
    setSimResult(null);
    getTransaction(id).then((d) => {
      setData(d);
      setSimReason(d.failure_reason);
    });
  }, [id]);

  if (!data) {
    return <div className="p-lg text-on-surface-variant">Loading…</div>;
  }

  const runSimulation = async () => {
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
  };

  const confidencePct = Math.round(data.decision.confidence * 100);
  const confidenceLabel = confidencePct >= 70 ? "High Probability" : confidencePct >= 40 ? "Medium Probability" : "Low Probability";

  return (
    <div className="flex-1 overflow-y-auto p-gutter md:p-margin-desktop bg-[#F5F7FA]">
      <div className="max-w-[1440px] mx-auto">
        {/* Page Header */}
        <div className="mb-md">
          <div className="flex items-center gap-xs text-on-surface-variant font-label-md text-label-md mb-xs">
            <Link className="hover:text-primary transition-colors" to="/transactions">
              Transactions
            </Link>
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              chevron_right
            </span>
            <span className="text-on-surface font-mono">{data.transaction_id}</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-md">
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
        </div>

        {/* Row 1: cropped Retry Window Simulation + Recovery Confidence side by side — the
            flagship interactive moment plus the headline number, both above the fold. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-md items-stretch">
          <div className="lg:col-span-8">
            <RetryTimeline transactionId={id} decision={data.decision} compact />
          </div>
          <div className="lg:col-span-4">
            <div className="h-full bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col">
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-xs flex items-center gap-xs">
                Recovery Confidence
                <span
                  className="material-symbols-outlined text-[16px] text-on-surface-variant cursor-help"
                  title="Based on the customer's historical retry success rates for this failure reason"
                >
                  info
                </span>
              </h3>
              <div className="flex items-end justify-between mb-2">
                <span className="font-headline-lg text-headline-lg text-primary">{confidencePct}%</span>
                <span className="font-label-md text-label-md text-on-surface-variant pb-1">{confidenceLabel}</span>
              </div>
              <div className="w-full bg-surface-variant rounded-full h-2.5 overflow-hidden">
                <div className="bg-primary h-2.5 rounded-full" style={{ width: `${confidencePct}%` }} />
              </div>
              <div className="mt-sm font-label-md text-label-sm text-on-surface-variant">
                Final action: <span className="font-medium text-on-surface">{ACTION_LABEL[data.decision.action]}</span>
              </div>
              <button
                onClick={() => navigate(`/transactions/${id}/why`)}
                className="w-full bg-[#3395FF] hover:bg-primary transition-colors text-white font-headline-sm text-headline-sm py-3 px-4 rounded-lg flex justify-center items-center gap-sm mt-md shadow-sm hover:shadow"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  help_center
                </span>
                Ask Why
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Execution Trace (flat numbered checklist, redesigned) side by side
            with Change one detail — pulled up out of the old right-column stack. */}
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
                  — {data.decision.trace.length} steps in plain English, final call: {ACTION_LABEL[data.decision.action]}
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                {traceOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {traceOpen && (
              <div className="px-md pb-md divide-y divide-outline-variant/40">
                {data.decision.trace.map((step, i) => (
                  <TraceStep key={step.step} index={i} step={step} />
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
                  className="w-full bg-surface-container border border-outline-variant hover:bg-surface-container-high transition-colors text-on-surface font-label-md text-label-md py-2 px-4 rounded mt-sm"
                >
                  Run Simulation
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
