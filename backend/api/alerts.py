"""GET /api/alerts -- list alerts for the dashboard, optional ?status= filter."""
from fastapi import APIRouter

from backend.api.supabase_client import get_client

router = APIRouter()


@router.get("/api/alerts")
def list_alerts(status: str | None = None):
    client = get_client()
    query = client.table("alerts").select("*").order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    alerts = query.execute().data
    return {"alerts": alerts}
