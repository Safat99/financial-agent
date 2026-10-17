from backend.rules.models import Portfolio, UserRules


DEMO_PORTFOLIO = Portfolio(
    cash_usd=50.0,
)


_current_rules = UserRules(
    max_trade_usd=10.0,
    minimum_cash_usd=20.0,
    require_human_approval=True,
)


def get_demo_portfolio() -> Portfolio:
    return DEMO_PORTFOLIO.model_copy()


def get_demo_rules() -> UserRules:
    return _current_rules.model_copy()


def set_demo_rules(rules: UserRules) -> UserRules:
    global _current_rules

    _current_rules = rules.model_copy()

    return _current_rules.model_copy()