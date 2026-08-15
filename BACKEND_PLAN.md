# Backend Plan — Automated Emergency Response & Alert System

*Last updated: 2026-08-14*

This is a course project prototype simulating automated emergency dispatch — **not**
connected to real government infrastructure (ERSS-112). All station data is
synthetic, seeded with fictional stations for testing.

This document explains how the backend is being built, so the frontend (the other
2 team members, possibly using their own AI agent) can start building the
reporter and dashboard pages right away, without waiting for the backend to be
finished first. It's a working plan, not a locked spec — the backend is still
being actively built, and the last section explains what to expect if details
shift.

If you're an AI agent picking this up to build frontend: read the whole thing
before writing fetch calls. The example JSON in each section is realistic and
safe to build UI against right now, even before the real endpoints exist.

---

## 1. How the system works, end to end

1. **Trigger** — someone in distress opens `reporter.html` and speaks. The
   browser's Web Speech API turns that into a text transcript.
2. **Triage** — the transcript is sent to the backend, which calls Gemini to
   figure out the incident `type` and a `severity` from 1 (minor) to 5
   (critical), plus a one-line summary for dispatchers.
3. **Decide** — the backend looks at all stations, filters to ones that handle
   this incident type and are currently `available` (not `busy`), and picks the
   closest one (Haversine distance on lat/lng).
4. **Notify** — the alert is saved to Supabase. Supabase Realtime instantly
   pushes it to anyone watching `dashboard.html` — no polling needed.
5. **Monitor** — while an alert is active, the reporter's page periodically
   checks in. If a check-in is missed, or something suggests the situation is
   getting worse, the backend re-triages and can escalate the severity.
6. **Resolved** — only set when a reporter or responder explicitly confirms it's
   over. Everything is logged with timestamps for later analysis.

Frontend's job is basically: **`reporter.html`** starts step 1 and periodically
does step 5; **`dashboard.html`** displays live state from steps 4-6 on a map.

---

## 2. What the backend exposes

All endpoints live under `/api/` (same origin as the static frontend on Vercel,
so no CORS headaches). No authentication in v1 — everything's open for the
prototype. All requests/responses are JSON.

### `POST /api/alert`
Reporter submits a transcript + location. Backend runs triage and dispatch
server-side and returns what it decided.

Request:
```json
{
  "transcript": "There's a fire on the second floor, people are trapped",
  "latitude": 13.05,
  "longitude": 80.21
}
```

Response (201):
```json
{
  "alert": {
    "id": "b1e7...uuid",
    "type": "fire",
    "severity": 5,
    "summary": "Fire on 2nd floor with people trapped",
    "status": "dispatched",
    "latitude": 13.05,
    "longitude": 80.21,
    "created_at": "2026-08-14T09:12:00Z"
  },
  "station": {
    "id": "st-04",
    "name": "Fire Station 4",
    "latitude": 13.048,
    "longitude": 80.208,
    "distance_km": 1.4
  }
}
```

### `GET /api/alerts`
Dashboard's initial load (Realtime handles live updates after that). Supports
an optional `?status=` filter.

Response:
```json
{
  "alerts": [
    { "id": "b1e7...", "type": "fire", "severity": 5, "status": "dispatched", "latitude": 13.05, "longitude": 80.21, "summary": "...", "created_at": "..." }
  ]
}
```

### `GET /api/alerts/:id`
A single alert's full detail (for a dashboard detail view, if needed).

### `PATCH /api/alerts/:id`
Dispatcher or the monitor loop updates an alert's status.

Request:
```json
{ "status": "resolved" }
```

Response: the updated alert object (same shape as above).

### `GET /api/stations`
Station list, for map markers.

Response:
```json
{
  "stations": [
    { "id": "st-04", "name": "Fire Station 4", "category": "fire", "latitude": 13.048, "longitude": 80.208, "status": "available" }
  ]
}
```

### `POST /api/alerts/:id/checkin`
Reporter's page pings this periodically while an alert is active.

Request:
```json
{ "motion_ok": true }
```

Response:
```json
{ "alert": { "...": "updated alert" }, "escalated": false }
```

---

## 3. Data shapes frontend will touch

**`alerts`** — the core object both pages render:
- `type`: `"fire" | "medical" | "police" | "accident" | "other"`
- `severity`: integer `1`–`5`
- `status`: `"reported" | "dispatched" | "monitoring" | "resolved" | "escalated"`
- `latitude`, `longitude`: numbers
- `summary`: short string for display
- `created_at`, `resolved_at`: ISO 8601 timestamps

**`stations`** — for map markers and the dashboard's station list:
- `name`, `category`: strings
- `latitude`, `longitude`: numbers
- `status`: `"available" | "busy"`

Treat these enum lists as likely to grow — render something sensible for a
value you don't recognize rather than breaking.

---

## 4. Real-time updates for the dashboard

`dashboard.html` shouldn't poll `GET /api/alerts` in a loop — it subscribes to
Supabase Realtime on the `alerts` table and gets pushed new rows and updates
instantly. Roughly:

```js
const channel = supabase
  .channel('alerts-feed')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
    // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    // payload.new / payload.old: the alert row
  })
  .subscribe();
```

This is what `public/realtime.js` will implement — the Supabase URL and anon
key needed for this will be provided once the project is set up (they're safe
to expose client-side; write access stays locked down server-side).

---

## 5. Which frontend file needs what

- **`reporter.html` + `script.js`** — Web Speech API for voice input, calls
  `POST /api/alert` to submit, then `POST /api/alerts/:id/checkin` while
  showing live status to the reporter.
- **`dashboard.html` + `realtime.js`** — `GET /api/alerts` and `GET
  /api/stations` on load, then the Realtime subscription above for live
  updates, rendered on a Leaflet + OpenStreetMap map.
- **`style.css`** — shared styling across both pages.

---

## 6. What might still change

The backend is actively being built, not finished — treat this as the current
best plan, not a guarantee:

- Exact field names or status values may shift slightly as the backend gets
  built out.
- New optional fields may get added to responses — ignore fields you don't
  recognize rather than erroring.
- If something actually changes in a way that would break frontend code, it'll
  get flagged directly to the team, not left for you to discover by accident.

Code defensively: don't assume every field is always present, don't hard-code
a closed list of enum values, and handle a failed/slow API call gracefully
(the network and Vercel functions can be slow or flaky in a prototype).
