import { useEffect, useRef, useState } from "react";
import { fetchJSON, inr } from "../api.js";
import { ACTION_LABEL } from "../constants.js";
import { useActivity } from "../context/ActivityContext.jsx";

function fmtTime(iso) {
  return new Date(iso).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STAGES = [
  { icon: "mark_email_read", label: "Notifying", full: "Sending pre-debit notification" },
  { icon: "hourglass_top", label: "Waiting", full: "Waiting for the execution window" },
  { icon: "sync", label: "Retrying", full: "Attempting the debit" },
  { icon: "fact_check", label: "Verifying", full: "Checking the real outcome" },
];
const STAGE_MS = 600; // 4 stages * 600ms = 2400ms total play time

export default function RetryTimeline({ transactionId, decision, compact = false }) {
  const [playhead, setPlayhead] = useState(0); // 0-100, animated position
  const [phase, setPhase] = useState("idle"); // idle | playing | done
  const [result, setResult] = useState(null);
  const [pendingLabel, setPendingLabel] = useState("");
  const [stageIndex, setStageIndex] = useState(-1);
  const timers = useRef([]);
  const { logAction } = useActivity();

  const timingStep = decision.trace.find((s) => s.step === "regulatory_timing_check");
  const hasSchedule = timingStep?.detail?.result === "pass";
  const notificationAt = timingStep?.detail?.notification_sent_at;
  const executionAt = timingStep?.detail?.execution_scheduled_at;
  const npciShifted = timingStep?.detail?.npci_execution_window_shift_applied;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function run(overrideAction, label) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("playing");
    setResult(null);
    setPlayhead(0);
    setStageIndex(0);
    setPendingLabel(label);

    // Compressed simulation: the real window is hours/days, this animates over
    // ~2.4s in 4 visible stages so "watch it play out" is actually watchable.
    requestAnimationFrame(() => setPlayhead(100));
    STAGES.forEach((_, i) => {
      if (i === 0) return;
      timers.current.push(setTimeout(() => setStageIndex(i), i * STAGE_MS));
    });

    const body = overrideAction ? { action: overrideAction } : {};
    const [res] = await Promise.all([
      fetchJSON(`/transactions/${transactionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      new Promise((r) => timers.current.push(setTimeout(r, STAGES.length * STAGE_MS))),
    ]);
    setResult(res);
    setPhase("done");
    setStageIndex(-1);
    logAction({
      icon: "play_circle",
      text: `Simulated "${label}" for ${transactionId}`,
      sub: res.recovered ? `Recovered ${inr(res.recovered_inr)}` : "Not recovered",
      path: `/transactions/${transactionId}`,
    });
  }

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setPhase("idle");
    setResult(null);
    setPlayhead(0);
    setStageIndex(-1);
  };

  return (
    <div className={`h-full bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm flex flex-col ${compact ? "p-sm" : "p-md"}`}>
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-0.5 flex items-center gap-sm">
        <span className="material-symbols-outlined text-primary" aria-hidden="true">
          play_circle
        </span>
        Retry Window Simulation
      </h3>
      {!compact && (
        <p className="font-label-md text-label-md text-on-surface-variant mb-md">
          Plays the window forward and reveals the real (synthetic) outcome — not just a claimed schedule.
        </p>
      )}

      {hasSchedule ? (
        <div className={compact ? "mb-sm mt-sm" : "mb-md"}>
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mb-1.5">
            <span>Failure</span>
            <span>Notification</span>
            <span>Execution{npciShifted ? " (NPCI-shifted)" : ""}</span>
          </div>
          <div className="relative h-2 bg-surface-container rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-primary/30 rounded-full transition-all ease-linear"
              style={{ width: `${playhead}%`, transitionDuration: phase === "playing" ? `${STAGES.length * STAGE_MS}ms` : "0ms" }}
            />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-surface-container-lowest shadow transition-all ease-linear ${
                phase === "playing" ? "animate-pulse" : ""
              }`}
              style={{ left: `calc(${playhead}% - 6px)`, transitionDuration: phase === "playing" ? `${STAGES.length * STAGE_MS}ms` : "0ms" }}
            />
          </div>
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
            <span className="mono-num">now</span>
            <span className="mono-num">{fmtTime(notificationAt)}</span>
            <span className="mono-num">{fmtTime(executionAt)}</span>
          </div>
        </div>
      ) : (
        <p className="font-label-md text-label-md text-outline mb-sm mt-sm">
          No retry scheduled for this decision ({ACTION_LABEL[decision.action]}) — you can still see what a retry would have
          done below.
        </p>
      )}

      {/* Live process stages — the visual "something is happening" feedback */}
      {phase === "playing" && (
        <div className="grid grid-cols-4 gap-xs mb-sm">
          {STAGES.map((stage, i) => {
            const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "pending";
            return (
              <div
                key={stage.label}
                title={stage.full}
                className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border text-center transition-colors ${
                  state === "active"
                    ? "border-primary bg-primary/5"
                    : state === "done"
                    ? "border-tertiary-container/40 bg-tertiary-container/5"
                    : "border-outline-variant"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    state === "active" ? "text-primary animate-spin" : state === "done" ? "text-tertiary-container" : "text-outline"
                  }`}
                  aria-hidden="true"
                >
                  {state === "done" ? "check_circle" : stage.icon}
                </span>
                <span
                  className={`font-label-sm text-label-sm leading-tight ${
                    state === "active" ? "text-primary font-medium" : state === "done" ? "text-tertiary-container" : "text-outline"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {result && phase === "done" && (
        <div
          className={`rounded-lg p-md flex flex-col gap-1.5 ${
            result.recovered ? "bg-tertiary-container/10 border border-tertiary-container/30" : "bg-error-container/40 border border-error/30"
          }`}
        >
          <div className="flex items-center gap-sm font-headline-sm text-headline-sm">
            <span
              className={`material-symbols-outlined ${result.recovered ? "text-tertiary-container" : "text-error"}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              {result.recovered ? "check_circle" : "cancel"}
            </span>
            <span className={result.recovered ? "text-tertiary-container" : "text-error"}>
              {result.recovered ? `Recovered ${inr(result.recovered_inr)}` : "Not recovered"}
            </span>
          </div>
          <div className="font-body-md text-body-md text-on-surface-variant">
            Executed as <span className="font-medium text-on-surface">{ACTION_LABEL[result.executed_action]}</span>
            {result.is_override && (
              <>
                {" "}
                (agent actually chose <span className="font-medium text-on-surface">{ACTION_LABEL[result.agent_action]}</span>)
              </>
            )}
          </div>
          {result.bypassed_hard_rule && (
            <div className="flex items-start gap-1.5 font-label-md text-label-md text-error bg-error-container/60 px-2.5 py-1.5 rounded mt-1">
              <span className="material-symbols-outlined text-[14px] mt-0.5" aria-hidden="true">
                warning
              </span>
              <span>
                This override bypassed a real hard rule (<span className="font-medium">{result.bypassed_hard_rule.replace(/_/g, " ")}</span>) —
                in production this path is blocked, this is a hypothetical for comparison only.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-sm mt-md">
        <button
          onClick={() => run(null, `Agent's decision (${ACTION_LABEL[decision.action]})`)}
          disabled={phase === "playing"}
          className="bg-primary hover:opacity-90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-50 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            play_arrow
          </span>
          Simulate Agent's Decision
        </button>
        {decision.action !== "retry_now" && (
          <button
            onClick={() => run("retry_now", "Retry Now (override)")}
            disabled={phase === "playing"}
            className="bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Try "Retry Now" Instead
          </button>
        )}
        {phase === "done" && (
          <button onClick={reset} className="text-primary hover:underline text-sm font-medium px-2 py-2">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
