"""Gemini call + severity/type decision logic for incoming transcripts.

Not an HTTP endpoint itself -- imported by api/alert.py (initial triage) and
api/alerts/[id]/checkin.py (re-triage on escalation).
"""
import json
import os

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(".env.local")

VALID_TYPES = ["fire", "medical", "police", "accident", "other"]
MIN_SEVERITY = 1
MAX_SEVERITY = 5

_TRIAGE_PROMPT = """You are an emergency dispatch triage assistant. Read the transcript of a
caller's report and classify it. Respond with ONLY a JSON object, no markdown fences, with keys:
- "type": one of {types}
- "severity": an integer from 1 (minor) to 5 (critical, life-threatening)
- "summary": a one-sentence summary of the emergency for a dispatcher

Transcript:
\"\"\"{transcript}\"\"\"
"""

_model = None


def _get_model():
    global _model
    if _model is None:
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        _model = genai.GenerativeModel("gemini-flash-latest")
    return _model


def triage_transcript(transcript: str) -> dict:
    """Call Gemini to classify a transcript, with a safe local fallback if it fails."""
    prompt = _TRIAGE_PROMPT.format(types=", ".join(VALID_TYPES), transcript=transcript)

    try:
        model = _get_model()
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)

        incident_type = result.get("type", "other")
        severity = int(result.get("severity", 3))
        summary = result.get("summary") or transcript[:200]
    except Exception:
        incident_type, severity, summary = _fallback_triage(transcript)

    if incident_type not in VALID_TYPES:
        incident_type = "other"
    severity = max(MIN_SEVERITY, min(MAX_SEVERITY, severity))

    return {"type": incident_type, "severity": severity, "summary": summary}


def _fallback_triage(transcript: str) -> tuple[str, int, str]:
    """Basic keyword-based classification used if the Gemini call fails."""
    text = transcript.lower()

    if any(word in text for word in ["fire", "smoke", "burning"]):
        incident_type = "fire"
    elif any(word in text for word in ["shot", "gun", "robbery", "assault", "weapon"]):
        incident_type = "police"
    elif any(word in text for word in ["crash", "accident", "collision"]):
        incident_type = "accident"
    elif any(word in text for word in ["injured", "bleeding", "unconscious", "heart", "breathing"]):
        incident_type = "medical"
    else:
        incident_type = "other"

    if any(word in text for word in ["dying", "unconscious", "not breathing", "critical"]):
        severity = 5
    elif any(word in text for word in ["severe", "badly", "urgent"]):
        severity = 4
    elif any(word in text for word in ["minor", "small"]):
        severity = 1
    else:
        severity = 3

    return incident_type, severity, transcript[:200]
