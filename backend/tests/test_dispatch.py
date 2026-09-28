import pytest

from backend.api.dispatch import haversine_km, nearest_station

STATIONS = [
    {"id": "far-fire", "latitude": 13.10, "longitude": 80.30, "status": "available", "handles_types": ["fire"]},
    {"id": "near-fire", "latitude": 13.01, "longitude": 80.21, "status": "available", "handles_types": ["fire"]},
    {"id": "near-busy-fire", "latitude": 13.001, "longitude": 80.201, "status": "busy", "handles_types": ["fire"]},
    {"id": "near-medical", "latitude": 13.011, "longitude": 80.211, "status": "available", "handles_types": ["medical"]},
]


def test_haversine_zero_distance_for_same_point():
    assert haversine_km(13.0, 80.2, 13.0, 80.2) == pytest.approx(0.0)


def test_haversine_known_distance():
    # Roughly 111km per degree of latitude at the equator-ish.
    km = haversine_km(0.0, 0.0, 1.0, 0.0)
    assert km == pytest.approx(111.19, abs=0.5)


def test_nearest_station_prefers_matching_type_over_closer_wrong_type():
    result = nearest_station(13.0, 80.2, "fire", STATIONS)
    assert result["id"] == "near-fire"


def test_nearest_station_skips_busy_stations():
    result = nearest_station(13.0, 80.2, "fire", STATIONS)
    assert result["id"] != "near-busy-fire"


def test_nearest_station_falls_back_to_any_available_if_no_type_match():
    result = nearest_station(13.011, 80.211, "police", STATIONS)
    assert result is not None
    assert result["status"] == "available"


def test_nearest_station_returns_none_if_nothing_available():
    all_busy = [{**s, "status": "busy"} for s in STATIONS]
    assert nearest_station(13.0, 80.2, "fire", all_busy) is None
