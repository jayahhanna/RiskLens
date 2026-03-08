const API_KEY = "f0ee3a7ca4bf4e868a01bbd36f65f173";

const STORAGE_KEY = "risklens_holdings_v1";
const WINDOW_STORAGE_KEY = "risklens_analysis_window_v1";

const assets = [];
let allocationChart = null;
let editingAssetIndex = null;

const assetForm = document.getElementById("assetForm");
const tickerInput = document.getElementById("tickerInput");
const sharesInput = document.getElementById("sharesInput");
const colorInput = document.getElementById("colorInput");
const windowSelect = document.getElementById("windowSelect");
const runAnalysisBtn = document.getElementById("runAnalysisBtn");
const holdingsBody = document.getElementById("holdingsBody");
const assetCount = document.getElementById("assetCount");
const emptyHoldingsRow = document.getElementById("emptyHoldingsRow");
const addAssetBtn = assetForm.querySelector('button[type="submit"]');

const portfolioValueEl = document.getElementById("portfolioValue");
const portfolioVolatilityEl = document.getElementById("portfolioVolatility");
const portfolioVarEl = document.getElementById("portfolioVar");
const concentrationRiskEl = document.getElementById("concentrationRisk");
const riskScoreEl = document.getElementById("riskScore");
const riskInterpretationEl = document.getElementById("riskInterpretation");
const messageBox = document.getElementById("messageBox");

assetForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const ticker = tickerInput.value.trim().toUpperCase();
  const shares = Number(sharesInput.value);
  const color = colorInput.value;

  if (!ticker || Number.isNaN(shares) || shares <= 0) {
    showMessage("Enter a valid ticker and shares amount.", "error");
    return;
  }

  const duplicateAsset = assets.find(
    (asset, index) => asset.ticker === ticker && index !== editingAssetIndex
  );

  if (duplicateAsset) {
    showMessage(`${ticker} is already in your holdings.`, "error");
    return;
  }

  if (editingAssetIndex === null) {
    assets.push({ ticker, shares, color });
    showMessage(`${ticker} added to holdings.`, "info");
  } else {
    assets[editingAssetIndex] = { ticker, shares, color };
    showMessage(`${ticker} updated in holdings.`, "info");
    editingAssetIndex = null;
    addAssetBtn.textContent = "Add Asset";
  }

  saveHoldingsToStorage();
  renderHoldingsTable();

  assetForm.reset();
  colorInput.value = "#2d74ff";
});

runAnalysisBtn.addEventListener("click", runRiskAnalysis);
windowSelect.addEventListener("change", saveWindowToStorage);

document.addEventListener("DOMContentLoaded", function () {
  loadWindowFromStorage();
  loadHoldingsFromStorage();
  renderHoldingsTable();
});

function renderHoldingsTable() {
  holdingsBody.innerHTML = "";

  if (assets.length === 0) {
    holdingsBody.appendChild(emptyHoldingsRow);
    assetCount.textContent = "0 assets";
    return;
  }

  assets.forEach((asset, index) => {
    const row = document.createElement("tr");

    const tickerCell = document.createElement("td");
    tickerCell.textContent = asset.ticker;

    const sharesCell = document.createElement("td");
    sharesCell.textContent = formatNumber(asset.shares, 4);

    const colorCell = document.createElement("td");
    const dot = document.createElement("div");
    dot.className = "color-dot";
    dot.style.backgroundColor = asset.color;
    colorCell.appendChild(dot);

    const actionCell = document.createElement("td");

    const editButton = document.createElement("button");
    editButton.className = "action-btn";
    editButton.textContent = "Edit";
    editButton.type = "button";
    editButton.addEventListener("click", function () {
      startEditingAsset(index);
    });

    const removeButton = document.createElement("button");
    removeButton.className = "action-btn danger";
    removeButton.textContent = "Remove";
    removeButton.type = "button";
    removeButton.addEventListener("click", function () {
      removeAsset(index);
    });

    actionCell.appendChild(editButton);
    actionCell.appendChild(removeButton);

    row.appendChild(tickerCell);
    row.appendChild(sharesCell);
    row.appendChild(colorCell);
    row.appendChild(actionCell);

    holdingsBody.appendChild(row);
  });

  assetCount.textContent = `${assets.length} asset${assets.length > 1 ? "s" : ""}`;
}

