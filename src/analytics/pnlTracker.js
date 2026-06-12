/**
 * Portfolio P&L Tracker
 * Calculates realized + unrealized P&L for any wallet using:
 * - Blockscout token transfers (buy/sell detection)
 * - GeckoTerminal real-time prices (unrealized P&L)
 * - Average cost basis method
 */

import {
  getChain,
  getBlockscoutTokenTransfers,
  getBlockscoutTokenBalances,
  fetchFromGecko,
  getNativeBalance,
} from "../chains.js";

// Cache prices for 60s to avoid hammering GeckoTerminal
const priceCache = new Map();
const CACHE_TTL = 60_000;

async function getTokenPrice(chainSlug, tokenAddress) {
  const cacheKey = `${chainSlug}:${tokenAddress}`.toLowerCase();
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;

  const chain = getChain(chainSlug);

  // Try GeckoTerminal first
  try {
    const data = await fetchFromGecko(
      `/networks/${chain.gecko}/tokens/${tokenAddress}`
    );
    const price = parseFloat(
      data?.data?.attributes?.price_usd || "0"
    );
    if (price > 0) {
      priceCache.set(cacheKey, { price, ts: Date.now() });
      return price;
    }
  } catch {}

  // Fallback: DeFiLlama coins API (no rate limit)
  try {
    const chainMap = { base: 'base', arbitrum: 'arbitrum', celo: 'celo', polygon: 'polygon', avalanche: 'avax' };
    const llamaChain = chainMap[chainSlug] || chainSlug;
    const res = await fetch(
      `https://coins.llama.fi/prices/current/${llamaChain}:${tokenAddress}`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    const price = data?.coins?.[`${llamaChain}:${tokenAddress}`]?.price || 0;
    priceCache.set(cacheKey, { price, ts: Date.now() });
    return price;
  } catch {
    return 0;
  }
}

async function getNativePrice(chainSlug) {
  const cacheKey = `${chainSlug}:native`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;

  const chain = getChain(chainSlug);

  // Try GeckoTerminal
  try {
    const data = await fetchFromGecko(`/simple/price?ids=${chain.gecko}&vs_currencies=usd`);
    const price = data?.[chain.gecko]?.usd || 0;
    if (price > 0) {
      priceCache.set(cacheKey, { price, ts: Date.now() });
      return price;
    }
  } catch {}

  // Fallback: DeFiLlama
  try {
    const coinMap = { base: 'ethereum', arbitrum: 'ethereum', celo: 'celo', polygon: 'polygon', avalanche: 'avalanche-2' };
    const coinId = coinMap[chainSlug] || 'ethereum';
    const res = await fetch(`https://coins.llama.fi/prices/current/coingecko:${coinId}`, { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    const price = Object.values(data?.coins || {})[0]?.price || 0;
    priceCache.set(cacheKey, { price, ts: Date.now() });
    return price;
  } catch {
    return 0;
  }
}

/**
 * Batch fetch prices from DeFiLlama (single API call for all tokens)
 * @param {string} chainSlug
 * @param {string[]} tokenAddresses
 * @returns {Object} address -> price map
 */
async function batchGetPrices(chainSlug, tokenAddresses) {
  if (tokenAddresses.length === 0) return {};
  const chainMap = { base: 'base', arbitrum: 'arbitrum', celo: 'celo', polygon: 'polygon', avalanche: 'avax' };
  const llamaChain = chainMap[chainSlug] || chainSlug;

  // Check cache first
  const result = {};
  const toFetch = [];
  for (const addr of tokenAddresses) {
    const cacheKey = `${chainSlug}:${addr}`.toLowerCase();
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      result[addr.toLowerCase()] = cached.price;
    } else {
      toFetch.push(addr);
    }
  }
  if (toFetch.length === 0) return result;

  // Batch fetch from DeFiLlama (up to 100 per call)
  const coins = toFetch.map(a => `${llamaChain}:${a}`).join(',');
  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${coins}`, {
      headers: { 'Accept': 'application/json' },
    });
    const data = await res.json();
    for (const [key, info] of Object.entries(data?.coins || {})) {
      const addr = key.split(':')[1]?.toLowerCase();
      const price = info?.price || 0;
      result[addr] = price;
      priceCache.set(`${chainSlug}:${addr}`.toLowerCase(), { price, ts: Date.now() });
    }
  } catch {}

  // Fill missing with 0
  for (const addr of toFetch) {
    if (!(addr.toLowerCase() in result)) result[addr.toLowerCase()] = 0;
  }
  return result;
}

/**
 * Analyze P&L for a wallet on a specific chain
 * @param {string} chainSlug - Chain identifier
 * @param {string} address - Wallet address
 * @param {object} opts - Options { limit, includeUnrealized }
 */
export async function analyzePnL(chainSlug, address, opts = {}) {
  const { limit = 100, includeUnrealized = true } = opts;
  address = address.toLowerCase();
  const chain = getChain(chainSlug);

  if (!chain.blockscout) {
    throw new Error(
      `P&L tracker requires Blockscout. Supported: Base, Arbitrum, Celo`
    );
  }

  // 1. Fetch all token transfers for this wallet
  const transfers = await getBlockscoutTokenTransfers(chainSlug, address, limit);

  // 2. Build position ledger per token
  const positions = {}; // tokenAddress -> { buys, sells, totalBought, totalSold, realizedPnL, ... }

  for (const t of transfers) {
    const tokenAddr = (t.token?.address_hash || t.token?.address)?.toLowerCase();
    if (!tokenAddr) continue;

    const decimals = parseInt(t.token?.decimals || "18");
    const rawAmount = BigInt(t.total?.value || t.value || "0");
    const amount = Number(rawAmount) / 10 ** decimals;
    if (amount === 0) continue;

    const timestamp = t.timestamp;
    const txHash = t.transaction_hash || t.tx_hash;

    // Get price at time of transfer (approximate: use current price as fallback)
    // For historical accuracy we'd need historical prices, but that's rate-limited
    const currentPrice = await getTokenPrice(chainSlug, tokenAddr);
    const priceAtTime = currentPrice; // Fallback: current price

    if (!positions[tokenAddr]) {
      positions[tokenAddr] = {
        symbol: t.token?.symbol || "UNKNOWN",
        name: t.token?.name || "Unknown Token",
        decimals,
        buys: [],
        sells: [],
        totalBoughtQty: 0,
        totalBoughtUSD: 0,
        totalSoldQty: 0,
        totalSoldUSD: 0,
        realizedPnL: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
        currentPrice: 0,
        unrealizedPnL: 0,
        trades: [],
      };
    }

    const pos = positions[tokenAddr];
    const isBuy = t.from?.hash?.toLowerCase() !== address;
    const usdValue = amount * priceAtTime;

    if (isBuy) {
      pos.buys.push({ amount, price: priceAtTime, usd: usdValue, timestamp, txHash });
      pos.totalBoughtQty += amount;
      pos.totalBoughtUSD += usdValue;
    } else {
      pos.sells.push({ amount, price: priceAtTime, usd: usdValue, timestamp, txHash });
      pos.totalSoldQty += amount;
      pos.totalSoldUSD += usdValue;
    }

    pos.trades.push({
      type: isBuy ? "buy" : "sell",
      amount,
      price: priceAtTime,
      usd: usdValue,
      timestamp,
      txHash,
    });
  }

  // 3. Batch fetch current prices for all tokens with remaining balances
  const tokenAddrs = Object.keys(positions).filter(addr => {
    const pos = positions[addr];
    return (pos.totalBoughtQty - pos.totalSoldQty) > 0;
  });
  const priceMap = includeUnrealized ? await batchGetPrices(chainSlug, tokenAddrs) : {};
  const nativePrice = includeUnrealized ? await getNativePrice(chainSlug) : 0;

  // 4. Calculate P&L per position
  const results = [];
  let totalRealizedPnL = 0;
  let totalUnrealizedPnL = 0;
  let totalTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let bestTrade = { token: "", pnl: -Infinity, pct: 0 };
  let worstTrade = { token: "", pnl: Infinity, pct: 0 };

  for (const [tokenAddr, pos] of Object.entries(positions)) {
    // Average cost basis
    pos.avgBuyPrice = pos.totalBoughtQty > 0
      ? pos.totalBoughtUSD / pos.totalBoughtQty
      : 0;

    pos.avgSellPrice = pos.totalSoldQty > 0
      ? pos.totalSoldUSD / pos.totalSoldQty
      : 0;

    // Realized P&L = totalSold - (avgBuyPrice * totalSoldQty)
    if (pos.totalSoldQty > 0 && pos.avgBuyPrice > 0) {
      pos.realizedPnL = pos.totalSoldUSD - (pos.avgBuyPrice * pos.totalSoldQty);
    }

    // Unrealized P&L = (currentPrice - avgBuyPrice) * remainingQty
    const remainingQty = pos.totalBoughtQty - pos.totalSoldQty;
    if (includeUnrealized && remainingQty > 0) {
      // Use native price for ETH/native tokens, batch price for ERC-20
      const isNative = pos.symbol === chain.nativeCurrency || pos.symbol === "ETH" || pos.symbol === "CELO" || pos.symbol === "POL" || pos.symbol === "AVAX";
      pos.currentPrice = isNative ? nativePrice : (priceMap[tokenAddr.toLowerCase()] || 0);
      pos.unrealizedPnL = (pos.currentPrice - pos.avgBuyPrice) * remainingQty;
      pos.remainingQty = remainingQty;
      pos.currentValue = remainingQty * pos.currentPrice;
      pos.costBasis = remainingQty * pos.avgBuyPrice;
    }

    // Track win/loss
    if (pos.totalSoldQty > 0) {
      totalTrades++;
      if (pos.realizedPnL > 0) winningTrades++;
      else losingTrades++;

      const pnlPct = pos.avgBuyPrice > 0
        ? ((pos.avgSellPrice - pos.avgBuyPrice) / pos.avgBuyPrice) * 100
        : 0;

      if (pos.realizedPnL > bestTrade.pnl) {
        bestTrade = { token: pos.symbol, pnl: pos.realizedPnL, pct: pnlPct };
      }
      if (pos.realizedPnL < worstTrade.pnl) {
        worstTrade = { token: pos.symbol, pnl: pos.realizedPnL, pct: pnlPct };
      }
    }

    totalRealizedPnL += pos.realizedPnL;
    totalUnrealizedPnL += pos.unrealizedPnL;

    results.push({
      token: pos.symbol,
      name: pos.name,
      address: tokenAddr,
      buyCount: pos.buys.length,
      sellCount: pos.sells.length,
      totalBoughtQty: round(pos.totalBoughtQty),
      totalBoughtUSD: round(pos.totalBoughtUSD),
      totalSoldQty: round(pos.totalSoldQty),
      totalSoldUSD: round(pos.totalSoldUSD),
      avgBuyPrice: round(pos.avgBuyPrice, 6),
      avgSellPrice: round(pos.avgSellPrice, 6),
      realizedPnL: round(pos.realizedPnL),
      unrealizedPnL: round(pos.unrealizedPnL),
      remainingQty: round(pos.remainingQty || 0),
      currentValue: round(pos.currentValue || 0),
      costBasis: round(pos.costBasis || 0),
      currentPrice: round(pos.currentPrice || 0, 8),
      roi: pos.costBasis > 0
        ? round(((pos.currentValue || 0) - pos.costBasis) / pos.costBasis * 100, 2)
        : 0,
      trades: pos.trades.length,
    });
  }

  // Sort by absolute P&L (biggest impact first)
  results.sort(
    (a, b) =>
      Math.abs(b.realizedPnL + b.unrealizedPnL) -
      Math.abs(a.realizedPnL + a.unrealizedPnL)
  );

  const winRate = totalTrades > 0
    ? round((winningTrades / totalTrades) * 100, 1)
    : 0;

  return {
    address,
    network: chainSlug,
    chainName: chain.name,
    timestamp: new Date().toISOString(),
    summary: {
      totalRealizedPnL: round(totalRealizedPnL),
      totalUnrealizedPnL: round(totalUnrealizedPnL),
      totalPnL: round(totalRealizedPnL + totalUnrealizedPnL),
      totalTokensTraded: results.length,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      bestTrade: bestTrade.pnl > -Infinity ? {
        token: bestTrade.token,
        pnl: round(bestTrade.pnl),
        roi: round(bestTrade.pct, 2),
      } : null,
      worstTrade: worstTrade.pnl < Infinity ? {
        token: worstTrade.token,
        pnl: round(worstTrade.pnl),
        roi: round(worstTrade.pct, 2),
      } : null,
    },
    positions: results,
  };
}

/**
 * Get P&L summary only (lighter, faster)
 */
export async function getPnLSummary(chainSlug, address, opts = {}) {
  const full = await analyzePnL(chainSlug, address, opts);
  return {
    address: full.address,
    network: full.network,
    chainName: full.chainName,
    timestamp: full.timestamp,
    ...full.summary,
  };
}

function round(n, decimals = 2) {
  if (typeof n !== "number" || isNaN(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
