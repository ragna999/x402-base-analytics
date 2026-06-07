// Aerodrome pools on Base
// Uses Aerodrome's public API
const AERO_API = "https://api.aerodrome.finance/v1/pools";

// Fallback: direct subgraph query
const AERO_SUBGRAPH = "https://api.studio.thegraph.com/query/48764/aerodrome-base/version/latest";

/**
 * Fetch Aerodrome pool data
 */
export async function getAerodromeYields() {
  try {
    // Try primary API first
    const res = await fetch(AERO_API, {
      headers: { "Accept": "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      const pools = Array.isArray(data) ? data : (data.pools || data.data || []);

      return pools
        .slice(0, 100)
        .map((p) => {
          const apr = p.apr ?? p.totalApr ?? p.apy ?? 0;
          const tvl = p.tvl ?? p.tvlUsd ?? p.reserveUsd ?? 0;
          const tokens = p.tokens || p.coins || [];
          const symbol = tokens.length >= 2
            ? `${tokens[0]?.symbol || "?"}/${tokens[1]?.symbol || "?"}`
            : p.symbol || p.name || "UNKNOWN";

          return {
            protocol: "aerodrome",
            name: `Aero ${symbol}`,
            pool: p.address || p.pool || p.id,
            asset: symbol,
            apr: Number(apr) * 100,
            tvlUsd: Number(tvl),
            type: p.type || (p.stable ? "stable" : "volatile"),
            chain: "base",
          };
        })
        .filter((p) => p.apr > 0 && p.tvlUsd > 1000);
    }

    // Fallback to subgraph
    return await getAerodromeFromSubgraph();
  } catch (err) {
    console.error("Aerodrome fetch error:", err.message);
    // Try subgraph fallback
    try {
      return await getAerodromeFromSubgraph();
    } catch (e) {
      return [];
    }
  }
}

async function getAerodromeFromSubgraph() {
  const query = `{
    pools(first: 50, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      token0 { symbol }
      token1 { symbol }
      totalValueLockedUSD
      poolType
    }
  }`;

  const res = await fetch(AERO_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`Aero subgraph: ${res.status}`);
  const data = await res.json();
  const pools = data?.data?.pools || [];

  return pools.map((p) => ({
    protocol: "aerodrome",
    name: `Aero ${p.token0?.symbol || "?"}/${p.token1?.symbol || "?"}`,
    pool: p.id,
    asset: `${p.token0?.symbol || "?"}/${p.token1?.symbol || "?"}`,
    apr: null, // Subgraph doesn't always have APR
    tvlUsd: Number(p.totalValueLockedUSD || 0),
    type: p.poolType || "unknown",
    chain: "base",
  }));
}
