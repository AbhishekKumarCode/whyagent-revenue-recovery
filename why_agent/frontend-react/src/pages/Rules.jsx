import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import { ACTION_LABEL } from "../constants.js";

const RULE_ICON = {
  max_retries: "restart_alt",
  fraud_escalate: "gpp_maybe",
  do_not_contact: "block",
  cost_not_worth_it: "payments",
};

function formatWindow([start, end]) {
  const fmt = (h) => {
    const hour = Math.floor(h);
    const min = Math.round((h - hour) * 60);
    const period = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return min === 0 ? `${h12}:00 ${period}` : `${h12}:${min} ${period}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

export default function Rules() {
  const [rules, setRules] = useState(null);

  useEffect(() => {
    fetchJSON("/rules").then(setRules);
  }, []);

  if (!rules) {
    return <div className="p-lg text-on-surface-variant">Loading…</div>;
  }

  return (
    <main className="flex-1 overflow-y-auto bg-background p-margin-mobile md:p-margin-desktop">
      <div className="max-w-[1024px] mx-auto space-y-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background mb-xs">Settings</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Fixed constraints the agent operates under — not configurable knobs, non-negotiable guardrails.
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">database</span>
            Demo Session
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            <div>
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Total Transactions</div>
              <div className="mono-num text-on-surface text-[18px] font-semibold">{rules.demo_session.dataset_size}</div>
            </div>
            <div>
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Held-Out Batch</div>
              <div className="mono-num text-on-surface text-[18px] font-semibold">{rules.demo_session.held_out_batch_size}</div>
            </div>
            <div>
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Unique Customers</div>
              <div className="mono-num text-on-surface text-[18px] font-semibold">{rules.demo_session.unique_customers}</div>
            </div>
            <div>
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Live Q&A Backend</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${rules.demo_session.llm_backed_qa_enabled ? "bg-tertiary-container" : "bg-outline"}`} />
                <span className="font-body-md text-body-md text-on-surface">
                  {rules.demo_session.llm_backed_qa_enabled ? "DeepSeek" : "Template fallback"}
                </span>
              </div>
            </div>
          </div>
          <p className="font-label-md text-label-md text-outline mt-md pt-md border-t border-outline-variant">
            All data on this page is synthetic, generated fresh for this demo session — not real transactions or real customers.
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-xs flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">rule</span>
            Bounded Action List
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-md">
            The agent can only ever choose one of these five actions — nothing else.
          </p>
          <div className="flex flex-wrap gap-sm mb-sm">
            {rules.bounded_action_list.map((a) => (
              <span
                key={a}
                className="font-label-md text-label-md bg-surface-container border border-outline-variant text-on-surface px-3 py-1.5 rounded-full"
              >
                {ACTION_LABEL[a]}
              </span>
            ))}
          </div>
          <p className="font-label-md text-label-md text-outline mt-md pt-md border-t border-outline-variant">
            Why 6 hours for "Retry in 6h"? Insufficient-balance failures often resolve on a salary-credit or top-up
            cycle, not a quick-retry cycle — so waiting a few hours gives the balance a real chance to change. That
            said, 6h is an assumption carried over from the original spec, not a number tuned against real data.
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">gpp_good</span>
            Hard Stopping Rules
          </h2>
          <div className="divide-y divide-outline-variant">
            {rules.hard_rules.map((r) => (
              <div key={r.id} className="py-md flex items-start justify-between gap-md">
                <div className="flex items-start gap-sm">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px] mt-0.5" aria-hidden="true">{RULE_ICON[r.id] || "rule"}</span>
                  <div>
                    <div className="font-body-md text-body-md font-semibold text-on-surface">{r.name}</div>
                    <div className="font-body-md text-body-md text-on-surface-variant">{r.detail}</div>
                    {r.caveat && (
                      <div className="flex items-start gap-1.5 mt-1.5 font-label-md text-label-md text-on-surface-variant bg-surface-container px-2.5 py-1.5 rounded">
                        <span className="material-symbols-outlined text-primary text-[14px] mt-0.5" aria-hidden="true">info</span>
                        <span>{r.caveat}</span>
                      </div>
                    )}
                  </div>
                </div>
                {r.triggered_count > 0 && (
                  <span className="shrink-0 mono-num text-[12px] bg-error-container text-on-error-container px-2 py-1 rounded-full font-medium">
                    triggered {r.triggered_count}× this batch
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">balance</span>
            Regulatory Compliance
          </h2>
          <div className="space-y-sm">
            <div className="flex justify-between items-center data-row border-b border-[#E3E8EF] px-xs">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Pre-debit notification</span>
              <span className="mono-num text-on-surface text-[14px] text-right">
                {rules.regulatory_compliance.pre_debit_notification_lead_hours}h minimum — RBI's 2026 e-mandate framework
              </span>
            </div>
            <div className="flex justify-between items-center data-row px-xs">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">NPCI blocked windows</span>
              <span className="mono-num text-on-surface text-[14px]">
                {rules.regulatory_compliance.npci_blocked_windows.map(formatWindow).join(", ")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
