// Moonwell markets on Base
// Docs: https://moonwell.fi/developers
const MOONWELL_API = "https://api.moonwell.fi/v2/markets?chain=base";

/**
 * Fetch Moonwell lending market data
 */
export async function getMoonwellYields() {
  try {
    const res = await fetch(MOONWELL_API, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) throw new Error(`Moonwell API: ${res.status}`);
    const data = await res.json();

    // data is an array of market objects
    const markets = Array.isArray(data) ? data : (data.markets || data.data || []);

    return markets
      .map((m) => {
        const supplyApy = m.supplyApy ?? m.supply_apy ?? m.apy ?? null;
        const supplyRewardApy = m.supplyRewardApy ?? m.supply_reward_apy ?? 0;
        const totalSupplyApy = supplyApy !== null ? Number(supplyApy) + Number(supplyRewardApy || 0) : null;
        const borrowApy = m.borrowApy ?? m.borrow_apy ?? null;
        const totalSupplyUsd = m.totalSupplyUsd ?? m.total_supply_usd ?? m.tvl ?? null;
        const symbol = m.underlyingSymbol ?? m.symbol ?? m.asset?.symbol ?? "UNKNOWN";
        const address = m.tokenAddress ?? m.underlyingAddress ?? m.asset?.address ?? null;

        return {
          protocol: "moonwell",
          name: `Moonwell ${symbol}`,
          market: m.id || m.marketId || address,
          asset: symbol,
          assetAddress: address,
          supplyApy: totalSupplyApy !== null ? totalSupplyApy * 100 : null,
          borrowApy: borrowApy !== null ? Number(borrowApy) * 100 : null,
          tvlUsd: totalSupplyUsd ? Number(totalSupplyUsd) : null,
          chain: "base",
        };
      })
      .filter((m) => m.supplyApy !== null && m.supplyApy > 0);
  } catch (err) {
    console.error("Moonwell fetch error:", err.message);
    return [];
  }
}
