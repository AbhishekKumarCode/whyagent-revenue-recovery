import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTransaction, askWhy, inr } from "../api.js";
import { ACTION_LABEL } from "../constants.js";
import { useActivity } from "../context/ActivityContext.jsx";
import TraceStep from "../components/TraceStep.jsx";

// One real, human-readable line per step — not just "Classify" with no content.
function summarizeStep(step) {
  const d = step.detail;
  switch (step.step) {
    case "classify":
      return `Failure reason: ${d.failure_reason.replace(/_/g, " ")}`;
    case "gather_evidence":
      return `Immediate retry ${Math.round(d.immediate_retry_success_rate * 100)}% likely to work, 6h-delayed ${Math.round(
        d.delayed_6h_retry_success_rate * 100
      )}%`;
    case "decide":
      return d.rationale;
    case "hard_rule_check":
      return d.result === "fail" ? d.detail : "No hard rule triggered — decision proceeds as planned";
    case "regulatory_timing_check":
      if (d.result === "n/a") return "No retry scheduled, so no timing constraint applies";
      return `Compliant — earliest allowed execution ${new Date(d.execution_scheduled_at).toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;
    default:
      return "";
  }
}

function Bubble({ role, text }) {
  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-xs max-w-[75%] self-end relative z-10">
        <span className="font-label-sm text-label-sm text-on-surface-variant pr-xs">You</span>
        <div className="bg-surface-container-highest text-on-surface p-md rounded-xl rounded-tr-sm border border-outline-variant">
          <p className="font-body-md text-body-md">{text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-xs max-w-[85%] self-start relative z-10">
      <div className="flex items-center gap-xs pl-xs">
        <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          smart_toy
        </span>
        <span className="font-label-sm text-label-sm text-primary font-semibold">WHY Agent</span>
      </div>
      <div className="bg-primary-fixed text-on-primary-fixed p-md rounded-xl rounded-tl-sm border border-outline-variant shadow-sm flex flex-col gap-md">
        <p className="font-body-md text-body-md leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

export default function WhyQA() {
  const { id } = useParams();
  const [txn, setTxn] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const threadRef = useRef(null);
  const seeded = useRef(false);
  const { logAction } = useActivity();

  useEffect(() => {
    // Reset the chat when navigating between transactions' Why pages (e.g. via the
    // History/Notifications dropdowns, which link straight to /transactions/{id}/why
    // and just swap the :id param on the already-mounted component) — otherwise the
    // previous transaction's conversation stays on screen and the seed question never
    // re-fires for the new one.
    setTxn(null);
    setMessages([]);
    seeded.current = false;
    getTransaction(id).then(setTxn);
  }, [id]);

  useEffect(() => {
    if (txn && !seeded.current) {
      seeded.current = true;
      send("Why did you make this decision?", { isSeed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(question, { isSeed = false } = {}) {
    setMessages((m) => [...m, { role: "user", text: question }]);
    const res = await askWhy(id, question);
    setMessages((m) => [...m, { role: "agent", text: res.answer }]);
    if (!isSeed) {
      logAction({
        icon: "psychology",
        text: `Asked the agent: "${question}"`,
        sub: res.answer.length > 90 ? res.answer.slice(0, 90) + "…" : res.answer,
        path: `/transactions/${id}/why`,
      });
    }
  }

  const handleSend = () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    send(q);
  };

  if (!txn) {
    return <div className="p-lg text-on-surface-variant">Loading…</div>;
  }

  return (
    <main className="h-full overflow-hidden flex bg-surface p-gutter gap-gutter">
      {/* Left: transaction context + audit trail */}
      <div className="w-[320px] shrink-0 flex flex-col gap-sm">
        <div className="flex items-center gap-xs text-on-surface-variant mb-xs">
          <Link className="font-label-md text-label-md hover:text-primary transition-colors" to={`/transactions/${id}`}>
            Transactions
          </Link>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
          <span className="font-label-md text-label-md text-on-surface font-semibold font-mono">{id}</span>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col gap-md">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-xs">Transaction ID</div>
              <div className="font-headline-sm text-headline-sm text-on-surface font-mono">{txn.transaction_id}</div>
            </div>
            <span className="bg-secondary-container text-on-secondary-container font-label-sm text-label-sm px-xs py-base rounded flex items-center gap-xs border border-secondary-fixed-dim">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {ACTION_LABEL[txn.decision.action]}
            </span>
          </div>
          <div className="h-px w-full bg-outline-variant" />
          <div className="flex flex-col gap-sm">
            <div className="flex justify-between items-center">
              <span className="font-label-md text-label-md text-on-surface-variant">Amount</span>
              <span className="font-body-md text-body-md text-on-surface font-semibold">{inr(txn.amount_inr)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-label-md text-label-md text-on-surface-variant">Method</span>
              <span className="font-body-md text-body-md text-on-surface">UPI AutoPay</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-label-md text-label-md text-on-surface-variant">Customer</span>
              <span className="font-body-md text-body-md text-on-surface">{txn.customer_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-label-md text-label-md text-on-surface-variant">Plan</span>
              <span className="font-body-md text-body-md text-on-surface text-right">{txn.plan_name}</span>
            </div>
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded p-md flex flex-col gap-sm flex-1 min-h-0">
          <div className="flex items-center gap-sm font-label-md text-label-md text-on-surface-variant uppercase tracking-wider shrink-0">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">history</span>
            Decision Audit Trail
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-outline-variant/40 -mx-1 px-1">
            {txn.decision.trace.map((step, i) => (
              <TraceStep key={step.step} index={i} step={step} summary={summarizeStep(step)} compact />
            ))}
          </div>
        </div>
      </div>

      {/* Right: chat */}
      <div className="flex-1 flex flex-col bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden h-full">
        <div className="flex items-center justify-between p-md border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden="true">psychology</span>
            <div className="flex flex-col">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">AI Decisioning Assistant</h2>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Explaining logic for {txn.transaction_id}</span>
            </div>
          </div>
          <div className="flex gap-sm">
            <Link
              to={`/transactions/${id}`}
              className="p-xs text-on-surface-variant hover:text-primary hover:bg-surface-container rounded transition-colors"
              title="Back to trace"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
            </Link>
          </div>
        </div>
        <div ref={threadRef} className="flex-1 overflow-y-auto p-lg flex flex-col gap-lg bg-surface relative">
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}
        </div>
        <div className="p-md border-t border-outline-variant bg-surface-container-lowest z-10 relative">
          <div className="relative flex items-center bg-surface border border-outline-variant rounded-md focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all shadow-sm">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="w-full bg-transparent border-none py-sm pl-md pr-[48px] focus:ring-0 outline-none font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant"
              placeholder="Ask why this decision was made…"
              type="text"
            />
            <div className="absolute right-sm flex gap-xs">
              <button
                onClick={handleSend}
                className="p-xs text-on-primary bg-primary hover:bg-primary-container rounded transition-colors flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>
              </button>
            </div>
          </div>
          <div className="text-center mt-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Grounded in the real decision trace — synthetic demo data.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
