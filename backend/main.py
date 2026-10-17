from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from backend.agent.client import MarketSnapshot, MockAgentClient
from backend.demo_data import (
    get_demo_portfolio,
    get_demo_rules,
    set_demo_rules,
)
from backend.recommendations import (
    DecisionReceipt,
    Recommendation,
    RecommendationStatus,
    create_recommendation,
    update_recommendation_status,
)
from backend.rules.engine import evaluate_proposal
from backend.rules.models import Portfolio, UserRules


app = FastAPI(
    title="Financial Agent API",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


agent_client = MockAgentClient()


class AnalyzeRequest(BaseModel):
    symbol: str = "XYZ"


class AnalyzeResponse(BaseModel):
    status: str
    recommendation_id: str
    recommendation_status: RecommendationStatus
    receipt: DecisionReceipt


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/portfolio", response_model=Portfolio)
def get_portfolio():
    return get_demo_portfolio()


@app.get("/rules", response_model=UserRules)
def get_rules():
    return get_demo_rules()


@app.post("/rules", response_model=UserRules)
def update_rules(rules: UserRules):
    return set_demo_rules(rules)


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    portfolio = get_demo_portfolio()
    rules = get_demo_rules()

    # Mock trusted market-data result.
    market = MarketSnapshot(
        symbol=request.symbol.upper(),
        price=100.0,
        change_percent=4.2,
    )

    # Agent proposes.
    original_proposal = agent_client.propose(
        portfolio=portfolio,
        rules=rules,
        market=market,
    )

    # Deterministic policy enforcement.
    policy_result = evaluate_proposal(
        proposal=original_proposal,
        portfolio=portfolio,
        rules=rules,
    )

    receipt = DecisionReceipt(
        observed=(
            f"{market.symbol} moved "
            f"{market.change_percent:.1f}% "
            f"in the mock market snapshot."
        ),
        original_proposal=policy_result.original_proposal,
        rules_evaluated=policy_result.rules_evaluated,
        rules_failed=policy_result.rules_failed,
        final_proposal=policy_result.final_proposal,
        human_approval_required=rules.require_human_approval,
    )

    recommendation = create_recommendation(receipt)

    return AnalyzeResponse(
        status="recommendation_ready",
        recommendation_id=recommendation.id,
        recommendation_status=recommendation.status,
        receipt=recommendation.receipt,
    )


@app.post(
    "/recommendations/{recommendation_id}/approve",
    response_model=Recommendation,
)
def approve_recommendation(
    recommendation_id: str,
):
    try:
        recommendation = update_recommendation_status(
            recommendation_id,
            "approved",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

    if recommendation is None:
        raise HTTPException(
            status_code=404,
            detail="Recommendation not found.",
        )

    return recommendation


@app.post(
    "/recommendations/{recommendation_id}/reject",
    response_model=Recommendation,
)
def reject_recommendation(
    recommendation_id: str,
):
    try:
        recommendation = update_recommendation_status(
            recommendation_id,
            "rejected",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

    if recommendation is None:
        raise HTTPException(
            status_code=404,
            detail="Recommendation not found.",
        )

    return recommendation