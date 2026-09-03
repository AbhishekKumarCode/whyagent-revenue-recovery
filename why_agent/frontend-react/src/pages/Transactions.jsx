import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getTransactions, getEvaluation, inr } from "../api.js";
import { FAILURE_REASON_LABEL, ACTION_LABEL } from "../constants.js";
import ErrorState from "../components/ErrorState.jsx";

const ACTION_ICON = {
  retry_now: "pending",
  retry_later: "pending",
  message_customer: "chat",
  hold: "pause_circle",
  give_up: "cancel",
};

const PAGE_SIZE = 8;

// Same real cutoff the agent's hard rules use (engine.py's COST_VALUE_CUTOFF) —
// flagging low-value customers here is grounded in an actual threshold the
// decision pipeline enforces, not an invented visual category.
const LOW_VALUE_CUTOFF = 0.15;

function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function exportCsv(rows) {
  const header = ["transaction_id", "customer_name", "plan_name", "amount_inr", "failure_reason", "decision"];
  const lines = [header.join(",")];
  for (const t of rows) {
    lines.push(
      [t.transaction_id, `"${t.customer_name}"`, `"${t.plan_name}"`, t.amount_inr, t.failure_reason, t.decision.action].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "why-agent-transactions.csv";
  // Firefox requires the link to be attached to the document for .click() to fire
  // reliably; revoking the object URL synchronously can also race the download
  // starting, so both are deferred slightly.
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export default function Transactions() {
  const [txns, setTxns] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const query = (searchParams.get("q") || "").toLowerCase();
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError(null);
    getTransactions().then(setTxns).catch(() => setError(true));
    getEvaluation().then(setEvalResult).catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    if (!txns) return null;
    if (!query) return txns;
    return txns.filter(
      (t) =>
        t.customer_name.toLowerCase().includes(query) ||
        t.plan_name.toLowerCase().includes(query) ||
        t.transaction_id.toLowerCase().includes(query) ||
        FAILURE_REASON_LABEL[t.failure_reason].toLowerCase().includes(query)
    );
  }, [txns, query]);

  useEffect(() => setPage(0), [query]);

  const pageRows = filtered?.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = filtered ? Math.ceil(filtered.length / PAGE_SIZE) : 0;

  if (error) {
    return (
      <main className="flex-1 overflow-y-auto p-md md:p-lg lg:p-margin-desktop">
        <ErrorState message="Couldn't load transactions." onRetry={load} />
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-md md:p-lg lg:p-margin-desktop">
      <div className="max-w-[1440px] mx-auto space-y-lg">
        {/* Page Header */}
        <div className="flex justify-between items-end mb-md">
          <div>
            <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">
              Transactions
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
              Every failed UPI AutoPay payment and what the agent decided.
            </p>
          </div>
          <div className="hidden sm:flex gap-sm">
            <button
              onClick={() => filtered && exportCsv(filtered)}
              disabled={!filtered?.length}
              className="bg-surface-container-lowest border border-outline-variant text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container transition-colors shadow-sm flex items-center gap-xs disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
              Export
            </button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-lg shadow-sm flex flex-col justify-between">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Recovered This Batch</p>
            <div className="mt-sm flex items-baseline gap-sm">
              <h3 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-tertiary-container">
                {evalResult ? inr(evalResult.agent_total_recovered_inr) : "–"}
              </h3>
            </div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-lg shadow-sm flex flex-col justify-between">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Recovery Rate Lift vs Naive Baseline
            </p>
            <div className="mt-sm flex items-baseline gap-sm">
              <h3 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary-container">
                {evalResult
                  ? evalResult.lift_pct === null
                    ? "n/a"
                    : `${evalResult.lift_pct >= 0 ? "+" : ""}${evalResult.lift_pct.toFixed(1)}%`
                  : "–"}
              </h3>
              <span className="material-symbols-outlined text-primary-container" aria-hidden="true">arrow_upward</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-lg shadow-sm flex flex-col justify-between">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Held-Out Batch Size</p>
            <div className="mt-sm">
              <h3 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">
                {evalResult ? evalResult.batch_size.toLocaleString("en-IN") : "–"}
              </h3>
            </div>
          </div>
        </div>

        {/* Main Data Table */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden mt-xl">
          <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Failed UPI AutoPay Payments</h3>
            <button
              className="text-on-surface-variant hover:text-primary transition-colors"
              title="Column filters not built for this demo — use the search box above"
            >
              <span className="material-symbols-outlined" aria-hidden="true">filter_list</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant font-label-md text-label-md text-on-surface-variant">
                  <th className="py-sm px-md font-semibold w-[30%]">Customer</th>
                  <th className="py-sm px-md font-semibold w-1/6">Amount (₹)</th>
                  <th className="py-sm px-md font-semibold w-1/5">Failure Reason</th>
                  <th className="py-sm px-md font-semibold w-1/5">Agent Decision</th>
                  <th className="py-sm px-md font-semibold w-1/12 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface divide-y divide-outline-variant">
                {txns === null && (
                  <tr>
                    <td colSpan={5} className="py-lg px-md text-center text-on-surface-variant">
                      Loading…
                    </td>
                  </tr>
                )}
                {txns !== null && pageRows?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-lg px-md text-center text-on-surface-variant">
                      No transactions match "{query}"
                    </td>
                  </tr>
                )}
                {pageRows?.map((t) => {
                  const isFraud = t.decision.hard_rule_triggered === "fraud_escalate";
                  const ctx = t.customer_context || {};
                  const isLowValue = ctx.customer_value_score != null && ctx.customer_value_score < LOW_VALUE_CUTOFF;
                  return (
                    <tr
                      key={t.transaction_id}
                      onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                      className={`table-row-hover transition-colors cursor-pointer hover:bg-surface-container-low ${
                        isFraud ? "bg-error-container/20" : ""
                      }`}
                    >
                      <td className="py-md px-md">
                        <div className="flex items-center gap-sm">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-label-sm text-label-sm font-semibold shrink-0 ${
                              isFraud ? "bg-error-container text-on-error-container" : "bg-secondary-container text-on-secondary-container"
                            }`}
                          >
                            {initials(t.customer_name)}
                          </div>
                          <div className="min-w-0">
                            <div className={`font-medium truncate ${isFraud ? "text-error" : ""}`}>{t.customer_name}</div>
                            <div className="text-xs text-on-surface-variant truncate flex items-center gap-1 flex-wrap">
                              <span>{t.plan_name}</span>
                              {ctx.months_active != null && <span>· {ctx.months_active}mo customer</span>}
                              {ctx.on_time_payment_rate != null && <span>· {Math.round(ctx.on_time_payment_rate * 100)}% on-time</span>}
                            </div>
                            {(ctx.is_do_not_contact || isLowValue) && (
                              <div className="flex items-center gap-xs mt-0.5">
                                {ctx.is_do_not_contact && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                                    <span className="material-symbols-outlined text-[11px]" aria-hidden="true">block</span>
                                    Do-not-contact
                                  </span>
                                )}
                                {isLowValue && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                                    <span className="material-symbols-outlined text-[11px]" aria-hidden="true">trending_down</span>
                                    Low value
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`py-md px-md font-medium tabular-nums ${isFraud ? "text-error" : ""}`}>{inr(t.amount_inr)}</td>
                      <td className="py-md px-md">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-surface-variant text-on-surface-variant text-xs font-medium">
                          {FAILURE_REASON_LABEL[t.failure_reason]}
                        </span>
                      </td>
                      <td className="py-md px-md">
                        {isFraud ? (
                          <span className="inline-flex items-center px-3 py-1.5 rounded bg-error text-on-error font-bold text-xs shadow-sm shadow-error/20 border border-error/50">
                            <span className="material-symbols-outlined text-[14px] mr-1" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                              warning
                            </span>
                            Fraud Flagged — Hold
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded bg-primary-container/10 text-primary-container border border-primary-container/20 text-xs font-medium">
                            {ACTION_LABEL[t.decision.action]}
                          </span>
                        )}
                      </td>
                      <td className="py-md px-md text-center">
                        <span className={`material-symbols-outlined text-[18px] ${isFraud ? "text-error" : "text-outline"}`}>
                          {isFraud ? "block" : ACTION_ICON[t.decision.action]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-lg py-sm border-t border-outline-variant flex justify-between items-center bg-surface-container-low">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {filtered ? `Showing ${pageRows?.length || 0} of ${filtered.length} rows` : "Loading…"}
            </span>
            <div className="flex gap-xs">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-xs text-on-surface-variant hover:text-on-surface disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="p-xs text-on-surface-variant hover:text-on-surface disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
        <div className="h-lg w-full" />
      </div>
    </main>
  );
}
