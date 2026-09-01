import { useEffect, useState } from "react";
import { getEvaluation, fetchJSON, inr } from "../api.js";
import { FAILURE_REASON_LABEL } from "../constants.js";
import { DonutChart, GroupedBarRow, REASON_COLOR } from "../components/charts.jsx";

const AGENT_COLOR = "#005faf"; // brand primary — fixed role, not part of the categorical set
const NAIVE_COLOR = "#a8afb8"; // neutral — the baseline, deliberately recessive

function fpBadge(pct) {
  if (pct < 5) return { label: "Low", cls: "bg-tertiary-container/10 text-tertiary-container" };
  if (pct < 15) return { label: "Medium", cls: "bg-primary-container/10 text-primary-container" };
  return { label: "High", cls: "bg-error-container text-on-error-container" };
}

export default function Evaluation() {
  const [r, setR] = useState(null);
  const [byReason, setByReason] = useState(null);

  useEffect(() => {
    getEvaluation().then(setR);
    fetchJSON("/evaluation/by-reason").then(setByReason);
  }, []);

  if (!r) {
    return <div className="p-lg text-on-surface-variant">Loading…</div>;
  }

  const absoluteLift = r.agent_recovery_rate_pct - r.naive_recovery_rate_pct;
  const agentBadge = fpBadge(r.agent_false_positive_rate_pct);
  const naiveBadge = fpBadge(r.naive_false_positive_rate_pct);

  return (
    <main className="flex-1 overflow-y-auto bg-background p-margin-mobile md:p-margin-desktop">
      <div className="max-w-[1024px] mx-auto space-y-xl">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background mb-xs">
            Evaluation Results <span className="text-on-surface-variant font-body-lg">(Held-out Batch)</span>
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Performance comparison of WHY Agent vs. Naive Baseline (1h retry).
          </p>
        </div>

        <div className="bg-surface-container-lowest hairline-border rounded-[6px] overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* WHY Agent Column */}
            <div className="p-lg md:border-r border-outline-variant relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
              <div className="flex items-center gap-sm mb-lg">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                  smart_toy
                </span>
                <h2 className="font-headline-md text-headline-md text-on-surface">WHY Agent</h2>
              </div>
              <div className="space-y-sm">
                <div className="flex justify-between items-center data-row border-b border-[#E3E8EF] px-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Recovery Rate</span>
                  <span className="mono-num font-semibold text-tertiary-container text-[16px]">{r.agent_recovery_rate_pct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center data-row border-b border-[#E3E8EF] px-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Recovered</span>
                  <span className="mono-num font-semibold text-on-surface text-[16px]">{inr(r.agent_total_recovered_inr)}</span>
                </div>
                <div className="flex justify-between items-center data-row px-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">False-Positive Cost</span>
                  <div className="flex items-center gap-xs">
                    <span className={`font-label-md text-label-md px-2 py-0.5 rounded-[4px] ${agentBadge.cls}`}>{agentBadge.label}</span>
                    <span className="mono-num text-[12px] text-on-surface-variant">({r.agent_false_positive_rate_pct.toFixed(1)}% wasted)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Naive Baseline Column */}
            <div className="p-lg bg-[#F9FAFB] relative border-t md:border-t-0 border-outline-variant">
              <div className="flex items-center gap-sm mb-lg opacity-70">
                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">schedule</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface-variant">
                  Naive Baseline <span className="font-body-md font-normal text-outline">(Always retry after 1h)</span>
                </h2>
              </div>
              <div className="space-y-sm opacity-80">
                <div className="flex justify-between items-center data-row border-b border-[#E3E8EF] px-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Recovery Rate</span>
                  <span className="mono-num font-medium text-on-surface text-[16px]">{r.naive_recovery_rate_pct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center data-row border-b border-[#E3E8EF] px-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Recovered</span>
                  <span className="mono-num font-medium text-on-surface text-[16px]">{inr(r.naive_total_recovered_inr)}</span>
                </div>
                <div className="flex justify-between items-center data-row px-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">False-Positive Cost</span>
                  <div className="flex items-center gap-xs">
                    <span className={`font-label-md text-label-md px-2 py-0.5 rounded-[4px] ${naiveBadge.cls}`}>{naiveBadge.label}</span>
                    <span className="mono-num text-[12px] text-on-surface-variant">({r.naive_false_positive_rate_pct.toFixed(1)}% wasted)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#E3E8EF] bg-surface p-md flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Net Recovery Improvement</span>
            <div className="flex items-center gap-md">
              <div className="flex flex-col items-end">
                <span className="mono-num font-semibold text-tertiary-container text-[16px]">
                  {absoluteLift >= 0 ? "+" : ""}
                  {absoluteLift.toFixed(1)}% absolute lift
                </span>
                <span className="mono-num text-[12px] text-on-surface-variant">
                  {r.lift_pct >= 0 ? "+" : ""}
                  {r.lift_pct.toFixed(0)}% relative improvement
                </span>
              </div>
              <div className="w-[120px] h-2 bg-surface-variant rounded-full overflow-hidden hidden sm:block">
                <div
                  className="h-full bg-tertiary-container rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, r.lift_pct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-sm pt-md border-t border-outline-variant">
          <span className="material-symbols-outlined text-[16px] text-outline mt-[2px]" aria-hidden="true">info</span>
          <p className="font-label-md text-label-md text-outline leading-tight">
            Held-out batch — decision logic never saw these outcomes before deciding.
          </p>
        </div>

        {/* Per-failure-reason breakdown — the agent's advantage isn't uniform across
            reasons, so the aggregate number alone hides where it actually helps. */}
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-xs">Performance by Failure Reason</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-md">
            The aggregate lift above is an average — here's where it's actually coming from.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-md">
            {/* Distribution donut */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-lg">
              <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-md">
                Held-Out Batch Distribution
              </h3>
              {byReason && (
                <div className="flex items-center gap-lg">
                  <DonutChart
                    segments={byReason.map((r) => ({
                      key: r.failure_reason,
                      value: r.batch_size,
                      color: REASON_COLOR[r.failure_reason]?.light || "#a8afb8",
                    }))}
                  />
                  <div className="flex-1 flex flex-col gap-sm">
                    {byReason.map((r) => {
                      const total = byReason.reduce((s, x) => s + x.batch_size, 0);
                      const pct = Math.round((r.batch_size / total) * 100);
                      return (
                        <div key={r.failure_reason} className="flex items-center gap-sm">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: REASON_COLOR[r.failure_reason]?.light || "#a8afb8" }}
                          />
                          <span className="font-body-md text-body-md text-on-surface flex-1">
                            {FAILURE_REASON_LABEL[r.failure_reason]}
                          </span>
                          <span className="mono-num text-[12px] text-on-surface-variant">
                            {r.batch_size} · {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Agent vs Naive per reason */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-lg">
              <div className="flex items-center justify-between mb-md">
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Recovery Rate by Reason</h3>
                <div className="flex items-center gap-md">
                  <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: AGENT_COLOR }} />
                    Agent
                  </span>
                  <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: NAIVE_COLOR }} />
                    Naive
                  </span>
                </div>
              </div>
              {byReason?.map((r) => (
                <GroupedBarRow
                  key={r.failure_reason}
                  label={FAILURE_REASON_LABEL[r.failure_reason]}
                  agentPct={r.agent_recovery_rate_pct}
                  naivePct={r.naive_recovery_rate_pct}
                  agentColor={AGENT_COLOR}
                  naiveColor={NAIVE_COLOR}
                />
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant font-label-md text-label-md text-on-surface-variant">
                  <th className="py-sm px-md font-semibold">Failure Reason</th>
                  <th className="py-sm px-md font-semibold text-right">Batch Size</th>
                  <th className="py-sm px-md font-semibold text-right">Agent Rate</th>
                  <th className="py-sm px-md font-semibold text-right">Naive Rate</th>
                  <th className="py-sm px-md font-semibold text-right">Lift</th>
                  <th className="py-sm px-md font-semibold text-right">Recovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {byReason === null && (
                  <tr>
                    <td colSpan={6} className="py-lg px-md text-center text-on-surface-variant">
                      Loading…
                    </td>
                  </tr>
                )}
                {byReason?.map((row) => (
                  <tr key={row.failure_reason}>
                    <td className="py-md px-md font-body-md text-body-md text-on-surface">
                      {FAILURE_REASON_LABEL[row.failure_reason] || row.failure_reason}
                    </td>
                    <td className="py-md px-md text-right mono-num text-on-surface-variant text-[13px]">{row.batch_size}</td>
                    <td className="py-md px-md text-right mono-num text-tertiary-container text-[13px] font-medium">
                      {row.agent_recovery_rate_pct.toFixed(1)}%
                    </td>
                    <td className="py-md px-md text-right mono-num text-on-surface-variant text-[13px]">
                      {row.naive_recovery_rate_pct.toFixed(1)}%
                    </td>
                    <td className="py-md px-md text-right mono-num text-[13px] font-medium">
                      {row.lift_pct === null ? (
                        <span className="text-on-surface-variant">n/a</span>
                      ) : (
                        <span className={row.lift_pct >= 0 ? "text-tertiary-container" : "text-error"}>
                          {row.lift_pct >= 0 ? "+" : ""}
                          {row.lift_pct.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="py-md px-md text-right mono-num text-on-surface text-[13px]">{inr(row.recovered_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
