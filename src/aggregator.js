import { getMorphoYields } from "./providers/morpho.js";
import { getMoonwellYields } from "./providers/moonwell.js";
import { getAerodromeYields } from "./providers/aerodrome.js";

// Cache results for 5 minutes (avoid hammering upstream APIs)
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch yields from all protocols in parallel
 */
async function fetchAllYields() {
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

  const [morpho, moonwell, aerodrome] = await Promise.all([
    getMorphoYields(),
    getMoonwellYields(),
    getAerodromeYields(),
  ]);

  cache = {
    data: { morpho, moonwell, aerodrome, fetchedAt: new Date().toISOString() },
    timestamp: now,
  };

  return cache.data;
}

/**
 * Normalize yield data into a unified format
 */
function normalize(entry) {
  const apy = entry.apy ?? entry.supplyApy ?? entry.apr ?? null;
  return {
    protocol: entry.protocol,
    name: entry.name,
    asset: entry.asset,
    apy: apy !== null ? Math.round(apy * 100) / 100 : null,
    tvlUsd: entry.tvlUsd ? Math.round(entry.tvlUsd) : null,
    type: entry.type || (entry.protocol === "morpho" ? "vault" : entry.protocol === "moonwell" ? "lending" : "lp"),
    chain: "chain",
  };
}

/**
 * Get all yields, sorted by APY descending
 */
export async function getAllYields() {
  const raw = await fetchAllYields();

  const all = [
    ...raw.morpho.map(normalize),
    ...raw.moonwell.map(normalize),
    ...raw.aerodrome.map(normalize),
  ].filter((y) => y.apy !== null && y.apy > 0);

  all.sort((a, b) => b.apy - a.apy);

  return {
    timestamp: raw.fetchedAt,
    count: all.length,
    protocols: {
      morpho: raw.morpho.length,
      moonwell: raw.moonwell.length,
      aerodrome: raw.aerodrome.length,
    },
    yields: all,
  };
}

/**
 * Get best yields for a specific asset
 */
export async function getBestYieldsForAsset(assetSymbol) {
  const raw = await fetchAllYields();
  const target = assetSymbol.toUpperCase();

  const matches = [
    ...raw.morpho.map(normalize),
    ...raw.moonwell.map(normalize),
    ...raw.aerodrome.map(normalize),
  ].filter((y) => {
    const asset = y.asset.toUpperCase();
    return (
      y.apy !== null &&
      y.apy > 0 &&
      (asset === target || asset.includes(target) || asset.startsWith(target))
    );
  });

  matches.sort((a, b) => b.apy - a.apy);

  return {
    asset: target,
    timestamp: raw.fetchedAt,
    count: matches.length,
    bestYield: matches[0] || null,
    top5: matches.slice(0, 5),
    allMatches: matches,
  };
}

/**
 * Get best yield by risk level
 * - low: lending (Moonwell, Morpho blue-chip vaults)
 * - medium: established LPs (Aerodrome stable pairs)
 * - high: volatile LPs, leveraged vaults
 */
export async function getYieldsByRisk() {
  const raw = await fetchAllYields();

  const all = [
    ...raw.morpho.map(normalize),
    ...raw.moonwell.map(normalize),
    ...raw.aerodrome.map(normalize),
  ].filter((y) => y.apy !== null && y.apy > 0);

  const low = all.filter((y) => y.type === "lending" || y.type === "vault")
    .sort((a, b) => b.apy - a.apy);

  const medium = all.filter((y) => y.type === "stable" || (y.type === "lp" && y.tvlUsd > 100000))
    .sort((a, b) => b.apy - a.apy);

  const high = all.filter((y) => y.type === "volatile" || y.type === "lp")
    .sort((a, b) => b.apy - a.apy);

  return {
    timestamp: raw.fetchedAt,
    low: { count: low.length, best: low[0] || null, top5: low.slice(0, 5) },
    medium: { count: medium.length, best: medium[0] || null, top5: medium.slice(0, 5) },
    high: { count: high.length, best: high[0] || null, top5: high.slice(0, 5) },
  };
}

/**
 * Get rebalance recommendations
 * Compare current position APY vs best available
 */
export async function getRebalanceRecommendation(currentProtocol, currentApy) {
  const raw = await fetchAllYields();
  const currentApyNum = Number(currentApy);

  const all = [
    ...raw.morpho.map(normalize),
    ...raw.moonwell.map(normalize),
    ...raw.aerodrome.map(normalize),
  ].filter((y) => y.apy !== null && y.apy > currentApyNum * 1.1); // At least 10% better

  all.sort((a, b) => b.apy - a.apy);

  const improvement = all.length > 0
    ? Math.round((all[0].apy - currentApyNum) * 100) / 100
    : 0;

  return {
    current: { protocol: currentProtocol, apy: currentApyNum },
    recommendation: improvement > 0 ? {
      shouldRebalance: true,
      bestAlternative: all[0],
      improvementPct: improvement > 0 ? Math.round((improvement / currentApyNum) * 100) : 0,
      top3: all.slice(0, 3),
    } : {
      shouldRebalance: false,
      message: "No significantly better yield found. Current position is competitive.",
    },
    timestamp: raw.fetchedAt,
  };
}
