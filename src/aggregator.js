// Yield aggregator using DeFiLlama (free, no auth, reliable)
// Replaces broken Morpho/Moonwell/Aerodrome direct APIs

const DEFILLAMA_YIELDS = "https://yields.llama.fi/pools";

// Cache results for 5 minutes
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch all Base yield pools from DeFiLlama
 */
async function fetchBaseYields() {
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

  try {
    const res = await fetch(DEFILLAMA_YIELDS, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) throw new Error(`DeFiLlama Yields API: ${res.status}`);
    const data = await res.json();

    // Filter for Base chain pools
    const basePools = (data.data || [])
      .filter((p) => p.chain === "Base" && p.tvlUsd > 10000)
      .map((p) => ({
        protocol: p.project || "unknown",
        name: p.symbol || "UNKNOWN",
        pool: p.pool,
        asset: p.symbol || "UNKNOWN",
        apy: p.apy ? Math.round(p.apy * 100) / 100 : null,
        apyBase: p.apyBase ? Math.round(p.apyBase * 100) / 100 : null,
        apyReward: p.apyReward ? Math.round(p.apyReward * 100) / 100 : null,
        tvlUsd: Math.round(p.tvlUsd || 0),
        chain: "base",
        stablecoin: p.stablecoin || false,
        IL: p.ilRisk || "no",
        exposure: p.exposure || "single",
      }))
      .filter((p) => p.apy !== null && p.apy > 0 && p.apy < 10000) // Filter outliers
      .sort((a, b) => b.tvlUsd - a.tvlUsd);

    cache = { data: basePools, timestamp: now };
    return basePools;
  } catch (err) {
    console.error("DeFiLlama yields fetch error:", err.message);
    return [];
  }
}

/**
 * Get all yields, sorted by APY descending
 */
export async function getAllYields() {
  const yields = await fetchBaseYields();
  return {
    timestamp: new Date().toISOString(),
    count: yields.length,
    protocols: {
      morpho: yields.filter((y) => y.protocol.includes("morpho")).length,
      moonwell: yields.filter((y) => y.protocol.includes("moonwell")).length,
      aerodrome: yields.filter((y) => y.protocol.includes("aerodrome")).length,
      other: yields.filter((y) => !y.protocol.includes("morpho") && !y.protocol.includes("moonwell") && !y.protocol.includes("aerodrome")).length,
    },
    yields: yields.slice(0, 100),
  };
}

/**
 * Get best yield for a specific asset
 */
export async function getBestYieldsForAsset(asset) {
  const yields = await fetchBaseYields();
  const assetUpper = asset.toUpperCase();

  const matching = yields
    .filter((y) => {
      const name = (y.asset || "").toUpperCase();
      return name.includes(assetUpper) || name === assetUpper;
    })
    .sort((a, b) => (b.apy || 0) - (a.apy || 0));

  return {
    timestamp: new Date().toISOString(),
    asset: assetUpper,
    count: matching.length,
    bestYield: matching[0] || null,
    top5: matching.slice(0, 5),
  };
}

/**
 * Get yields categorized by risk level
 */
export async function getYieldsByRisk() {
  const yields = await fetchBaseYields();

  const lowRisk = yields.filter((y) => y.apy < 5 && (y.stablecoin || y.apy < 3));
  const mediumRisk = yields.filter((y) => y.apy >= 5 && y.apy < 20);
  const highRisk = yields.filter((y) => y.apy >= 20);

  return {
    timestamp: new Date().toISOString(),
    low: {
      count: lowRisk.length,
      avgApy: avgApy(lowRisk),
      top3: lowRisk.sort((a, b) => b.apy - a.apy).slice(0, 3),
    },
    medium: {
      count: mediumRisk.length,
      avgApy: avgApy(mediumRisk),
      top3: mediumRisk.sort((a, b) => b.apy - a.apy).slice(0, 3),
    },
    high: {
      count: highRisk.length,
      avgApy: avgApy(highRisk),
      top3: highRisk.sort((a, b) => b.apy - a.apy).slice(0, 3),
    },
  };
}

/**
 * Get rebalance recommendation
 */
export async function getRebalanceRecommendation(currentProtocol, currentApy) {
  const yields = await fetchBaseYields();
  const currentApyNum = parseFloat(currentApy);

  // Find better yields than current
  const better = yields
    .filter((y) => y.apy > currentApyNum && !y.protocol.toLowerCase().includes(currentProtocol.toLowerCase()))
    .sort((a, b) => b.apy - a.apy);

  const improvement = better[0] ? ((better[0].apy - currentApyNum) / currentApyNum * 100).toFixed(1) : 0;

  return {
    timestamp: new Date().toISOString(),
    current: {
      protocol: currentProtocol,
      apy: currentApyNum,
    },
    recommendation: better.length > 0 ? {
      action: "REBALANCE",
      target: better[0],
      improvement: `${improvement}% better APY`,
      risk: better[0].apy > 20 ? "HIGH" : better[0].apy > 10 ? "MEDIUM" : "LOW",
    } : {
      action: "HOLD",
      reason: "No significantly better yields available",
    },
    alternatives: better.slice(0, 5),
  };
}

function avgApy(yields) {
  if (!yields.length) return 0;
  const sum = yields.reduce((acc, y) => acc + (y.apy || 0), 0);
  return Math.round((sum / yields.length) * 100) / 100;
}
