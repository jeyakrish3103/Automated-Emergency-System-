"""POST /api/alert -- receives a transcript + location, triages it, dispatches
to the nearest available station, and saves the alert. Matches BACKEND_PLAN.md
section 2."""
from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.dispatch import find_nearest_station
from backend.api.supabase_client import get_client
from backend.api.triage import triage_transcript

router = APIRouter()


class AlertRequest(BaseModel):
    transcript: str
    latitude: float
    longitude: float


@router.post("/api/alert")
def create_alert(body: AlertRequest):
    triage = triage_transcript(body.transcript)
    station = find_nearest_station(body.latitude, body.longitude, triage["type"])

    client = get_client()
    record = {
        "type": triage["type"],
        "severity": triage["severity"],
        "summary": triage["summary"],
        "transcript": body.transcript,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "status": "dispatched" if station else "reported",
        "station_id": station["id"] if station else None,
    }
    alert = client.table("alerts").insert(record).execute().data[0]
    client.table("alert_log").insert(
        {"alert_id": alert["id"], "event": "alert_created"}
    ).execute()

    return {"alert": alert, "station": station}
