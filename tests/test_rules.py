from backend.rules.engine import evaluate_proposal
from backend.rules.models import Portfolio, Proposal, UserRules


def test_trade_over_limit_is_constrained():
    portfolio = Portfolio(
        cash_usd=50.0,
    )

    rules = UserRules(
        max_trade_usd=10.0,
        minimum_cash_usd=20.0,
        require_human_approval=True,
    )

    proposal = Proposal(
        action="buy",
        symbol="XYZ",
        amount_usd=15.0,
    )

    result = evaluate_proposal(
        proposal=proposal,
        portfolio=portfolio,
        rules=rules,
    )

    assert result.original_proposal.amount_usd == 15.0

    assert result.final_proposal is not None
    assert result.final_proposal.amount_usd == 10.0

    assert result.modified is True
    assert result.blocked is False

    assert len(result.rules_failed) == 1


def test_trade_breaking_cash_reserve_is_blocked():
    portfolio = Portfolio(
        cash_usd=20.0,
    )

    rules = UserRules(
        max_trade_usd=10.0,
        minimum_cash_usd=20.0,
        require_human_approval=True,
    )

    proposal = Proposal(
        action="buy",
        symbol="XYZ",
        amount_usd=5.0,
    )

    result = evaluate_proposal(
        proposal=proposal,
        portfolio=portfolio,
        rules=rules,
    )

    assert result.final_proposal is None

    assert result.modified is True
    assert result.blocked is True

    assert len(result.rules_failed) == 1