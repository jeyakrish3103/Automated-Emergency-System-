"""POST /api/alerts/:id/checkin -- reporter's periodic check-in during the
Monitor step of the loop. Escalates if motion_ok is false.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.api.supabase_client import get_client
from backend.api.triage import MAX_SEVERITY

router = APIRouter()


class CheckinRequest(BaseModel):
    motion_ok: bool = True


def apply_checkin(alert: dict, motion_ok: bool) -> tuple[dict, bool]:
    """Pure state-transition logic, kept separate from the Supabase call so
    it's unit-testable without a live database."""
    update = {"last_checkin": datetime.now(timezone.utc).isoformat()}

    if motion_ok:
        return update, False

    update["severity"] = min(MAX_SEVERITY, alert["severity"] + 1)
    update["escalation_count"] = alert.get("escalation_count", 0) + 1
    update["status"] = "escalated"
    return update, True


@router.post("/api/alerts/{id}/checkin")
def checkin(id: str, body: CheckinRequest):
    client = get_client()
    rows = client.table("alerts").select("*").eq("id", id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="alert not found")
    alert = rows[0]

    update, escalated = apply_checkin(alert, body.motion_ok)
    updated_alert = client.table("alerts").update(update).eq("id", id).execute().data[0]

    event = "checkin_escalated" if escalated else "checkin_ok"
    client.table("alert_log").insert({"alert_id": id, "event": event}).execute()

    return {"alert": updated_alert, "escalated": escalated}
