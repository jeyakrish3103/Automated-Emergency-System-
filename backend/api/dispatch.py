"""Nearest-available-station lookup using the Haversine formula.

Not an HTTP endpoint itself -- imported by api/alert.py.
"""
import math

from backend.api.supabase_client import get_client

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def nearest_station(lat: float, lon: float, incident_type: str, stations: list[dict]) -> dict | None:
    """Pure selection logic, kept separate from the Supabase fetch so it's
    unit-testable without a live database."""
    available = [s for s in stations if s.get("status") == "available"]
    if not available:
        return None

    def with_distance(station):
        station = {**station}
        station["distance_km"] = haversine_km(lat, lon, station["latitude"], station["longitude"])
        return station

    available = [with_distance(s) for s in available]

    matching = [s for s in available if incident_type in (s.get("handles_types") or [])]
    candidates = matching if matching else available

    return min(candidates, key=lambda s: s["distance_km"])


def find_nearest_station(lat: float, lon: float, incident_type: str) -> dict | None:
    """Fetch stations from Supabase and return the nearest available match."""
    client = get_client()
    stations = client.table("stations").select("*").execute().data
    return nearest_station(lat, lon, incident_type, stations)
