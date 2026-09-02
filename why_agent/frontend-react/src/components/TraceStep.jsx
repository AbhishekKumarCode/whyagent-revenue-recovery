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
      </div>
    </div>
  );
}
