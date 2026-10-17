from typing import Literal
from uuid import uuid4

from pydantic import BaseModel

from backend.rules.models import Proposal


RecommendationStatus = Literal[
    "pending_approval",
    "approved",
    "rejected",
]


class DecisionReceipt(BaseModel):
    observed: str
    original_proposal: Proposal
    rules_evaluated: list[str]
    rules_failed: list[str]
    final_proposal: Proposal | None
    human_approval_required: bool


class Recommendation(BaseModel):
    id: str
    status: RecommendationStatus
    receipt: DecisionReceipt


_recommendations: dict[str, Recommendation] = {}


def create_recommendation(
    receipt: DecisionReceipt,
) -> Recommendation:
    recommendation = Recommendation(
        id=str(uuid4()),
        status="pending_approval",
        receipt=receipt,
    )

    _recommendations[recommendation.id] = recommendation

    return recommendation.model_copy(deep=True)


def get_recommendation(
    recommendation_id: str,
) -> Recommendation | None:
    recommendation = _recommendations.get(recommendation_id)

    if recommendation is None:
        return None

    return recommendation.model_copy(deep=True)


def update_recommendation_status(
    recommendation_id: str,
    new_status: Literal["approved", "rejected"],
) -> Recommendation | None:
    recommendation = _recommendations.get(recommendation_id)

    if recommendation is None:
        return None

    if recommendation.status != "pending_approval":
        raise ValueError(
            f"Recommendation is already {recommendation.status}."
        )

    # A fully blocked proposal has no safe action to approve.
    if (
        new_status == "approved"
        and recommendation.receipt.final_proposal is None
    ):
        raise ValueError(
            "Blocked recommendation cannot be approved."
        )

    updated = recommendation.model_copy(
        update={"status": new_status}
    )

    _recommendations[recommendation_id] = updated

    return updated.model_copy(deep=True)