# WHY Agent

AI Revenue Recovery — Razorpay AI Buildathon 2026. See `../docs/PRD.md`, `../docs/TRD.md`, and `../docs/IMPLEMENTATION_APP_FLOW.md` for the full spec.

## Run it

**Backend (FastAPI):**
```bash
cd why_agent
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn why_agent.api:app --port 8000
```

**Frontend (React, dev mode):**
```bash
cd frontend-react
npm install
npm run dev
```
Open `http://localhost:5173/app/` — the Vite dev server proxies API calls to the backend on `:8000`.

**Frontend (production build, served by the backend):**
```bash
cd frontend-react
npm install
npm run build
```
Then open `http://localhost:8000/app/` — FastAPI serves the built app directly (`why_agent/api.py` mounts `frontend-react/dist` under `/app`).

## Logging in

Auth is real (see "Auth" below) — open `/app/login` and either:
- Click **"Continue as Demo Reviewer"** — logs in as a seeded account (`demo@razorpay.com` / `demo1234`), created automatically on first backend startup.
- Register your own email/password under "Create Account".

## Optional: DeepSeek-backed Q&A

The "Ask Why" chat is grounded/template-based by default and works with no setup. To get broader, LLM-backed answers, create `why_agent/.env`:
```
DEEPSEEK_API_KEY=sk-...
```
On any failure (missing key, network error) it falls back to the deterministic template automatically — the demo never goes blank.

## Tests
```bash
cd why_agent
.venv/bin/python -m pytest tests/ -v
```

## Quick sanity check without a browser
```bash
.venv/bin/python -m why_agent.cli
```
Prints sample decisions, a live "why" Q&A demo, and the held-out batch evaluation vs. naive baseline.

## Project layout
```
why_agent/
  models.py       — data model (Transaction, CustomerHistory, Decision, EvaluationResult)
  data_gen.py     — synthetic dataset generator with hidden ground truth
  engine.py       — classify → evidence → decide → hard rules → regulatory timing
  evaluate.py     — held-out batch vs. naive baseline
  explain.py      — deterministic "why" Q&A fallback, grounded in the reasoning trace
  llm_explain.py  — DeepSeek-backed "why" Q&A (optional, see above)
  auth.py         — real auth: sqlite users, salted PBKDF2 password hashing, server-side sessions
  api.py          — FastAPI endpoints + serves the built frontend
  cli.py          — end-to-end sanity check
tests/            — 16 tests covering hard rules, regulatory timing, ground-truth isolation, evaluation
frontend-react/   — React + Vite + Tailwind dashboard, Razorpay-branded, real login gate
```

## Auth

Passwords are hashed with PBKDF2-SHA256 (per-user salt, 200k iterations) and stored in a local SQLite
file (`why_agent_users.db`, gitignored — created on first run). Sessions are server-side tokens held
in memory, so they reset on backend restart — a deliberate single-process demo trade-off, documented
in `why_agent/auth.py`. Every data endpoint requires a valid session (`Authorization: Bearer <token>`).
