from backend.api.checkin import apply_checkin


def test_checkin_ok_does_not_escalate():
    alert = {"severity": 2, "escalation_count": 0, "status": "monitoring"}
    update, escalated = apply_checkin(alert, motion_ok=True)
    assert escalated is False
    assert "severity" not in update
    assert "last_checkin" in update


def test_checkin_missed_escalates_and_bumps_severity():
    alert = {"severity": 2, "escalation_count": 0, "status": "monitoring"}
    update, escalated = apply_checkin(alert, motion_ok=False)
    assert escalated is True
    assert update["severity"] == 3
    assert update["escalation_count"] == 1
    assert update["status"] == "escalated"


def test_checkin_severity_clamps_at_max():
    alert = {"severity": 5, "escalation_count": 2, "status": "escalated"}
    update, escalated = apply_checkin(alert, motion_ok=False)
    assert update["severity"] == 5
    assert update["escalation_count"] == 3
