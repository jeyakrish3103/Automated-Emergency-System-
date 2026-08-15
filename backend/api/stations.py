"""GET /api/stations -- station list for the dashboard map."""
from fastapi import APIRouter

from backend.api.supabase_client import get_client

router = APIRouter()


@router.get("/api/stations")
def list_stations():
    client = get_client()
    stations = client.table("stations").select("*").execute().data
    return {"stations": stations}
