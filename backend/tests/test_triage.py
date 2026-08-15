from backend.api.triage import _fallback_triage, triage_transcript


def test_fallback_detects_fire():
    incident_type, severity, _ = _fallback_triage("There's smoke and fire coming from the kitchen")
    assert incident_type == "fire"


def test_fallback_detects_critical_severity():
    _, severity, _ = _fallback_triage("He is unconscious and not breathing")
    assert severity == 5


def test_fallback_detects_minor_severity():
    _, severity, _ = _fallback_triage("Just a minor scrape, nothing serious")
    assert severity == 1


def test_triage_transcript_falls_back_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = triage_transcript("There's a fire, people are trapped and not breathing")
    assert result["type"] == "fire"
    assert result["severity"] == 5
    assert 1 <= result["severity"] <= 5
