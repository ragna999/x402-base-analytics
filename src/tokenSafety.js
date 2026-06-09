// Token Safety Checker — rug risk analysis
// Data sources: GoPlus Security API (free), on-chain
// Supports: Base, Arbitrum, Polygon, Avalanche, Celo

const GOPLUS_API = "https://api.gopluslabs.io/api/v1";

// GoPlus chain IDs mapping
const GOPLUS_CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  avalanche: 43114,
  celo: 42220,
};

// Known safe tokens per chain
const SAFE_TOKENS = {
  base: new Set([
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6Ca", // USDbC
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
    "0x4200000000000000000000000000000000000006", // WETH
    "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbETH
  ]),
  arbitrum: new Set([
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
    "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
    "0x912CE59144191C1204E64559FE8253a0e49E6548", // ARB
    "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", // GMX
  ]),
  polygon: new Set([
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
    "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
  ]),
  avalanche: new Set([
    "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC
    "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT
    "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // WAVAX
  ]),
  celo: new Set([
    "0x765DE816845861e75A25fCA122bb6898B8B1282a", // cUSD
    "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73", // cEUR
    "0x471EcE3750Da237f93B8E339c536989b8978a438", // CELO
  ]),
};

/**
 * Analyze token safety using GoPlus + on-chain data
 * @param {string} chainSlug - Chain identifier
 * @param {string} tokenAddress - Token contract address
 */
export async function analyzeTokenSafety(chainSlug, tokenAddress) {
  tokenAddress = tokenAddress.toLowerCase();

  // Check if it's a known safe token
  const chainSafeTokens = SAFE_TOKENS[chainSlug] || new Set();
  const isKnownSafe = chainSafeTokens.has(tokenAddress);

  // Fetch from GoPlus Security API
  const goplus = await fetchGoPlusData(chainSlug, tokenAddress);

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
    chain: chainSlug,
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

async function fetchGoPlusData(chainSlug, tokenAddress) {
  try {
    const chainId = GOPLUS_CHAIN_IDS[chainSlug];
    if (!chainId) return null;
    
    const res = await fetch(`${GOPLUS_API}/token_security/${chainId}?contract_addresses=${tokenAddress}`);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.result?.[tokenAddress.toLowerCase()];
    return result || null;
  } catch (err) {
    console.error("GoPlus error:", err.message);
    return null;
  }
}
