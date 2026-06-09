// GMX V2 Perps Analytics — Arbitrum-specific
// Data source: DeFiLlama (free, no key) + GMX tokens API

const GMX_TOKENS_API = "https://arbitrum-api.gmxinfra.io/tokens";
const DEFILLAMA_API = "https://api.llama.fi";
const YIELDS_API = "https://yields.llama.fi";

/**
 * Get GMX V2 stats — TVL, protocol data
 */
export async function getGmxStats() {
  try {
    const [protocol, tokensRes] = await Promise.all([
      fetchJson(`${DEFILLAMA_API}/protocol/gmx`),
      fetchJson(GMX_TOKENS_API),
    ]);

    const tvl = protocol?.currentChainTvls || {};
    const totalTvl = protocol?.tvl?.[protocol.tvl.length - 1]?.totalLiquidityUSD || 0;

    return {
      chain: "arbitrum",
      protocol: "GMX V2",
      timestamp: new Date().toISOString(),
      stats: {
        totalTvl: totalTvl,
        arbitrumTvl: tvl.Arbitrum || 0,
        avalancheTvl: tvl.Avalanche || 0,
        availableTokens: Array.isArray(tokensRes?.tokens) ? tokensRes.tokens.length : 0,
      },
      tokens: Array.isArray(tokensRes?.tokens) ? tokensRes.tokens.slice(0, 20).map(t => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        synthetic: t.synthetic || false,
      })) : [],
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Get GMX yield data from DeFiLlama
 */
export async function getGmxFundingRates() {
  try {
    const pools = await fetchJson(`${YIELDS_API}/pools`);
    
    const gmxPools = (pools?.data || [])
      .filter(p => (p.project === "gmx-v2-perps" || p.project === "gmx") && p.chain === "Arbitrum" && p.tvlUsd > 100000)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, 20)
      .map(p => ({
        pool: p.pool,
        symbol: p.symbol,
        apy: p.apy,
        tvlUsd: p.tvlUsd,
        apyBase: p.apyBase,
        apyReward: p.apyReward,
        ilRisk: p.ilRisk,
        exposure: p.exposure,
      }));

    return {
      chain: "arbitrum",
      protocol: "GMX V2",
      timestamp: new Date().toISOString(),
      pools: gmxPools,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Get GLP/ GMX yield data
 */
export async function getGlpYield() {
  try {
    const pools = await fetchJson(`${YIELDS_API}/pools`);
    
    const gmxPools = (pools?.data || [])
      .filter(p => (p.project === "gmx-v2-perps" || p.project === "gmx") && p.chain === "Arbitrum")
      .sort((a, b) => b.tvlUsd - a.tvlUsd);

    const glp = gmxPools.find(p => p.symbol.includes("GLP") || p.symbol.includes("GMX"));
    const stakingPools = gmxPools.filter(p => !p.symbol.includes("GLP"));

    return {
      chain: "arbitrum",
      protocol: "GMX",
      timestamp: new Date().toISOString(),
      glp: glp ? {
        symbol: glp.symbol,
        apy: glp.apy,
        tvlUsd: glp.tvlUsd,
      } : null,
      gmxStaking: stakingPools.length > 0 ? {
        symbol: stakingPools[0].symbol,
        apy: stakingPools[0].apy,
        tvlUsd: stakingPools[0].tvlUsd,
      } : null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Get GMX liquidations — placeholder (GMX API changed)
 */
export async function getGmxLiquidations() {
  return {
    chain: "arbitrum",
    protocol: "GMX V2",
    timestamp: new Date().toISOString(),
    message: "GMX liquidation feed requires GMX subgraph. Use DeFiLlama yields data instead.",
    alternative: "GET /api/arbitrum/gmx/funding for yield/pool data",
  };
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
