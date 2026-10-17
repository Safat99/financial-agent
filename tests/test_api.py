import pytest
from fastapi.testclient import TestClient

from backend.main import app


client = TestClient(app)


DEFAULT_RULES = {
    "max_trade_usd": 10.0,
    "minimum_cash_usd": 20.0,
    "require_human_approval": True,
}


@pytest.fixture(autouse=True)
def reset_rules():
    client.post("/rules", json=DEFAULT_RULES)

    yield

    client.post("/rules", json=DEFAULT_RULES)


def test_health_and_portfolio():
    health_response = client.get("/health")

    assert health_response.status_code == 200
    assert health_response.json() == {"status": "ok"}

    portfolio_response = client.get("/portfolio")

    assert portfolio_response.status_code == 200
    assert portfolio_response.json()["cash_usd"] == 50.0


def test_analyze_creates_pending_recommendation_and_can_be_approved():
    analyze_response = client.post(
        "/analyze",
        json={"symbol": "XYZ"},
    )

    assert analyze_response.status_code == 200

    data = analyze_response.json()

    assert data["recommendation_status"] == "pending_approval"
    assert data["receipt"]["original_proposal"]["amount_usd"] == 15.0
    assert data["receipt"]["final_proposal"]["amount_usd"] == 10.0

    recommendation_id = data["recommendation_id"]

    approve_response = client.post(
        f"/recommendations/{recommendation_id}/approve"
    )

    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"


def test_recommendation_can_be_rejected():
    analyze_response = client.post(
        "/analyze",
        json={"symbol": "XYZ"},
    )

    recommendation_id = analyze_response.json()["recommendation_id"]

    reject_response = client.post(
        f"/recommendations/{recommendation_id}/reject"
    )

    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"


def test_unknown_recommendation_returns_404():
    response = client.post(
        "/recommendations/not-a-real-id/approve"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Recommendation not found."


def test_blocked_recommendation_cannot_be_approved():
    blocked_rules = {
        "max_trade_usd": 10.0,
        "minimum_cash_usd": 50.0,
        "require_human_approval": True,
    }

    rules_response = client.post(
        "/rules",
        json=blocked_rules,
    )

    assert rules_response.status_code == 200

    analyze_response = client.post(
        "/analyze",
        json={"symbol": "XYZ"},
    )

    assert analyze_response.status_code == 200

    data = analyze_response.json()

    assert data["receipt"]["final_proposal"] is None

    recommendation_id = data["recommendation_id"]

    approve_response = client.post(
        f"/recommendations/{recommendation_id}/approve"
    )

    assert approve_response.status_code == 409
    assert (
        approve_response.json()["detail"]
        == "Blocked recommendation cannot be approved."
    )