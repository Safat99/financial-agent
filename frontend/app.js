const API_BASE = "http://127.0.0.1:8000";

let currentRecommendationId = null;
let currentRecommendation = null;

const elements = {
  cashValue: document.getElementById("cash-value"),
  holdingsContainer: document.getElementById("holdings-container"),

  maxTrade: document.getElementById("max-trade"),
  minimumCash: document.getElementById("minimum-cash"),
  requireApproval: document.getElementById("require-approval"),
  saveRulesButton: document.getElementById("save-rules-button"),
  rulesMessage: document.getElementById("rules-message"),

  symbolInput: document.getElementById("symbol-input"),
  analyzeButton: document.getElementById("analyze-button"),

  activityPanel: document.getElementById("activity-panel"),
  activityTitle: document.getElementById("activity-title"),
  activityText: document.getElementById("activity-text"),

  resultSection: document.getElementById("result-section"),
  statusBadge: document.getElementById("status-badge"),
  recommendationId: document.getElementById("recommendation-id"),

  originalProposal: document.getElementById("original-proposal"),
  rulesEvaluated: document.getElementById("rules-evaluated"),
  rulesFailed: document.getElementById("rules-failed"),
  finalProposal: document.getElementById("final-proposal"),
  decisionReceipt: document.getElementById("decision-receipt"),

  approvalMessage: document.getElementById("approval-message"),
  approveButton: document.getElementById("approve-button"),
  rejectButton: document.getElementById("reject-button"),

  errorBanner: document.getElementById("error-banner"),
};

document.addEventListener("DOMContentLoaded", initialize);

elements.saveRulesButton.addEventListener("click", saveRules);
elements.analyzeButton.addEventListener("click", runAnalysis);
elements.approveButton.addEventListener("click", approveRecommendation);
elements.rejectButton.addEventListener("click", rejectRecommendation);

elements.symbolInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runAnalysis();
  }
});

async function initialize() {
  setActivity(
    "Loading demo",
    "Getting your demo portfolio and financial rules from FastAPI.",
    "running"
  );

  try {
    await Promise.all([loadPortfolio(), loadRules()]);

    setActivity(
      "Ready",
      "Portfolio and financial rules loaded. Run an analysis when you're ready.",
      "success"
    );
  } catch (error) {
    setActivity(
      "Backend unavailable",
      "The frontend could not load data from FastAPI.",
      "error"
    );

    showError(error.message);
  }
}

async function apiRequest(path, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  };

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, config);
  } catch (error) {
    throw new Error(
      `Could not reach FastAPI at ${API_BASE}. Make sure the backend is running and CORS allows this frontend.`
    );
  }

  let data = null;

  const contentType = response.headers.get("content-type") || "";

  if (response.status !== 204) {
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text || null;
    }
  }

  if (!response.ok) {
    const detail =
      data && typeof data === "object"
        ? data.detail || data.message || JSON.stringify(data)
        : data;

    throw new Error(
      detail || `Request failed with HTTP ${response.status}.`
    );
  }

  return data;
}

async function loadPortfolio() {
  const portfolio = await apiRequest("/portfolio");

  const cash =
    portfolio?.cash_usd ??
    portfolio?.cash ??
    portfolio?.available_cash_usd ??
    0;

  elements.cashValue.textContent = formatNumber(cash);

  renderHoldings(portfolio?.holdings || []);
}

async function loadRules() {
  const rules = await apiRequest("/rules");

  if (rules?.max_trade_usd !== undefined) {
    elements.maxTrade.value = rules.max_trade_usd;
  }

  if (rules?.minimum_cash_usd !== undefined) {
    elements.minimumCash.value = rules.minimum_cash_usd;
  }

  if (rules?.require_human_approval !== undefined) {
    elements.requireApproval.checked = Boolean(
      rules.require_human_approval
    );
  }
}

