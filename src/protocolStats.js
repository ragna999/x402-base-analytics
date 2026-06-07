// Base Protocol Stats — DeFiLlama data aggregation
// Data: DeFiLlama API (free, no key needed)

const DEFILLAMA = "https://api.llama.fi";

// Cache for 10 minutes
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Get all Base protocol stats from DeFiLlama
 */
export async function getBaseProtocolStats() {
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return cache.data;
  }

  try {
    // Fetch Base chain protocols
    const res = await fetch(`${DEFILLAMA}/protocols`);
    if (!res.ok) throw new Error(`DeFiLlama: ${res.status}`);
    const allProtocols = await res.json();

    // Filter for Base chain
    const baseProtocols = allProtocols
      .filter(p => p.chains?.includes("Base"))
      .map(p => ({
        name: p.name,
        slug: p.slug,
        category: p.category,
        tvl: p.tvl || 0,
        chainTvls: p.chainTvls?.Base || 0,
        change_1d: p.change_1d || null,
        change_7d: p.change_7d || null,
        change_1m: p.change_1m || null,
        mcap: p.mcap || null,
        fdv: p.fdv || null,
        fees: p.fees24h || null,
        revenue: p.revenue24h || null,
        dailyUsers: p.dailyActiveUsers || null,
        url: p.url || null,
        logo: p.logo || null,
      }))
      .sort((a, b) => b.chainTvls - a.chainTvls);

    // Aggregate stats
    const totalTvl = baseProtocols.reduce((sum, p) => sum + (p.chainTvls || 0), 0);
    const categories = {};
    baseProtocols.forEach(p => {
      const cat = p.category || "Other";
      if (!categories[cat]) categories[cat] = { count: 0, tvl: 0 };
      categories[cat].count++;
      categories[cat].tvl += p.chainTvls || 0;
    });

    const result = {
      chain: "base",
      timestamp: new Date().toISOString(),
      summary: {
        totalProtocols: baseProtocols.length,
        totalTvl: Math.round(totalTvl),
        totalTvlFormatted: formatUsd(totalTvl),
        topCategory: Object.entries(categories).sort((a, b) => b[1].tvl - a[1].tvl)[0]?.[0] || null,
      },
      categories: Object.entries(categories)
        .map(([name, data]) => ({
          name,
          protocolCount: data.count,
          tvl: Math.round(data.tvl),
          tvlFormatted: formatUsd(data.tvl),
        }))
        .sort((a, b) => b.tvl - a.tvl),
      topProtocols: baseProtocols.slice(0, 50).map(p => ({
        ...p,
        chainTvlsFormatted: formatUsd(p.chainTvls),
      })),
    };

    cache = { data: result, timestamp: now };
    return result;
  } catch (err) {
    console.error("DeFiLlama error:", err.message);
    throw err;
  }
}

/**
 * Get Base chain TVL history
 */
export async function getBaseTvlHistory() {
  try {
    const res = await fetch(`${DEFILLAMA}/v2/historicalChainTvl/Base`);
    if (!res.ok) throw new Error(`DeFiLlama TVL: ${res.status}`);
    const data = await res.json();

    const current = data[data.length - 1];
    const day7 = data[data.length - 8];
    const day30 = data[data.length - 31];

    return {
      chain: "base",
      timestamp: new Date().toISOString(),
      currentTvl: Math.round(current?.tvl || 0),
      currentTvlFormatted: formatUsd(current?.tvl || 0),
      change7d: day7 ? ((current?.tvl - day7.tvl) / day7.tvl * 100).toFixed(2) + "%" : null,
      change30d: day30 ? ((current?.tvl - day30.tvl) / day30.tvl * 100).toFixed(2) + "%" : null,
      history: data.slice(-30).map(d => ({
        date: new Date(d.date * 1000).toISOString().split("T")[0],
        tvl: Math.round(d.tvl),
      })),
    };
  } catch (err) {
    console.error("DeFiLlama TVL error:", err.message);
    throw err;
  }
}

/**
 * Get top gainers/losers on Base in 24h
 */
export async function getBaseMovers() {
  try {
    const res = await fetch(`${DEFILLAMA}/protocols`);
    if (!res.ok) throw new Error(`DeFiLlama: ${res.status}`);
    const allProtocols = await res.json();

    const baseProtocols = allProtocols
      .filter(p => p.chains?.includes("Base") && p.chainTvls?.Base > 10000)
      .map(p => ({
        name: p.name,
        category: p.category,
        tvl: p.chainTvls?.Base || 0,
        change_1d: p.change_1d || 0,
        change_7d: p.change_7d || 0,
      }));

    const gainers = [...baseProtocols]
      .sort((a, b) => (b.change_1d || 0) - (a.change_1d || 0))
      .slice(0, 10)
      .map(p => ({ ...p, tvlFormatted: formatUsd(p.tvl) }));

    const losers = [...baseProtocols]
      .sort((a, b) => (a.change_1d || 0) - (b.change_1d || 0))
      .slice(0, 10)
      .map(p => ({ ...p, tvlFormatted: formatUsd(p.tvl) }));

    return {
      chain: "base",
      timestamp: new Date().toISOString(),
      gainers,
      losers,
    };
  } catch (err) {
    console.error("DeFiLlama movers error:", err.message);
    throw err;
  }
}

function formatUsd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
