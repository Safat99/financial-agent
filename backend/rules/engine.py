from backend.rules.models import (
    PolicyResult,
    Portfolio,
    Proposal,
    UserRules,
)


def evaluate_proposal(
    proposal: Proposal,
    portfolio: Portfolio,
    rules: UserRules,
) -> PolicyResult:
    rules_evaluated = [
        f"Maximum transaction is ${rules.max_trade_usd:.2f}",
        f"Minimum cash reserve is ${rules.minimum_cash_usd:.2f}",
    ]

    rules_failed: list[str] = []

    allowed_amount = proposal.amount_usd

    # Rule 1: Maximum trade size
    if allowed_amount > rules.max_trade_usd:
        rules_failed.append(
            f"Original proposal of ${proposal.amount_usd:.2f} "
            f"exceeded maximum transaction of ${rules.max_trade_usd:.2f}"
        )
        allowed_amount = rules.max_trade_usd

    # Rule 2: Minimum cash reserve
    if proposal.action.lower() == "buy":
        spendable_cash = max(
            0.0,
            portfolio.cash_usd - rules.minimum_cash_usd,
        )

        if allowed_amount > spendable_cash:
            rules_failed.append(
                f"Trade would violate minimum cash reserve of "
                f"${rules.minimum_cash_usd:.2f}"
            )
            allowed_amount = spendable_cash

    # Nothing can safely be purchased.
    if allowed_amount <= 0:
        return PolicyResult(
            original_proposal=proposal,
            final_proposal=None,
            rules_evaluated=rules_evaluated,
            rules_failed=rules_failed,
            modified=True,
            blocked=True,
        )

    final_proposal = Proposal(
        action=proposal.action,
        symbol=proposal.symbol,
        amount_usd=allowed_amount,
    )

    return PolicyResult(
        original_proposal=proposal,
        final_proposal=final_proposal,
        rules_evaluated=rules_evaluated,
        rules_failed=rules_failed,
        modified=allowed_amount != proposal.amount_usd,
        blocked=False,
    )