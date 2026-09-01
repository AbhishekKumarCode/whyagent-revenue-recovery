# WHY Agent

**Razorpay AI Buildathon 2026 — AI Revenue Recovery track.**

An AI agent that decides how to recover a failed UPI AutoPay payment, actually executes that
decision (in simulation), measures whether it worked against a held-out synthetic batch, and can
explain — live, on demand — exactly why it made each call. Not a black box, and not a static demo:
you can run the retry window forward and watch the real (synthetic) outcome resolve.

## Start here

- **[`HOW_IT_WORKS.md`](HOW_IT_WORKS.md)** — how the decision engine actually works, and a
  walkthrough of every screen. Start here if you want to understand or demo the app.
- **[`WHY_AGENT.md`](WHY_AGENT.md)** — the original idea/spec: problem, mechanism, why now.
- **[`why_agent/README.md`](why_agent/README.md)** — how to run the app, log in, and test it.
- **[`docs/`](docs/)** — PRD, TRD, implementation plan, standout/positioning notes, and the
  Google Stitch design prompt used to build the UI.

## Quickest path to seeing it work

```bash
cd why_agent
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd frontend-react && npm install && npm run build && cd ..
.venv/bin/uvicorn why_agent.api:app --port 8000
```
Open `http://localhost:8000/app/login` → **Continue as Demo Reviewer**.

## What's real vs. synthetic

- **Real:** the decision engine, the hard-rule enforcement, the regulatory timing logic (RBI
  pre-debit notice + NPCI blocked windows), the held-out batch evaluation, the login/auth system
  (hashed passwords, server-side sessions), and the retry-window simulation's outcome logic.
- **Synthetic:** the transaction and customer data itself, generated fresh each run — no real
  payments, no real people. See `why_agent/why_agent/data_gen.py`.

## Repository layout

```
HOW_IT_WORKS.md — how the decision engine works + a walkthrough of every screen
WHY_AGENT.md    — original idea/spec
docs/           — PRD, TRD, implementation flow, standout plan, design research
why_agent/      — the actual application (Python FastAPI backend + React frontend)
  README.md     — run instructions, login, tests
```
