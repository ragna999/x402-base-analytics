// Solana Sniper Tracker — Early buyer detection for Solana tokens
// Data source: GeckoTerminal trades API (free, no key)

/**
 * Find early buyers (snipers) for a Solana token
 * @param {string} mintAddress - Solana token mint address
 * @param {object} options - { maxBuyers: 20, timeWindow: 300 }
 */
export async function findSolanaSnipers(mintAddress, options = {}) {
  const { maxBuyers = 20, timeWindow = 300 } = options; // 5 min default

  // Get pools for this token
  const pools = await getTokenPools(mintAddress);
  if (!pools || pools.length === 0) {
    return {
      token: mintAddress,
      chain: "solana",
      error: "No pools found for this token",
      snipers: [],
    };
  }

  // Get the most active pool
  const mainPool = pools[0];
  const poolAddress = mainPool.id;

  // Get recent trades from GeckoTerminal
  const trades = await getPoolTrades(poolAddress);
  if (!trades || trades.length === 0) {
    return {
      token: mintAddress,
      chain: "solana",
      pool: poolAddress,
      error: "No trades found",
      snipers: [],
    };
  }

  // Filter buy trades within time window
  const now = Date.now() / 1000;
  const earlyTrades = trades.filter(t => {
    const tradeTime = new Date(t.attributes?.block_timestamp).getTime() / 1000;
    const isBuy = t.attributes?.kind === "buy";
    return isBuy && (now - tradeTime) < timeWindow;
  });

  // Aggregate by wallet
  const walletMap = new Map();
  for (const trade of earlyTrades) {
    const wallet = trade.attributes?.tx_from;
    if (!wallet) continue;

    if (!walletMap.has(wallet)) {
      walletMap.set(wallet, {
        wallet,
        buys: 0,
        totalSpent: 0,
        firstBuyTime: trade.attributes?.block_timestamp,
        trades: [],
      });
    }

    const entry = walletMap.get(wallet);
    entry.buys++;
    entry.totalSpent += parseFloat(trade.attributes?.from_token_amount || "0") * 
                         parseFloat(trade.attributes?.price_from_in_usd || "0");
    entry.trades.push({
      time: trade.attributes?.block_timestamp,
      amount: trade.attributes?.from_token_amount,
      usdValue: trade.attributes?.price_from_in_usd,
    });
  }

  // Sort by earliest buy, then by amount
  const snipers = Array.from(walletMap.values())
    .sort((a, b) => new Date(a.firstBuyTime) - new Date(b.firstBuyTime))
    .slice(0, maxBuyers)
    .map((s, i) => ({
      rank: i + 1,
      wallet: s.wallet,
      buys: s.buys,
      totalSpentUsd: Math.round(s.totalSpent * 100) / 100,
      firstBuyTime: s.firstBuyTime,
      timeSinceFirstBuy: Math.round((now - new Date(s.firstBuyTime).getTime() / 1000)) + "s",
    }));

  return {
    token: mintAddress,
    chain: "solana",
    pool: poolAddress,
    poolName: mainPool.attributes?.name || "Unknown",
    timestamp: new Date().toISOString(),
    timeWindow: `${timeWindow}s`,
    totalSnipers: snipers.length,
    snipers,
  };
}

/**
 * Get sniper score for a Solana token
 */
export async function getSolanaSniperScore(mintAddress) {
  const result = await findSolanaSnipers(mintAddress, { maxBuyers: 50, timeWindow: 300 });
  
  if (result.error) {
    return {
      token: mintAddress,
      chain: "solana",
      score: 0,
      verdict: "NO_DATA",
      error: result.error,
    };
  }

  const sniperCount = result.totalSnipers;
  
  // Calculate score (0-100, higher = more snipers = riskier)
  let score = 0;
  if (sniperCount > 20) score = 90;
  else if (sniperCount > 10) score = 70;
  else if (sniperCount > 5) score = 50;
  else if (sniperCount > 2) score = 30;
  else score = 10;

  let verdict;
  if (score >= 70) verdict = "HEAVY_SNIPING";
  else if (score >= 40) verdict = "MODERATE_SNIPING";
  else verdict = "LOW_SNIPING";

  return {
    token: mintAddress,
    chain: "solana",
    timestamp: new Date().toISOString(),
    score,
    verdict,
    sniperCount,
    pool: result.pool,
    poolName: result.poolName,
    topSnipers: result.snipers.slice(0, 5),
  };
}

async function getTokenPools(mintAddress) {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?sort=h24_volume_usd_desc`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data || [];
  } catch {
    return [];
  }
}

async function getPoolTrades(poolAddress) {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/trades`,
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data || [];
  } catch {
    return [];
  }
}