function startEditingAsset(index) {
  const asset = assets[index];
  editingAssetIndex = index;

  tickerInput.value = asset.ticker;
  sharesInput.value = asset.shares;
  colorInput.value = asset.color;
  addAssetBtn.textContent = "Save Asset";

  showMessage(`Editing ${asset.ticker}. Update values and click Save Asset.`, "info");
}

function removeAsset(index) {
  if (editingAssetIndex !== null) {
    if (editingAssetIndex === index) {
      editingAssetIndex = null;
      addAssetBtn.textContent = "Add Asset";
      assetForm.reset();
      colorInput.value = "#2d74ff";
    } else if (editingAssetIndex > index) {
      editingAssetIndex -= 1;
    }
  }

  assets.splice(index, 1);
  saveHoldingsToStorage();
  renderHoldingsTable();
}

async function runRiskAnalysis() {
  if (assets.length === 0) {
    showMessage("Add at least one asset before running analysis.", "error");
    return;
  }

  if (API_KEY === "YOUR_API_KEY_HERE") {
    showMessage("Add your Twelve Data API key in script.js before running analysis.", "error");
    return;
  }

  runAnalysisBtn.disabled = true;
  runAnalysisBtn.textContent = "Analyzing...";
  showMessage("Fetching market data and calculating risk metrics...", "info");

  const analysisWindow = windowSelect.value;
  const daysToUse = getWindowDays(analysisWindow);

  const successfulAssets = [];
  const failedAssets = [];

  for (const asset of assets) {
    try {
      const marketData = await fetchTickerData(asset.ticker);

      if (!marketData.ok) {
        failedAssets.push(`${asset.ticker}: ${marketData.error}`);
        continue;
      }

      const limitedPrices = marketData.closes.slice(-daysToUse);

      if (limitedPrices.length < 2) {
        failedAssets.push(`${asset.ticker}: not enough historical data for ${analysisWindow}.`);
        continue;
      }

      const returns = calculateDailyReturns(limitedPrices);
      const annualizedVolatility = calculateAnnualizedVolatility(returns);
      const latestClose = limitedPrices[limitedPrices.length - 1];
      const marketValue = latestClose * asset.shares;

      successfulAssets.push({
        ticker: asset.ticker,
        shares: asset.shares,
        color: asset.color,
        latestClose,
        marketValue,
        annualizedVolatility,
      });
    } catch (error) {
      failedAssets.push(`${asset.ticker}: unexpected error loading data.`);
      console.error(error);
    }
  }

  if (successfulAssets.length === 0) {
    const errorsText = failedAssets.length > 0 ? ` Details: ${failedAssets.join(" | ")}` : "";
    showMessage(`Could not load data for any assets.${errorsText}`, "error");
    resetOutput();
    runAnalysisBtn.disabled = false;
    runAnalysisBtn.textContent = "Run Risk Analysis";
    return;
  }

  const portfolioResults = calculatePortfolioMetrics(successfulAssets);
  updateSummaryCards(portfolioResults);
  updateAllocationChart(portfolioResults.allocations);

  const interpretation = buildRiskInterpretation(portfolioResults);
  riskInterpretationEl.textContent = interpretation;

  if (failedAssets.length > 0) {
    showMessage(`Analysis complete with warnings. ${failedAssets.join(" | ")}`, "error");
  } else {
    showMessage("Risk analysis completed successfully.", "info");
  }

  runAnalysisBtn.disabled = false;
  runAnalysisBtn.textContent = "Run Risk Analysis";
}

function getWindowDays(windowValue) {
  if (windowValue === "30D") return 30;
  if (windowValue === "90D") return 90;
  return 252;
}

