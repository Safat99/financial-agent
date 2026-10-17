from pydantic import BaseModel, Field


class Proposal(BaseModel):
    action: str
    symbol: str
    amount_usd: float = Field(gt=0)


class UserRules(BaseModel):
    max_trade_usd: float = Field(gt=0)
    minimum_cash_usd: float = Field(ge=0)
    require_human_approval: bool = True


class Portfolio(BaseModel):
    cash_usd: float = Field(ge=0)


class PolicyResult(BaseModel):
    original_proposal: Proposal
    final_proposal: Proposal | None
    rules_evaluated: list[str]
    rules_failed: list[str]
    modified: bool
    blocked: bool