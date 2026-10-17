from typing import Protocol

from pydantic import BaseModel

from backend.rules.models import Portfolio, Proposal, UserRules


class MarketSnapshot(BaseModel):
    symbol: str
    price: float
    change_percent: float


class AgentClient(Protocol):
    def propose(
        self,
        portfolio: Portfolio,
        rules: UserRules,
        market: MarketSnapshot,
    ) -> Proposal:
        ...


class MockAgentClient:
    def propose(
        self,
        portfolio: Portfolio,
        rules: UserRules,
        market: MarketSnapshot,
    ) -> Proposal:
        return Proposal(
            action="buy",
            symbol=market.symbol.upper(),
            amount_usd=15.0,
        )