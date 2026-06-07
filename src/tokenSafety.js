// Token Safety Checker — rug risk analysis
// Data sources: GoPlus Security API (free), on-chain

const GOPLUS_API = "https://api.gopluslabs.io/api/v1";

// Known safe tokens on Base
const SAFE_TOKENS = new Set([
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6Ca", // USDbC
  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
  "0x4200000000000000000000000000000000000006", // WETH
  "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbETH
]);

/**
 * Analyze token safety using GoPlus + on-chain data
 */
export async function analyzeTokenSafety(tokenAddress) {
  tokenAddress = tokenAddress.toLowerCase();

  // Check if it's a known safe token
  const isKnownSafe = SAFE_TOKENS.has(tokenAddress);

  // Fetch from GoPlus Security API
  const goplus = await fetchGoPlusData(tokenAddress);

  // Calculate risk score (0-100, lower = safer)
  const risks = [];
  let riskScore = 0;

  if (goplus) {
    // Honeypot check
    if (goplus.is_honeypot === "1") {
      risks.push({ type: "honeypot", severity: "critical", detail: "Token cannot be sold" });
      riskScore += 40;
    }

    // Owner can mint
    if (goplus.is_mintable === "1") {
      risks.push({ type: "mintable", severity: "high", detail: "Owner can mint new tokens" });
      riskScore += 15;
    }

    // Owner can pause trading
    if (goplus.is_proxy === "1") {
      risks.push({ type: "proxy", severity: "medium", detail: "Contract is upgradeable (proxy)" });
      riskScore += 10;
    }

    // Hidden owner
    if (goplus.hidden_owner === "1") {
      risks.push({ type: "hidden_owner", severity: "high", detail: "Contract has hidden owner" });
      riskScore += 15;
    }

    // Self-destruct capability
    if (goplus.can_take_back_ownership === "1") {
      risks.push({ type: "take_back", severity: "high", detail: "Owner can take back ownership" });
      riskScore += 10;
    }

    // Buy/sell tax
    const buyTax = parseFloat(goplus.buy_tax || "0");
    const sellTax = parseFloat(goplus.sell_tax || "0");
    if (buyTax > 0.1) {
      risks.push({ type: "high_buy_tax", severity: "medium", detail: `Buy tax: ${(buyTax * 100).toFixed(1)}%` });
      riskScore += 10;
    }
    if (sellTax > 0.1) {
      risks.push({ type: "high_sell_tax", severity: "medium", detail: `Sell tax: ${(sellTax * 100).toFixed(1)}%` });
      riskScore += 10;
    }

    // Holder concentration
    const holderCount = parseInt(goplus.holder_count || "0");
    if (holderCount < 100) {
      risks.push({ type: "few_holders", severity: "medium", detail: `Only ${holderCount} holders` });
      riskScore += 5;
    }

    // Top holder concentration
    const topHolderPercent = parseFloat(goplus.lp_holder_percent || "0");
    if (topHolderPercent > 0.5) {
      risks.push({ type: "holder_concentration", severity: "high", detail: `Top holders own ${(topHolderPercent * 100).toFixed(1)}%` });
      riskScore += 15;
    }

    // Liquidity
    const lpTotal = parseFloat(goplus.lp_total_supply || "0");
    if (lpTotal === 0) {
      risks.push({ type: "no_liquidity", severity: "critical", detail: "No liquidity pool found" });
      riskScore += 30;
    }
  } else {
    // GoPlus unavailable — use basic checks
    risks.push({ type: "no_data", severity: "warning", detail: "Security data unavailable — proceed with caution" });
    riskScore += 20;
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  // Determine verdict
  let verdict, emoji;
  if (isKnownSafe) {
    verdict = "SAFE";
    emoji = "✅";
    riskScore = 0;
  } else if (riskScore <= 20) {
    verdict = "LOW_RISK";
    emoji = "🟢";
  } else if (riskScore <= 50) {
    verdict = "MEDIUM_RISK";
    emoji = "🟡";
  } else if (riskScore <= 80) {
    verdict = "HIGH_RISK";
    emoji = "🔴";
  } else {
    verdict = "CRITICAL";
    emoji = "🚨";
  }

  return {
    token: tokenAddress,
    chain: "base",
    timestamp: new Date().toISOString(),
    riskScore,
    verdict,
    emoji,
    isKnownSafe,
    risks,
    details: {
      name: goplus?.token_name || null,
      symbol: goplus?.token_symbol || null,
      holderCount: goplus?.holder_count ? parseInt(goplus.holder_count) : null,
      buyTax: goplus?.buy_tax ? parseFloat(goplus.buy_tax) : null,
      sellTax: goplus?.sell_tax ? parseFloat(goplus.sell_tax) : null,
      isOpenSource: goplus?.is_open_source === "1",
    },
  };
}

async function fetchGoPlusData(tokenAddress) {
  try {
    const res = await fetch(`${GOPLUS_API}/token_security/8453?contract_addresses=${tokenAddress}`);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.result?.[tokenAddress.toLowerCase()];
    return result || null;
  } catch (err) {
    console.error("GoPlus error:", err.message);
    return null;
  }
}
