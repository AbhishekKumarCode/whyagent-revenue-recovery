"""LLM-backed "why" Q&A — DeepSeek, strictly grounded in real app data.

Optional upgrade over explain.py's deterministic templates: this can field
genuinely open-ended questions ("what would you recommend for this customer",
"how does this compare to a naive retry", "what is this app for") instead of
only the handful of keyword-matched question shapes explain.py covers.

Grounding discipline: the model is given the FULL real context (transaction,
customer, decision trace, evaluation stats, hard rules, regulatory constants)
and is explicitly instructed to answer only from that context — never invent
numbers, never claim knowledge of real users (everything here is synthetic
data, see docs/PRD.md §3). Falls back to None (caller uses the template
answer instead) on any error, missing key, or timeout — the demo must never
go blank because a network call failed.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
TIMEOUT_SECONDS = 12

SYSTEM_PROMPT = """You are WHY Agent's live explainability assistant, embedded in a Razorpay AI \
Buildathon 2026 demo (track: AI Revenue Recovery). You answer questions about ONE specific \
synthetic transaction, or about the WHY Agent product itself, for someone watching a live demo \
or reviewing the app (a judge, a curious user, a developer).

How to write your answer — this matters as much as being correct:
1. Lead with the one-sentence plain-English reason first, like you'd say it out loud to a colleague \
— not a systems log. "We're messaging Tanya because retrying automatically almost never works for \
an expired mandate — she has to re-authorize it herself." NOT "The agent chose message_customer \
because failure_reason is mandate_expiry and evidence shows..."
2. Default to ZERO numbers. Describe things qualitatively ("waiting works a lot better", "this \
customer has been reliable for a long time") instead of citing percentages, scores, or thresholds — \
the exact figures already live in the audit-trail panel next to this chat, so repeating them here \
just makes the chat read like a systems log. Only state a specific number if the user's own question \
explicitly asks for one (e.g. "what's the success rate", "give me the exact number").
3. Skip boilerplate confirmations ("this passed all hard rules", "no timing constraint applied") \
unless the question is actually about safety/compliance — stating that nothing unusual happened is \
not useful unless asked.
4. Talk like a person, not a report: contractions are fine, short sentences are better than long \
ones, and it's fine to start with "Because..." or "Mainly because...".
5. Two to three sentences is normally enough. Only go longer if the question is genuinely broad \
(e.g. "explain the whole system to me").

Ground rules — follow these strictly:
1. Every number, name, and fact you state about the transaction, customer, or evaluation results \
must come directly from the CONTEXT JSON provided below. Never invent a number. If something \
isn't in the context, say you don't have that data rather than guessing.
2. All data in the context is SYNTHETIC — generated for a demo, not a real customer or real money. \
If asked "is this a real person" or similar, say clearly this is synthetic demo data.
3. You may answer general questions about how WHY Agent works, what problem it solves, its \
architecture, its bounded action list, its hard stopping rules, and its regulatory compliance \
approach (RBI e-mandate framework, NPCI execution windows) — this is all in the context too.
4. You may give reasonable RECOMMENDATIONS about this specific transaction/customer (e.g. "should \
we message this customer next") as long as you ground the recommendation in the actual evidence \
in the context (retry success rates, customer value score, fraud flag, etc) — be explicit that \
it's a recommendation, not a stated fact.
5. If asked something entirely unrelated to this app (general trivia, other topics), politely \
redirect: you're scoped to answering questions about this transaction and this product.
6. Plain text only — no markdown (no **bold**, no bullet points, no headers). This renders in a \
plain chat bubble, so markdown syntax would show up as literal asterisks.
"""


def _load_api_key() -> str | None:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if key:
        return key
    # Minimal .env loader (stdlib only, no python-dotenv dependency) — see why_agent/.env
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.isfile(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DEEPSEEK_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return None


def llm_answer(context: dict, question: str) -> str | None:
    """Returns a grounded answer, or None if the LLM call isn't available/fails
    (caller should fall back to explain.answer() in that case)."""
    api_key = _load_api_key()
    if not api_key:
        return None

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"CONTEXT JSON:\n{json.dumps(context, indent=2)}\n\nQuestion: {question}"},
        ],
        "temperature": 0.4,
        "max_tokens": 180,
    }
    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read())
            return body["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, IndexError, TimeoutError, ValueError):
        return None
