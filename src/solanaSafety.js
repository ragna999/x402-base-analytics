// Solana Token Safety — Rug check for Solana tokens
// Data sources: GoPlus Security API (free), GeckoTerminal, on-chain

const GOPLUS_API = "https://api.gopluslabs.io/api/v1";

// Known safe Solana tokens
const SAFE_TOKENS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "So11111111111111111111111111111111111111112",     // SOL (wrapped)
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  // mSOL
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj", // stSOL
]);

/**
 * Analyze Solana token safety
 * @param {string} mintAddress - Solana token mint address
 */
export async function analyzeSolanaTokenSafety(mintAddress) {
  mintAddress = mintAddress.toLowerCase();

  // Check if known safe
  const isKnownSafe = SAFE_TOKENS.has(mintAddress);

  // Fetch from GoPlus (Solana chain)
  const goplus = await fetchGoPlusSolana(mintAddress);

  // Fetch from GeckoTerminal for additional data
  const gecko = await fetchGeckoToken(mintAddress);

  // Calculate risk score
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

    // Freeze authority
    if (goplus.owner_can_freeze === "1" || goplus.freezeable === "1") {
      risks.push({ type: "freezable", severity: "high", detail: "Owner can freeze transfers" });
      riskScore += 20;
    }

    // Hidden owner
    if (goplus.hidden_owner === "1") {
      risks.push({ type: "hidden_owner", severity: "high", detail: "Contract has hidden owner" });
      riskScore += 15;
    }

    // Self-destruct
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

    // Holder count
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
  } else {
    risks.push({ type: "no_data", severity: "warning", detail: "GoPlus data unavailable for this token" });
    riskScore += 15;
  }

  // GeckoTerminal checks
  if (gecko?.data?.attributes) {
    const attrs = gecko.data.attributes;
    
    // Check if token has pools
    const poolCount = attrs.pool_count || 0;
    if (poolCount === 0) {
      risks.push({ type: "no_pools", severity: "critical", detail: "No liquidity pools found" });
      riskScore += 30;
    }

    // Check price change (potential dump)
    const priceChange24h = parseFloat(attrs.price_change_percentage?.h24 || "0");
    if (priceChange24h < -90) {
      risks.push({ type: "price_dump", severity: "critical", detail: `Price dropped ${priceChange24h.toFixed(1)}% in 24h` });
      riskScore += 25;
    }

    // Check volume (dead token)
    const volume24h = parseFloat(attrs.volume_usd?.h24 || "0");
    if (volume24h < 100) {
      risks.push({ type: "low_volume", severity: "medium", detail: `Only $${volume24h.toFixed(2)} volume in 24h` });
      riskScore += 10;
    }
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
    token: mintAddress,
    chain: "solana",
    timestamp: new Date().toISOString(),
    riskScore,
    verdict,
    emoji,
    isKnownSafe,
    risks,
    details: {
      name: goplus?.token_name || gecko?.data?.attributes?.name || null,
      symbol: goplus?.token_symbol || gecko?.data?.attributes?.symbol || null,
      holderCount: goplus?.holder_count ? parseInt(goplus.holder_count) : null,
      buyTax: goplus?.buy_tax ? parseFloat(goplus.buy_tax) : null,
      sellTax: goplus?.sell_tax ? parseFloat(goplus.sell_tax) : null,
      isOpenSource: goplus?.is_open_source === "1",
      priceUsd: gecko?.data?.attributes?.price_usd || null,
      volume24h: gecko?.data?.attributes?.volume_usd?.h24 || null,
      marketCap: gecko?.data?.attributes?.market_cap || null,
      poolCount: gecko?.data?.attributes?.pool_count || null,
    },
  };
}

async function fetchGoPlusSolana(mintAddress) {
  try {
    // GoPlus uses "solana" as chain identifier for Solana
    const res = await fetch(`${GOPLUS_API}/token_security/solana?contract_addresses=${mintAddress}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result?.[mintAddress.toLowerCase()] || null;
  } catch {
    return null;
  }
}

async function fetchGeckoToken(mintAddress) {
  try {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
