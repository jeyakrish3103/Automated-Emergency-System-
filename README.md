# Automated Emergency Response & Alert System

Course project prototype. Simulates automated emergency dispatch — **not**
connected to real government infrastructure. See `CLAUDE (1).md` for full
architecture notes and `BACKEND_PLAN.md` for the API the frontend builds against.

## Backend setup

1. **Install dependencies**
   ```
   pip install -r requirements-dev.txt
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then:
   - In the SQL editor, run `backend/data/schema.sql` (creates tables + enables Realtime).
   - Then run `backend/data/stations_seed.sql` (adds fake stations to dispatch to).
   - From Project Settings → API, copy the Project URL and the `service_role`
     key into `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).

3. **Get a Gemini API key** at [Google AI Studio](https://aistudio.google.com/apikey)
   and put it in `.env.local` as `GEMINI_API_KEY`.

4. **Run the tests** (these don't need the credentials above — they cover the
   pure logic: distance math, triage fallback, escalation rules):
   ```
   pytest
   ```

5. **Run locally against the real services** (needs step 2-3 done first):
   ```
   vercel dev
   ```

## Project structure

- `backend/api/` — the FastAPI app. `index.py` is the single entrypoint that
  mounts every route; each other file handles one endpoint. `supabase_client.py`,
  `triage.py`, and `dispatch.py` are shared logic imported by the endpoint
  files, not endpoints themselves.
- `backend/data/` — SQL schema + seed data for Supabase.
- `backend/tests/` — pytest suite (no live credentials needed).
- `frontend/public/` — static frontend (`reporter.html`, `dashboard.html`,
  `style.css`, `script.js`, `realtime.js`), served by the backend at request
  time via a StaticFiles mount.

See `CLAUDE (1).md` for the full architecture rationale.
