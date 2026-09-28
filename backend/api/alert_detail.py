"""GET/PATCH /api/alerts/:id -- single alert detail, and status updates
(acknowledge/escalate/resolve) from a dispatcher or the monitor loop.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.api.supabase_client import get_client

router = APIRouter()

VALID_STATUSES = ["reported", "dispatched", "monitoring", "escalated", "resolved"]


class StatusUpdate(BaseModel):
    status: str


def _get_alert_or_404(client, alert_id: str) -> dict:
    rows = client.table("alerts").select("*").eq("id", alert_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="alert not found")
    return rows[0]


@router.get("/api/alerts/{id}")
def get_alert(id: str):
    client = get_client()
    return {"alert": _get_alert_or_404(client, id)}


@router.patch("/api/alerts/{id}")
def update_alert_status(id: str, body: StatusUpdate):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {VALID_STATUSES}")

    client = get_client()
    _get_alert_or_404(client, id)

    update = {"status": body.status}
    if body.status == "resolved":
        update["resolved_at"] = datetime.now(timezone.utc).isoformat()

    alert = client.table("alerts").update(update).eq("id", id).execute().data[0]
    client.table("alert_log").insert(
        {"alert_id": id, "event": f"status_changed:{body.status}"}
    ).execute()

    return {"alert": alert}
