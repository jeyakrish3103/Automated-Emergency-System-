# Automated Emergency Response & Alert System

Course project prototype. Simulates automated emergency dispatch — NOT connected to
real government infrastructure (ERSS-112). All station/responder data is synthetic,
seeded around SRM Ramapuram / Chennai for realism.

## Setup — run once per new environment

On first session in this repo, check whether these are installed and install any
that are missing (ask before installing if not already confirmed with the user):

```
/plugin install pyright-lsp@claude-plugins-official
/plugin install vercel@claude-plugins-official
/plugin install supabase@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
/plugin install commit-commands@claude-plugins-official
```

- `pyright-lsp` needs the `pyright` binary available on PATH — install with
  `pip install pyright --break-system-packages` if missing.
- `security-guidance` should review every change before it's committed — this project
  handles API keys (Gemini, Supabase) and must never leak them into code or logs.
- `vercel` / `supabase` MCP servers let Claude inspect the live deployment and
  database directly instead of guessing — use them when debugging deploy issues.

## Tech stack

| Layer | Tool |
|---|---|
| Backend | Python + FastAPI, deployed as Vercel serverless functions |
| Database | Supabase (Postgres) |
| Real-time updates | Supabase Realtime (NOT WebSockets — Vercel serverless can't hold them open) |
| Frontend | Plain HTML/CSS/JS (React only if explicitly requested later) |
| Voice in/out | Browser Web Speech API + Speech Synthesis API (no external service) |
| AI triage | Gemini API |
| Maps | Leaflet.js + OpenStreetMap |
| Hosting | Vercel (single project — frontend + backend together) |

## Project structure

```
emergency-response-app/
├── api/                     # Vercel serverless functions (each file = one endpoint)
│   ├── alert.py             # POST /api/alert — receives transcript, runs triage+dispatch
│   ├── triage.py            # Gemini call + severity/type decision logic
│   ├── dispatch.py          # Nearest-available-station lookup (Haversine)
│   └── supabase_client.py   # Shared Supabase connection
├── public/                  # Static frontend, served directly by Vercel
│   ├── reporter.html        # Voice button + live status (the person in distress)
│   ├── dashboard.html       # Station view: live alerts + map
│   ├── style.css
│   ├── script.js            # Speech API, fetch calls to /api/alert
│   └── realtime.js          # Supabase Realtime subscription (dashboard live updates)
├── data/
│   └── stations_seed.sql    # Seed data for fake Chennai-area stations
├── requirements.txt
├── vercel.json               # Routes /api vs static pages
├── .env.local                # SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY — never commit
└── README.md
```

## Core automated loop — do not silently simplify this

This is the actual thesis of the project. Don't collapse it back into a one-shot
"create alert, done" flow without asking first.

1. **Trigger** — voice (Web Speech API transcript), tap, or silent mode
2. **Triage / score** — transcript → Gemini → `{type, severity 1-5, summary}`
3. **Decide** — nearest station/responder that is both closest AND currently
   available (check status, don't just do raw distance)
4. **Notify** — insert alert row into Supabase → Realtime pushes it to the dashboard
   instantly
5. **Monitor** — while `status = active`, periodically check in with the reporter;
   if a check-in is missed or motion pattern suggests a fall/struggle, re-run step 2
   with updated data and escalate if severity increases
6. **Resolved** — only set by explicit confirmation from reporter or responder,
   logged with a timestamp

## Data model

- `alerts`: id, user_id, type, severity, lat, lng, status, summary, escalation_count,
  last_checkin, created_at, resolved_at
- `stations`: id, name, category, lat, lng, contact_info, status (available/busy)
- `users`: id, name, phone, emergency_contacts, medical_info
- `alert_log`: alert_id, event, timestamp (for response-time analytics)

## Known, deliberate compromises — do not "fix" without asking

- **Polling/Realtime instead of raw WebSockets** — Vercel serverless can't hold
  persistent connections. Supabase Realtime is the correct substitute here, not a
  workaround to remove later.
- **In-browser voice agent, not real telephony** — no Twilio, no phone number. This
  is intentional; real telephony is documented as future work, not a gap to close.
- **Rule-based severity scoring is acceptable as a v1** — a full ML model is out of
  scope; keep the scoring function isolated and swappable.

## Conventions

- Never hardcode API keys or Supabase credentials — always read from environment
  variables via `.env.local` (gitignored).
- Each file in `api/` should do exactly one job — if a function grows to handle two
  concerns, split it into a new file rather than branching internally.
- Keep frontend JS framework-free unless explicitly told to add React.
- Every new Supabase table change should be reflected in the **Data model** section
  above — keep this file in sync with the actual schema.

## Team

2–3 person team, zero prior backend/frontend experience. Prefer explaining *why*
a piece of code works, not just writing it — this file exists so onboarding a new
teammate doesn't require re-explaining the architecture from scratch.
