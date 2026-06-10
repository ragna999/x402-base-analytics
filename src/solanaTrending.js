// Solana Trending & New Tokens — Degen alpha signals
// Data source: GeckoTerminal API (free, no key)

/**
 * Get trending Solana pools
 * @param {number} limit - Number of pools to return
 */
export async function getSolanaTrending(limit = 20) {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) throw new Error(`GeckoTerminal error: ${res.status}`);
    const data = await res.json();

    const pools = (data?.data || []).slice(0, limit).map(p => ({
      address: p.id,
      name: p.attributes?.name || "Unknown",
      symbol: p.attributes?.symbol || "?",
      priceUsd: p.attributes?.price_usd || "0",
      priceChange24h: p.attributes?.price_change_percentage?.h24 || "0",
      volume24h: p.attributes?.volume_usd?.h24 || "0",
      txCount24h: p.attributes?.transactions?.h24?.buys + p.attributes?.transactions?.h24?.sells || 0,
      buys24h: p.attributes?.transactions?.h24?.buys || 0,
      sells24h: p.attributes?.transactions?.h24?.sells || 0,
      reserveUsd: p.attributes?.reserve_in_usd || "0",
      poolCreatedAt: p.attributes?.pool_created_at || null,
    }));

    return {
      chain: "solana",
      timestamp: new Date().toISOString(),
      count: pools.length,
      pools,
    };
  } catch (err) {
    return { chain: "solana", error: err.message, pools: [] };
  }
}

/**
 * Get new Solana pools (alpha signal for degens)
 * @param {number} limit - Number of pools to return
 */
export async function getSolanaNewTokens(limit = 20) {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) throw new Error(`GeckoTerminal error: ${res.status}`);
    const data = await res.json();

    const pools = (data?.data || []).slice(0, limit).map(p => ({
      address: p.id,
      name: p.attributes?.name || "Unknown",
      symbol: p.attributes?.symbol || "?",
      priceUsd: p.attributes?.price_usd || "0",
      priceChange24h: p.attributes?.price_change_percentage?.h24 || "0",
      volume24h: p.attributes?.volume_usd?.h24 || "0",
      txCount24h: p.attributes?.transactions?.h24?.buys + p.attributes?.transactions?.h24?.sells || 0,
      buys24h: p.attributes?.transactions?.h24?.buys || 0,
      sells24h: p.attributes?.transactions?.h24?.sells || 0,
      reserveUsd: p.attributes?.reserve_in_usd || "0",
      poolCreatedAt: p.attributes?.pool_created_at || null,
    }));

    return {
      chain: "solana",
      timestamp: new Date().toISOString(),
      count: pools.length,
      pools,
    };
  } catch (err) {
    return { chain: "solana", error: err.message, pools: [] };
  }
}

/**
 * Get top Solana pools by volume
 * @param {number} limit - Number of pools to return
 */
export async function getSolanaTopVolume(limit = 20) {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools?page=1&sort=h24_volume_usd_desc`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) throw new Error(`GeckoTerminal error: ${res.status}`);
    const data = await res.json();

    const pools = (data?.data || []).slice(0, limit).map(p => ({
      address: p.id,
      name: p.attributes?.name || "Unknown",
      symbol: p.attributes?.symbol || "?",
      priceUsd: p.attributes?.price_usd || "0",
      priceChange24h: p.attributes?.price_change_percentage?.h24 || "0",
      volume24h: p.attributes?.volume_usd?.h24 || "0",
      txCount24h: p.attributes?.transactions?.h24?.buys + p.attributes?.transactions?.h24?.sells || 0,
      buys24h: p.attributes?.transactions?.h24?.buys || 0,
      sells24h: p.attributes?.transactions?.h24?.sells || 0,
      reserveUsd: p.attributes?.reserve_in_usd || "0",
      poolCreatedAt: p.attributes?.pool_created_at || null,
    }));

    return {
      chain: "solana",
      timestamp: new Date().toISOString(),
      count: pools.length,
      pools,
    };
  } catch (err) {
    return { chain: "solana", error: err.message, pools: [] };
  }
}
