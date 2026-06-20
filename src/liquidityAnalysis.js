// Liquidity Analysis — DEX pool depth, slippage, liquidity health
// Data sources: DexScreener API (free, no key), DeFiLlama (free)
// Supports: All chains

async function fetchJSON(url, timeout = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchWithFallback(url, timeout = 8000) {
  try {
    return await fetchJSON(url, timeout);
  } catch {
    return null;
  }
}

// Get token pairs from DexScreener
async function getDexScreenerPairs(tokenAddress) {
  const data = await fetchWithFallback(
    `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
  );
  if (!data || !data.pairs) return [];
  return data.pairs;
}

// Estimate slippage for a given trade size
function estimateSlippage(pair, tradeSizeUsd) {
  const liquidity = pair.liquidity?.usd || 0;
  if (liquidity === 0) return { slippage: 100, feasible: false };

  // Simple slippage model: slippage ≈ tradeSize / liquidity * 100
  // More accurate would use the constant product formula
  const slippage = (tradeSizeUsd / liquidity) * 100;

  return {
    slippage: Math.min(slippage, 100).toFixed(2) + "%",
    slippageNum: Math.min(slippage, 100),
    feasible: slippage < 10,
    warning: slippage > 5 ? "HIGH_SLIPPAGE" : slippage > 2 ? "MODERATE_SLIPPAGE" : null,
  };
}

// Calculate liquidity health score
function calculateLiquidityHealth(pairs) {
  if (pairs.length === 0) return { score: 0, rating: "no_liquidity", flags: ["NO_DEX_LIQUIDITY"] };

  const flags = [];
  let score = 0;

  // Total liquidity
  const totalLiquidity = pairs.reduce((sum, p) => sum + (p.liquidity?.usd || 0), 0);
  if (totalLiquidity > 10000000) score += 30;
  else if (totalLiquidity > 1000000) score += 25;
  else if (totalLiquidity > 100000) score += 15;
  else if (totalLiquidity > 10000) score += 5;
  else {
    flags.push("VERY_LOW_LIQUIDITY");
  }

  // Number of DEX pairs
  if (pairs.length >= 5) score += 15;
  else if (pairs.length >= 3) score += 10;
  else if (pairs.length >= 1) score += 5;

  // 24h volume
  const totalVolume = pairs.reduce((sum, p) => sum + (p.volume?.h24 || 0), 0);
  if (totalVolume > 1000000) score += 20;
  else if (totalVolume > 100000) score += 15;
  else if (totalVolume > 10000) score += 10;
  else if (totalVolume > 1000) score += 5;

  // Volume/liquidity ratio (healthy: 0.1 - 2.0)
  const vlRatio = totalLiquidity > 0 ? totalVolume / totalLiquidity : 0;
  if (vlRatio > 0.1 && vlRatio < 2.0) score += 15;
  else if (vlRatio > 0.01) score += 10;
  else {
    flags.push("LOW_VOLUME_LIQUIDITY_RATIO");
  }

  // Price change stability
  const avgPriceChange = pairs.reduce((sum, p) => sum + Math.abs(p.priceChange?.h24 || 0), 0) / pairs.length;
  if (avgPriceChange < 5) score += 10;
  else if (avgPriceChange < 15) score += 5;
  else {
    flags.push("HIGH_PRICE_VOLATILITY");
  }

  // Multi-chain presence
  const chains = new Set(pairs.map(p => p.chainId));
  if (chains.size > 1) {
    score += 10;
  }

  // Concentration check (if one pair has >80% of liquidity)
  const maxPairLiquidity = Math.max(...pairs.map(p => p.liquidity?.usd || 0));
  if (totalLiquidity > 0 && maxPairLiquidity / totalLiquidity > 0.8) {
    flags.push("LIQUIDITY_CONCENTRATED");
    score -= 10;
  }

  score = Math.max(0, Math.min(score, 100));

  let rating;
  if (score >= 80) rating = "excellent";
  else if (score >= 60) rating = "good";
  else if (score >= 40) rating = "moderate";
  else if (score >= 20) rating = "poor";
  else rating = "critical";

  return {
    score,
    rating,
    flags,
    totalLiquidity: totalLiquidity.toFixed(2),
    totalVolume24h: totalVolume.toFixed(2),
    volumeLiquidityRatio: vlRatio.toFixed(4),
    pairCount: pairs.length,
    chainCount: chains.size,
    avgPriceChange24h: avgPriceChange.toFixed(2) + "%",
  };
}

// Format pair data
function formatPair(pair) {
  return {
    dex: pair.dexId || "unknown",
    pairAddress: pair.pairAddress,
    baseToken: pair.baseToken?.symbol || "?",
    quoteToken: pair.quoteToken?.symbol || "?",
    chain: pair.chainId || "unknown",
    priceUsd: pair.priceUsd || "0",
    priceChange: {
      h1: (pair.priceChange?.h1 || 0).toFixed(2) + "%",
      h6: (pair.priceChange?.h6 || 0).toFixed(2) + "%",
      h24: (pair.priceChange?.h24 || 0).toFixed(2) + "%",
    },
    volume: {
      h24: (pair.volume?.h24 || 0).toFixed(2),
      h6: (pair.volume?.h6 || 0).toFixed(2),
      h1: (pair.volume?.h1 || 0).toFixed(2),
    },
    liquidity: {
      usd: (pair.liquidity?.usd || 0).toFixed(2),
      base: (pair.liquidity?.base || 0).toFixed(4),
      quote: (pair.liquidity?.quote || 0).toFixed(4),
    },
    fdv: pair.fdv || 0,
    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
    url: pair.url || null,
  };
}

// Main function
export async function analyzeLiquidity(chainOrAll, tokenAddress) {
  // DexScreener works cross-chain, so chain param is optional
  const pairs = await getDexScreenerPairs(tokenAddress);

  if (pairs.length === 0) {
    return {
      token: tokenAddress,
      pairs: [],
      health: { score: 0, rating: "no_liquidity", flags: ["NO_DEX_PAIRS_FOUND"] },
      slippageEstimates: {},
      analyzed_at: new Date().toISOString(),
    };
  }

  // Filter by chain if specified
  const filteredPairs = chainOrAll && chainOrAll !== "all"
    ? pairs.filter(p => p.chainId === chainOrAll)
    : pairs;

  const formattedPairs = filteredPairs.map(formatPair);
  const health = calculateLiquidityHealth(filteredPairs);

  // Slippage estimates for common trade sizes
  const tradeSizes = [100, 1000, 10000, 50000, 100000];
  const slippageEstimates = {};

  // Use the deepest pool for slippage estimates
  const deepestPair = filteredPairs.reduce((max, p) =>
    (p.liquidity?.usd || 0) > (max.liquidity?.usd || 0) ? p : max
  , filteredPairs[0]);

  for (const size of tradeSizes) {
    slippageEstimates[`$${size.toLocaleString()}`] = estimateSlippage(deepestPair, size);
  }

  // Best routes (sorted by liquidity)
  const bestRoutes = formattedPairs
    .sort((a, b) => parseFloat(b.liquidity.usd) - parseFloat(a.liquidity.usd))
    .slice(0, 5)
    .map(p => ({
      dex: p.dex,
      pair: `${p.baseToken}/${p.quoteToken}`,
      liquidity: "$" + parseFloat(p.liquidity.usd).toLocaleString(),
      volume24h: "$" + parseFloat(p.volume.h24).toLocaleString(),
      url: p.url,
    }));

  return {
    token: tokenAddress,
    health,
    pairs: formattedPairs,
    bestRoutes,
    slippageEstimates,
    analyzed_at: new Date().toISOString(),
  };
}
