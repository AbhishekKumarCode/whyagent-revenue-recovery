import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTransactions, getEvaluation, fetchJSON, inr } from "../api.js";
import { FAILURE_REASON_LABEL, ACTION_LABEL } from "../constants.js";

function StatCard({ label, value, accent, trailing }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-lg shadow-sm flex flex-col justify-between">
      <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{label}</p>
      <div className="mt-sm flex items-baseline gap-sm">
        <h3
          className={`font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg ${
            accent || "text-on-surface"
          }`}
        >
          {value}
        </h3>
        {trailing}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [txns, setTxns] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [rules, setRules] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getTransactions().then(setTxns);
    getEvaluation().then(setEvalResult);
    fetchJSON("/rules").then(setRules);
  }, []);

  const byReason = useMemo(() => {
    if (!txns) return null;
    const counts = {};
    for (const t of txns) counts[t.failure_reason] = (counts[t.failure_reason] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [txns]);

  const needsAttention = useMemo(() => {
    if (!txns) return null;
    return txns.filter((t) => t.decision.hard_rule_triggered === "fraud_escalate").slice(0, 5);
  }, [txns]);

  const recent = txns?.slice(0, 5);
  const totalTriggers = rules?.hard_rules.reduce((s, r) => s + r.triggered_count, 0) ?? null;

  return (
    <main className="flex-1 overflow-y-auto p-md md:p-lg lg:p-margin-desktop">
      <div className="max-w-[1440px] mx-auto space-y-lg">
        <div>
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">
            Dashboard
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            At-a-glance state of this recovery batch — see the full list under Transactions.
          </p>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <StatCard
            label="Recovered This Batch"
            value={evalResult ? inr(evalResult.agent_total_recovered_inr) : "–"}
            accent="text-tertiary-container"
          />
          <StatCard
            label="Recovery Rate Lift vs Naive Baseline"
            value={
              evalResult
                ? evalResult.lift_pct === null
                  ? "n/a"
                  : `${evalResult.lift_pct >= 0 ? "+" : ""}${evalResult.lift_pct.toFixed(1)}%`
                : "–"
            }
            accent="text-primary-container"
            trailing={<span className="material-symbols-outlined text-primary-container" aria-hidden="true">arrow_upward</span>}
          />
          <StatCard label="Held-Out Batch Size" value={evalResult ? evalResult.batch_size.toLocaleString("en-IN") : "–"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
          {/* Needs Attention */}
          <div className="lg:col-span-1 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
            <div className="px-lg py-md border-b border-outline-variant bg-surface flex items-center gap-sm">
              <span className="material-symbols-outlined text-error text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                warning
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Needs Attention</h3>
              {needsAttention && (
                <span className="ml-auto font-label-sm text-label-sm bg-error-container text-on-error-container px-2 py-0.5 rounded-full">
                  {needsAttention.length}
                </span>
              )}
            </div>
            <div className="flex-1 divide-y divide-outline-variant">
              {needsAttention === null && <div className="p-lg text-on-surface-variant font-body-md text-body-md">Loading…</div>}
              {needsAttention?.length === 0 && (
                <div className="p-lg text-on-surface-variant font-body-md text-body-md">No fraud holds in this batch.</div>
              )}
              {needsAttention?.map((t) => (
                <button
                  key={t.transaction_id}
                  onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                  className="w-full text-left px-lg py-md hover:bg-surface-container-low transition-colors flex justify-between items-center"
                >
                  <div>
                    <div className="font-body-md text-body-md font-medium text-error">{t.customer_name}</div>
                    <div className="font-label-sm text-label-sm text-on-surface-variant">{FAILURE_REASON_LABEL[t.failure_reason]}</div>
                  </div>
                  <span className="mono-num text-error text-[13px] font-medium">{inr(t.amount_inr)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Failure reason breakdown */}
          <div className="lg:col-span-1 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
            <div className="px-lg py-md border-b border-outline-variant bg-surface flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">donut_small</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Failure Reasons</h3>
            </div>
            <div className="flex-1 p-lg flex flex-col gap-sm">
              {byReason === null && <div className="text-on-surface-variant font-body-md text-body-md">Loading…</div>}
              {byReason?.map(([reason, count]) => {
                const pct = Math.round((count / txns.length) * 100);
                return (
                  <div key={reason}>
                    <div className="flex justify-between font-label-md text-label-md text-on-surface mb-1">
                      <span>{FAILURE_REASON_LABEL[reason]}</span>
                      <span className="mono-num text-on-surface-variant">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-variant rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hard rule activity */}
          <div className="lg:col-span-1 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
            <div className="px-lg py-md border-b border-outline-variant bg-surface flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">gpp_good</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Hard Rules This Batch</h3>
            </div>
            <div className="flex-1 p-lg flex flex-col gap-md">
              {rules === null && <div className="text-on-surface-variant font-body-md text-body-md">Loading…</div>}
              {rules?.hard_rules.map((r) => (
                <div key={r.id} className="flex justify-between items-center">
                  <span className="font-body-md text-body-md text-on-surface">{r.name}</span>
                  <span
                    className={`mono-num text-[13px] font-medium ${r.triggered_count > 0 ? "text-error" : "text-on-surface-variant"}`}
                  >
                    {r.triggered_count}×
                  </span>
                </div>
              ))}
              {rules && (
                <button
                  onClick={() => navigate("/rules")}
                  className="mt-auto text-left font-label-md text-label-md text-primary hover:underline"
                >
                  View full rule definitions →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recent activity preview */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="px-lg py-md border-b border-outline-variant bg-surface flex justify-between items-center">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Recent Activity</h3>
            <button onClick={() => navigate("/transactions")} className="font-label-md text-label-md text-primary hover:underline">
              View all transactions →
            </button>
          </div>
          <div className="divide-y divide-outline-variant">
            {recent === undefined && <div className="p-lg text-on-surface-variant font-body-md text-body-md">Loading…</div>}
            {recent?.map((t) => {
              const isFraud = t.decision.hard_rule_triggered === "fraud_escalate";
              return (
                <button
                  key={t.transaction_id}
                  onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                  className="w-full text-left px-lg py-md hover:bg-surface-container-low transition-colors flex items-center justify-between gap-md"
                >
                  <div className="flex-1 min-w-0">
                    <div className={`font-body-md text-body-md font-medium truncate ${isFraud ? "text-error" : "text-on-surface"}`}>
                      {t.customer_name}
                    </div>
                    <div className="font-label-sm text-label-sm text-on-surface-variant">{t.plan_name}</div>
                  </div>
                  <span className="mono-num text-on-surface text-[13px] shrink-0">{inr(t.amount_inr)}</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0 w-32 text-right">
                    {isFraud ? "Fraud — Hold" : ACTION_LABEL[t.decision.action]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="h-lg w-full" />
      </div>
    </main>
  );
}