function getRulesPayload() {
  return {
    max_trade_usd: Number(elements.maxTrade.value),
    minimum_cash_usd: Number(elements.minimumCash.value),
    require_human_approval: elements.requireApproval.checked,
  };
}

function validateRules(payload) {
  if (
    !Number.isFinite(payload.max_trade_usd) ||
    payload.max_trade_usd < 0
  ) {
    throw new Error("Maximum trade must be zero or greater.");
  }

  if (
    !Number.isFinite(payload.minimum_cash_usd) ||
    payload.minimum_cash_usd < 0
  ) {
    throw new Error("Minimum cash reserve must be zero or greater.");
  }
}

async function saveRules({ silent = false } = {}) {
  clearError();

  const rules = getRulesPayload();

  try {
    validateRules(rules);

    elements.saveRulesButton.disabled = true;

    await apiRequest("/rules", {
      method: "POST",
      body: JSON.stringify(rules),
    });

    if (!silent) {
      elements.rulesMessage.textContent = "Rules saved";

      window.setTimeout(() => {
        elements.rulesMessage.textContent = "";
      }, 2200);
    }

    return rules;
  } catch (error) {
    showError(error.message);
    throw error;
  } finally {
    elements.saveRulesButton.disabled = false;
  }
}

async function runAnalysis() {
  clearError();

  const symbol = elements.symbolInput.value
    .trim()
    .toUpperCase();

  if (!symbol) {
    showError("Enter a symbol before running analysis.");
    return;
  }

  currentRecommendationId = null;
  currentRecommendation = null;

  setBusy(true);
  elements.resultSection.classList.add("hidden");

  setActivity(
    "Checking your boundaries",
    "Saving your current rules before asking the agent for a proposal.",
    "running"
  );

  try {
    await saveRules({ silent: true });

    setActivity(
      "Agent is analyzing",
      `The agent is preparing a proposal for ${symbol}. The deterministic policy engine will check it before you see a final action.`,
      "running"
    );

    const rawRecommendation = await apiRequest("/analyze", {
    method: "POST",
    body: JSON.stringify({
        symbol,
    }),
    });

    const recommendation = {
  ...rawRecommendation,

  original_proposal:
    rawRecommendation?.original_proposal ??
    rawRecommendation?.receipt?.original_proposal,

  rules_evaluated:
    rawRecommendation?.rules_evaluated ??
    rawRecommendation?.receipt?.rules_evaluated,

  rules_failed:
    rawRecommendation?.rules_failed ??
    rawRecommendation?.receipt?.rules_failed,

  final_proposal:
    rawRecommendation?.final_proposal ??
    rawRecommendation?.receipt?.final_proposal,

  human_approval_required:
    rawRecommendation?.human_approval_required ??
    rawRecommendation?.receipt?.human_approval_required,

  decision_receipt:
    rawRecommendation?.decision_receipt ??
    rawRecommendation?.receipt,
};

currentRecommendation = recommendation;
currentRecommendationId = recommendation?.recommendation_id;

    renderRecommendation(recommendation);

    setActivity(
      "Analysis complete",
      "The agent proposal has passed through your deterministic financial rules.",
      "success"
    );
  } catch (error) {
    setActivity(
      "Analysis failed",
      "No recommendation was produced.",
      "error"
    );

    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function renderRecommendation(recommendation) {
  elements.resultSection.classList.remove("hidden");

  elements.recommendationId.textContent =
    recommendation?.recommendation_id
      ? `ID: ${recommendation.recommendation_id}`
      : "";

  renderStatus(
    recommendation?.recommendation_status ||
      recommendation?.status ||
      "unknown"
  );

  renderProposal(
    elements.originalProposal,
    recommendation?.original_proposal,
    false
  );

  renderRuleList(
    elements.rulesEvaluated,
    recommendation?.rules_evaluated,
    false
  );

  renderRuleList(
    elements.rulesFailed,
    recommendation?.rules_failed,
    true
  );

  const finalProposal =
    recommendation?.final_proposal;

  renderProposal(
    elements.finalProposal,
    finalProposal,
    true
  );

  renderDecisionReceipt(
    recommendation?.decision_receipt
  );

  updateApprovalControls(recommendation);

  elements.resultSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function renderProposal(container, proposal, isFinal) {
  container.innerHTML = "";

  if (!proposal) {
    if (isFinal) {
      container.innerHTML = `
        <div class="blocked-message">
          Blocked — there is no actionable final proposal.
        </div>
      `;
    } else {
      container.innerHTML = `
        <p class="muted">
          No proposal was returned.
        </p>
      `;
    }

    return;
  }

  const action =
    proposal.action ??
    proposal.type ??
    "action";

  const symbol =
    proposal.symbol ??
    proposal.ticker ??
    "";

  const amount = getProposalAmount(proposal);

  const reason =
    proposal.reason ??
    proposal.explanation ??
    proposal.rationale ??
    "";

  const amountHtml =
    amount !== null
      ? `
        <div class="proposal-amount">
          $${formatNumber(amount)}
        </div>
      `
      : "";

  const symbolHtml =
    symbol
      ? `
        <div class="proposal-symbol">
          ${escapeHtml(String(symbol))}
        </div>
      `
      : "";

  const reasonHtml =
    reason
      ? `
        <div class="proposal-reason">
          ${escapeHtml(String(reason))}
        </div>
      `
      : "";

  container.innerHTML = `
    <div class="action-word">
      ${escapeHtml(String(action))}
    </div>

    ${amountHtml}
    ${symbolHtml}
    ${reasonHtml}

    ${
      isFinal
        ? `
          <div class="constrained-note">
            This is the proposal after deterministic policy enforcement.
          </div>
        `
        : ""
    }
  `;
}

function getProposalAmount(proposal) {
  const possibleAmounts = [
    proposal?.amount_usd,
    proposal?.amount,
    proposal?.trade_amount_usd,
    proposal?.trade_amount,
    proposal?.value_usd,
  ];

  for (const value of possibleAmounts) {
    if (
      value !== undefined &&
      value !== null &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

function renderRuleList(container, rules, failed) {
  container.innerHTML = "";

  const normalized = normalizeToArray(rules);

  if (normalized.length === 0) {
    container.innerHTML = `
      <div class="rule-item">
        ${
          failed
            ? "None"
            : "No rule details returned"
        }
      </div>
    `;

    return;
  }

  const list =
    document.createElement("div");

  list.className = "rule-list";

  normalized.forEach((rule) => {
    const item =
      document.createElement("div");

    item.className =
      `rule-item${failed ? " failed" : ""}`;

    item.textContent =
      describeValue(rule);

    list.appendChild(item);
  });

  container.appendChild(list);
}

function renderDecisionReceipt(receipt) {
  elements.decisionReceipt.innerHTML = "";

  if (
    receipt === null ||
    receipt === undefined
  ) {
    elements.decisionReceipt.innerHTML = `
      <p class="muted">
        No Decision Receipt was returned.
      </p>
    `;

    return;
  }

  if (typeof receipt === "string") {
    const pre =
      document.createElement("div");

    pre.className = "raw-receipt";
    pre.textContent = receipt;

    elements.decisionReceipt.appendChild(pre);

    return;
  }

  if (Array.isArray(receipt)) {
    const pre =
      document.createElement("div");

    pre.className = "raw-receipt";

    pre.textContent =
      receipt
        .map(describeValue)
        .join("\n");

    elements.decisionReceipt.appendChild(pre);

    return;
  }

  if (typeof receipt === "object") {
    Object.entries(receipt).forEach(
      ([key, value]) => {
        const row =
          document.createElement("div");

        row.className = "receipt-row";

        const keyElement =
          document.createElement("div");

        keyElement.className =
          "receipt-key";

        keyElement.textContent =
          humanizeKey(key);

        const valueElement =
          document.createElement("p");

        valueElement.className =
          "receipt-value";

        valueElement.textContent =
          describeValue(value);

        row.appendChild(keyElement);
        row.appendChild(valueElement);

        elements.decisionReceipt.appendChild(
          row
        );
      }
    );

    return;
  }

  elements.decisionReceipt.textContent =
    String(receipt);
}

/*
  Approval rules:

  Reject:
  - recommendation must exist
  - recommendation must not already be approved/rejected

  Approve:
  - recommendation must exist
  - final proposal must exist
  - recommendation must not already be approved/rejected

  This means a fully blocked recommendation cannot be approved,
  but it can still be rejected.
*/
function updateApprovalControls(recommendation) {
  const finalProposal =
    recommendation?.final_proposal;

  const status =
    recommendation?.recommendation_status ??
    recommendation?.status ??
    "";

  const normalizedStatus =
    String(status)
      .trim()
      .toLowerCase();

  const isFinished =
    normalizedStatus === "approved" ||
    normalizedStatus === "rejected";

  const hasRecommendation =
    Boolean(currentRecommendationId);

  const canReject =
    hasRecommendation &&
    !isFinished;

  const canApprove =
    hasRecommendation &&
    Boolean(finalProposal) &&
    !isFinished;

  elements.rejectButton.disabled =
    !canReject;

  elements.approveButton.disabled =
    !canApprove;

  if (!finalProposal) {
    elements.approvalMessage.textContent =
      "This recommendation was fully blocked by your rules, so there is nothing to approve.";

    elements.approveButton.disabled = true;

    return;
  }

  if (normalizedStatus === "approved") {
    elements.approvalMessage.textContent =
      "You approved the constrained recommendation.";

    elements.approveButton.disabled = true;
    elements.rejectButton.disabled = true;

    return;
  }

  if (normalizedStatus === "rejected") {
    elements.approvalMessage.textContent =
      "You rejected this recommendation. No action was authorized.";

    elements.approveButton.disabled = true;
    elements.rejectButton.disabled = true;

    return;
  }

  if (
    recommendation?.human_approval_required === false
  ) {
    elements.approvalMessage.textContent =
      "Human approval is not required under the current rule configuration.";

    return;
  }

  elements.approvalMessage.textContent =
    "Review the constrained proposal before approving or rejecting it.";
}

async function approveRecommendation() {
  if (!currentRecommendationId) {
    return;
  }

  clearError();
  setDecisionButtonsBusy(true);

  try {
    const response = await apiRequest(
      `/recommendations/${encodeURIComponent(
        currentRecommendationId
      )}/approve`,
      {
        method: "POST",
      }
    );

    const status =
      extractStatus(response) ||
      "approved";

    if (currentRecommendation) {
      currentRecommendation.recommendation_status =
        status;
    }

    renderStatus(status);

    updateApprovalControls(
      currentRecommendation || {
        recommendation_status: status,
        final_proposal: {},
      }
    );

    setActivity(
      "Recommendation approved",
      "You authorized the final constrained recommendation.",
      "success"
    );
  } catch (error) {
    showError(error.message);
  } finally {
    setDecisionButtonsBusy(false);
  }
}

async function rejectRecommendation() {
  if (!currentRecommendationId) {
    return;
  }

  clearError();
  setDecisionButtonsBusy(true);

  try {
    const response = await apiRequest(
      `/recommendations/${encodeURIComponent(
        currentRecommendationId
      )}/reject`,
      {
        method: "POST",
      }
    );

    const status =
      extractStatus(response) ||
      "rejected";

    if (currentRecommendation) {
      currentRecommendation.recommendation_status =
        status;
    }

    renderStatus(status);

    updateApprovalControls(
      currentRecommendation || {
        recommendation_status: status,
        final_proposal: {},
      }
    );

    setActivity(
      "Recommendation rejected",
      "You rejected the recommendation. No action was authorized.",
      "success"
    );
  } catch (error) {
    showError(error.message);
  } finally {
    setDecisionButtonsBusy(false);
  }
}

function extractStatus(response) {
  if (
    !response ||
    typeof response !== "object"
  ) {
    return null;
  }

  return (
    response.recommendation_status ??
    response.status ??
    response.recommendation
      ?.recommendation_status ??
    response.recommendation?.status ??
    null
  );
}

function renderStatus(status) {
  const normalized =
    String(status || "unknown")
      .trim()
      .toLowerCase();

  elements.statusBadge.textContent =
    normalized.replaceAll("_", " ");

  elements.statusBadge.className =
    "status-badge";

  if (normalized.includes("pending")) {
    elements.statusBadge.classList.add(
      "pending"
    );
  } else if (
    normalized.includes("approved")
  ) {
    elements.statusBadge.classList.add(
      "approved"
    );
  } else if (
    normalized.includes("rejected")
  ) {
    elements.statusBadge.classList.add(
      "rejected"
    );
  } else if (
    normalized.includes("blocked")
  ) {
    elements.statusBadge.classList.add(
      "blocked"
    );
  }
}

function renderHoldings(holdings) {
  elements.holdingsContainer.innerHTML = "";

  if (
    !Array.isArray(holdings) ||
    holdings.length === 0
  ) {
    elements.holdingsContainer.innerHTML = `
      <div class="empty-holdings">
        No holdings in this demo portfolio.
      </div>
    `;

    return;
  }

  holdings.forEach((holding) => {
    const row =
      document.createElement("div");

    row.className = "holding-row";

    const name =
      document.createElement("span");

    name.textContent =
      holding.symbol ??
      holding.ticker ??
      holding.name ??
      "Holding";

    const value =
      document.createElement("strong");

    const amount =
      holding.value_usd ??
      holding.market_value_usd ??
      holding.amount_usd ??
      holding.quantity ??
      "";

    value.textContent =
      typeof amount === "number"
        ? `$${formatNumber(amount)}`
        : String(amount);

    row.appendChild(name);
    row.appendChild(value);

    elements.holdingsContainer.appendChild(
      row
    );
  });
}

function setActivity(title, text, state) {
  elements.activityTitle.textContent =
    title;

  elements.activityText.textContent =
    text;

  elements.activityPanel.classList.remove(
    "running",
    "success",
    "error"
  );

  if (state) {
    elements.activityPanel.classList.add(
      state
    );
  }
}

function setBusy(isBusy) {
  elements.analyzeButton.disabled =
    isBusy;

  elements.saveRulesButton.disabled =
    isBusy;

  elements.analyzeButton.textContent =
    isBusy
      ? "Analyzing…"
      : "Run Analysis";
}

function setDecisionButtonsBusy(isBusy) {
  if (isBusy) {
    elements.approveButton.disabled = true;
    elements.rejectButton.disabled = true;

    return;
  }

  if (currentRecommendation) {
    updateApprovalControls(
      currentRecommendation
    );
  }
}

function normalizeToArray(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

function describeValue(value) {
  if (value === null) {
    return "None";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(describeValue)
      .join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, childValue]) => {
        return `${humanizeKey(
          key
        )}: ${describeValue(childValue)}`;
      })
      .join(" · ");
  }

  return String(value);
}

function humanizeKey(key) {
  return String(key)
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase()
    );
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits:
      Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(message) {
  elements.errorBanner.textContent =
    message;

  elements.errorBanner.classList.remove(
    "hidden"
  );

  window.clearTimeout(showError.timeout);

  showError.timeout =
    window.setTimeout(() => {
      elements.errorBanner.classList.add(
        "hidden"
      );
    }, 7000);
}

function clearError() {
  elements.errorBanner.classList.add(
    "hidden"
  );
}