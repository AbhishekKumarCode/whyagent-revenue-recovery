import { TRACE_STEP_LABEL } from "../constants.js";

// Shared with DeepDive's Execution Trace — a flat, numbered checklist row
// instead of a timeline-with-connector-line, which reads more like a report
// and holds up better in a narrow column (used in WhyQA's sidebar too).
const STEP_ICON = {
  classify: "label",
  gather_evidence: "manage_search",
  decide: "psychology",
  hard_rule_check: "gavel",
  regulatory_timing_check: "schedule",
};

export default function TraceStep({ index, step, summary, compact = false }) {
  const isFail = step.detail.result === "fail";
  const isPass = step.detail.result === "pass";
  const badgeClasses = isFail
    ? "bg-error-container text-error"
    : isPass
    ? "bg-tertiary-container/20 text-tertiary-container"
    : "bg-primary-container/40 text-primary";

  return (
    <div className={compact ? "flex gap-xs py-xs" : "flex gap-sm py-sm"}>
      <div
        className={`${compact ? "w-6 h-6" : "w-7 h-7"} rounded-lg flex items-center justify-center shrink-0 ${badgeClasses}`}
      >
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
        <p className="font-body-md text-body-md text-on-surface-variant leading-snug mt-0.5">{summary}</p>
        {!compact && (
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
        )}
      </div>
    </div>
  );
}