async function fetchTickerData(ticker) {
  const endpoint = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    ticker
  )}&interval=1day&outputsize=300&apikey=${API_KEY}`;

  const response = await fetch(endpoint);

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    console.log("Twelve Data raw response parse error:", { ticker, error });
    return { ok: false, error: "historical data unavailable." };
  }

  console.log("Twelve Data raw response:", { ticker, data, status: response.status });

  const isMissingResponse =
    !data || typeof data !== "object" || Object.keys(data).length === 0;
  const hasValues = Array.isArray(data?.values) && data.values.length > 0;
  const apiStatus = typeof data?.status === "string" ? data.status.toLowerCase() : "";
  const apiCode = String(data?.code || "").toLowerCase();
  const apiMessage = String(data?.message || "").toLowerCase();

  if (hasValues) {
    const sortedValues = data.values
      .slice()
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    const closes = sortedValues
      .map((item) => Number(item.close))
      .filter((value) => Number.isFinite(value));

    if (closes.length === 0) {
      return { ok: false, error: "historical data unavailable." };
    }

    return { ok: true, closes };
  }

  const isRateLimit =
    response.status === 429 ||
    apiCode.includes("429") ||
    apiMessage.includes("limit") ||
    apiMessage.includes("credits") ||
    apiMessage.includes("too many requests");

  if (isRateLimit) {
    return { ok: false, error: "rate limit reached by Twelve Data. Please wait and try again." };
  }

  const isInvalidTicker =
    apiStatus === "error" &&
    (apiMessage.includes("symbol") ||
      apiMessage.includes("not found") ||
      apiMessage.includes("invalid") ||
      apiMessage.includes("unknown"));

  if (isInvalidTicker) {
    return { ok: false, error: "invalid ticker or symbol not found." };
  }

  if (isMissingResponse) {
    return { ok: false, error: "historical data unavailable." };
  }

  if (apiStatus === "error") {
    return { ok: false, error: data.message || "historical data unavailable." };
  }

  return { ok: false, error: "historical data unavailable." };
}

function calculateDailyReturns(priceSeries) {
  const returns = [];

  for (let i = 1; i < priceSeries.length; i += 1) {
    const previousPrice = priceSeries[i - 1];
    const currentPrice = priceSeries[i];

    if (previousPrice > 0 && currentPrice > 0) {
      const dailyReturn = currentPrice / previousPrice - 1;
      returns.push(dailyReturn);
    }
  }

  return returns;
}

function calculateAnnualizedVolatility(dailyReturns) {
  if (dailyReturns.length < 2) return 0;

  const averageReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;

  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - averageReturn) ** 2, 0) /
    (dailyReturns.length - 1);

  const dailyVolatility = Math.sqrt(variance);
  return dailyVolatility * Math.sqrt(252);
}

function calculatePortfolioMetrics(processedAssets) {
  const portfolioValue = processedAssets.reduce((sum, asset) => sum + asset.marketValue, 0);

  const allocations = processedAssets.map((asset) => {
    const weight = portfolioValue > 0 ? asset.marketValue / portfolioValue : 0;
    return {
      ticker: asset.ticker,
      color: asset.color,
      value: asset.marketValue,
      weight,
      weightPercent: weight * 100,
      annualizedVolatility: asset.annualizedVolatility,
    };
  });

  const weightedVariance = allocations.reduce(
    (sum, asset) => sum + (asset.weight * asset.annualizedVolatility) ** 2,
    0
  );
  const portfolioAnnualVolatility = Math.sqrt(weightedVariance);

  const portfolioDailyVolatility = portfolioAnnualVolatility / Math.sqrt(252);

  const varDollar = 1.65 * portfolioDailyVolatility * portfolioValue;
  const varPercent = portfolioValue > 0 ? (varDollar / portfolioValue) * 100 : 0;

  const maxAllocation = allocations.reduce(
    (max, asset) => Math.max(max, asset.weightPercent),
    0
  );

  const volatilityLevel = getVolatilityLevel(portfolioAnnualVolatility * 100);
  const concentrationLevel = getConcentrationLevel(maxAllocation);
  const varLevel = getVarLevel(varPercent);

  const volatilityScore = clamp((portfolioAnnualVolatility * 100 / 50) * 100, 0, 100);
  const varScore = clamp((varPercent / 5) * 100, 0, 100);
  const concentrationScore = clamp((maxAllocation / 60) * 100, 0, 100);

  const riskScore =
    volatilityScore * 0.4 +
    varScore * 0.3 +
    concentrationScore * 0.3;

  return {
    portfolioValue,
    portfolioAnnualVolatility,
    varDollar,
    varPercent,
    maxAllocation,
    riskScore,
    riskScoreLevel: getRiskScoreLevel(riskScore),
    volatilityLevel,
    concentrationLevel,
    varLevel,
    allocations,
  };
}

function getVolatilityLevel(volatilityPercent) {
  if (volatilityPercent < 10) return "Low";
  if (volatilityPercent < 20) return "Moderate";
  if (volatilityPercent <= 35) return "High";
  return "Very High";
}

function getConcentrationLevel(maxHoldingPercent) {
  if (maxHoldingPercent < 20) return "Low";
  if (maxHoldingPercent <= 40) return "Moderate";
  return "High";
}

function getVarLevel(varPercent) {
  if (varPercent < 1) return "Low";
  if (varPercent <= 2.5) return "Moderate";
  return "High";
}

function getRiskScoreLevel(score) {
  if (score <= 30) return "Low";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "High";
  return "Very High";
}

function updateSummaryCards(results) {
  portfolioValueEl.textContent = formatCurrency(results.portfolioValue);

  const volatilityPercent = results.portfolioAnnualVolatility * 100;
  portfolioVolatilityEl.textContent = `${formatNumber(volatilityPercent, 2)}% (${results.volatilityLevel})`;

  portfolioVarEl.textContent = `${formatCurrency(results.varDollar)} (${formatNumber(results.varPercent, 2)}%)`;

  concentrationRiskEl.textContent = `${formatNumber(results.maxAllocation, 2)}% (${results.concentrationLevel})`;

  riskScoreEl.textContent = `${formatNumber(results.riskScore, 1)} / 100 (${results.riskScoreLevel})`;
}

function updateAllocationChart(allocations) {
  const labels = allocations.map((asset) => asset.ticker);
  const values = allocations.map((asset) => asset.value);
  const colors = allocations.map((asset) => asset.color);

  const ctx = document.getElementById("allocationChart").getContext("2d");

  if (allocationChart) {
    allocationChart.destroy();
  }

  allocationChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: "#0f1824",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#d4e2f1",
            font: {
              family: "IBM Plex Sans",
              size: 11,
            },
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.parsed || 0;
              const total = values.reduce((sum, item) => sum + item, 0);
              const percent = total > 0 ? (value / total) * 100 : 0;
              return `${label}: ${formatCurrency(value)} (${formatNumber(percent, 2)}%)`;
            },
          },
        },
      },
      cutout: "62%",
    },
  });
}

function buildRiskInterpretation(results) {
  const level = results.riskScoreLevel.toLowerCase();

  const diversificationText =
    results.concentrationLevel === "High"
      ? "one asset represents a large share of total exposure"
      : "allocation is relatively balanced across holdings";

  const volatilityText =
    results.volatilityLevel === "Very High" || results.volatilityLevel === "High"
      ? "market-driven price swings are elevated"
      : "price variability is currently contained";

  const varText =
    results.varLevel === "High"
      ? "the estimated one-day downside is meaningful"
      : "the estimated one-day loss range is moderate";

  return `Portfolio risk is ${level} because ${diversificationText}, while ${volatilityText} and ${varText}.`;
}

function resetOutput() {
  portfolioValueEl.textContent = "$0.00";
  portfolioVolatilityEl.textContent = "0.00%";
  portfolioVarEl.textContent = "$0.00 (0.00%)";
  concentrationRiskEl.textContent = "0.00% (Low)";
  riskScoreEl.textContent = "0 / 100 (Low)";
  riskInterpretationEl.textContent =
    "Add holdings and run analysis to generate a plain-English portfolio risk summary.";

  if (allocationChart) {
    allocationChart.destroy();
    allocationChart = null;
  }
}

function showMessage(message, type) {
  messageBox.textContent = message;
  messageBox.className = `message-box ${type}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value, decimals) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Save holdings so user entries persist after refresh/reopen.
function saveHoldingsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
}

// Load saved holdings at startup and repopulate the in-memory list.
function loadHoldingsFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    assets.length = 0;
    parsed.forEach((item) => {
      if (
        item &&
        typeof item.ticker === "string" &&
        Number.isFinite(Number(item.shares)) &&
        Number(item.shares) > 0 &&
        typeof item.color === "string"
      ) {
        assets.push({
          ticker: item.ticker.trim().toUpperCase(),
          shares: Number(item.shares),
          color: item.color,
        });
      }
    });
  } catch (error) {
    console.error("Failed to parse saved holdings:", error);
  }
}

// Save selected analysis window so it restores after reload.
function saveWindowToStorage() {
  localStorage.setItem(WINDOW_STORAGE_KEY, windowSelect.value);
}

// Restore previously selected analysis window on page load.
function loadWindowFromStorage() {
  const savedWindow = localStorage.getItem(WINDOW_STORAGE_KEY);
  if (savedWindow === "30D" || savedWindow === "90D" || savedWindow === "1Y") {
    windowSelect.value = savedWindow;
  }
}
