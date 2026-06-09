/**
 * Whale Alerts — Real-time whale activity tracker for Base
 * 
 * Tracks large transfers, whale buys/sells, LP changes,
 * accumulation/distribution patterns
 * 
 * Data sources:
 * - Blockscout: token transfers, transactions, token holders
 * - GeckoTerminal: trending pools, price data
 * - Base RPC: on-chain reads
 */

const BLOCKSCOUT = "https://base.blockscout.com/api/v2";
const GECKOTERMINAL = "https://api.geckoterminal.com/api/v2";
const BASE_RPC = "https://mainnet.base.org";

// Thresholds
const WHALE_THRESHOLD_USD = 10000;  // $10K+ = whale move
const LARGE_THRESHOLD_USD = 50000;  // $50K+ = large move
const MEGA_THRESHOLD_USD = 100000;  // $100K+ = mega move

// Known DEX routers on Base
const DEX_ROUTERS = new Set([
  "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Uniswap V2
  "0x2626664c2603336e57b271c5c0b26f421741e481", // Uniswap Universal Router
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43", // Aerodrome Router
  "0x827922686190790b37229fd06084350e74485b72", // Aerodrome Router v2
  "0x6bded42c6da8fbf0d2ba55b2fa120c5e0c8d7891", // SushiSwap
  "0x2c596389d56c165d62f5f2662e044074472291c6", // PancakeSwap
]);

// Known stablecoins on Base
const STABLECOINS = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": { symbol: "USDbC", decimals: 6 },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
};

// Known labeled addresses
const KNOWN_LABELS = {
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb": "Binance",
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance 36",
  "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d": "Binance 8",
  "0x56Eddb7aa87536c09CCc2793473599fD21A8b17F": "Coinbase",
  "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3": "Coinbase 2",
  "0xA7efAe728D2936e78BDA97dc267687568dD593f3": "Coinbase Prime",
  "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE": "Binance Hot Wallet",
  "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8": "Binance Cold",
};

// --- Helpers ---

async function fetchJSON(url, timeout = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCall(method, params) {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function shortAddr(addr) {
  if (!addr) return "?";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function getLabel(addr) {
  if (!addr) return null;
  const lower = addr.toLowerCase();
  for (const [known, label] of Object.entries(KNOWN_LABELS)) {
    if (known.toLowerCase() === lower) return label;
  }
  return null;
}

function isStablecoin(addr) {
  return !!STABLECOINS[addr?.toLowerCase()];
}

function getStablecoinInfo(addr) {
  return STABLECOINS[addr?.toLowerCase()] || null;
}

// Estimate USD value from token amount and decimals
// For stablecoins: 1:1 USD. For others: needs price lookup.
function estimateUSD(amount, decimals, tokenAddr) {
  const humanAmount = Number(amount) / Math.pow(10, decimals);
  const stableInfo = getStablecoinInfo(tokenAddr);
  if (stableInfo) return humanAmount; // 1:1 for stablecoins
  return null; // need price lookup for others
}

// --- Core Functions ---

/**
 * Get recent large token transfers across Base
 * Scans Blockscout's token transfer feed for whale moves
 */
async function getWhaleAlerts({ minAmount = WHALE_THRESHOLD_USD, limit = 50 } = {}) {
  // Get recent token transfers from Blockscout
  // We scan multiple popular token holders to find large moves
  const alerts = [];

  // Strategy 1: Check trending pools on GeckoTerminal for recent large swaps
  let trendingPools = [];
  try {
    const data = await fetchJSON(
      `${GECKOTERMINAL}/networks/base/trending_pools?page=1`
    );
    trendingPools = (data.data || []).slice(0, 15);
  } catch {}

  // Strategy 2: Check recent token transfers for known whale addresses
  const whaleWallets = Object.keys(KNOWN_LABELS);
  
  for (const wallet of whaleWallets.slice(0, 5)) {
    try {
      const txData = await fetchJSON(
        `${BLOCKSCOUT}/addresses/${wallet}/token-transfers?page=1&limit=10`
      );
      const transfers = txData.items || [];
      
      for (const tx of transfers) {
        const token = tx.token || {};
        const tokenAddr = token.address?.toLowerCase();
        const decimals = parseInt(token.decimals || "18");
        const value = BigInt(tx.total?.value || "0");
        const humanValue = Number(value) / Math.pow(10, decimals);
        
        // Only stablecoins for now (easy USD calc)
        if (isStablecoin(tokenAddr) && humanValue >= minAmount) {
          alerts.push({
            type: humanValue >= MEGA_THRESHOLD_USD ? "MEGA" : 
                  humanValue >= LARGE_THRESHOLD_USD ? "LARGE" : "WHALE",
            token: token.symbol || "?",
            tokenAddress: token.address,
            amount: humanValue,
            amountFormatted: `$${humanValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            from: tx.from?.hash || "?",
            fromLabel: getLabel(tx.from?.hash) || shortAddr(tx.from?.hash),
            to: tx.to?.hash || "?",
            toLabel: getLabel(tx.to?.hash) || shortAddr(tx.to?.hash),
            txHash: tx.tx_hash,
            timestamp: tx.timestamp,
            direction: getLabel(tx.from?.hash) ? "OUTFLOW" : 
                       getLabel(tx.to?.hash) ? "INFLOW" : "TRANSFER",
          });
        }
      }
    } catch {
      continue;
    }
  }

  // Strategy 3: Scan trending token pools for recent large transactions
  for (const pool of trendingPools.slice(0, 10)) {
    try {
      const poolAddr = pool.id?.replace("base_", "");
      if (!poolAddr) continue;

      // Get pool's recent transactions via GeckoTerminal
      const poolData = await fetchJSON(
        `${GECKOTERMINAL}/networks/base/pools/${poolAddr}`
      );
      const attrs = poolData.data?.attributes;
      if (!attrs) continue;

      const vol24h = parseFloat(attrs.volume_usd?.h24 || "0");
      const txns24h = attrs.transactions?.h24 || {};
      const buys = txns24h.buys || 0;
      const sells = txns24h.sells || 0;

      // If volume is high and concentrated in few txns, flag it
      if (vol24h >= 100000 && (buys + sells) > 0) {
        const avgTxSize = vol24h / (buys + sells);
        if (avgTxSize >= 5000) {
          alerts.push({
            type: "POOL_ACTIVITY",
            pool: attrs.name,
            poolAddress: poolAddr,
            volume24h: vol24h,
            volumeFormatted: `$${vol24h.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            buys24h: buys,
            sells24h: sells,
            buyRatio: buys / (buys + sells),
            avgTxSize: Math.round(avgTxSize),
            signal: buys > sells * 2 ? "ACCUMULATING" : 
                    sells > buys * 2 ? "DISTRIBUTING" : "NEUTRAL",
            priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || "0"),
          });
        }
      }
    } catch {
      continue;
    }
  }

  // Sort by timestamp (newest first) or amount
  alerts.sort((a, b) => {
    if (a.timestamp && b.timestamp) return new Date(b.timestamp) - new Date(a.timestamp);
    return (b.amount || b.volume24h || 0) - (a.amount || a.volume24h || 0);
  });

  return {
    timestamp: new Date().toISOString(),
    count: Math.min(alerts.length, limit),
    minAmountUSD: minAmount,
    alerts: alerts.slice(0, limit),
  };
}

/**
 * Get whale activity for a specific token
 * Scans holders + recent transfers for that token
 */
async function getTokenWhaleActivity(tokenAddress, { limit = 30 } = {}) {
  tokenAddress = tokenAddress.toLowerCase();
  const activity = [];

  // Get token info from GeckoTerminal
  let tokenInfo = null;
  try {
    const data = await fetchJSON(
      `${GECKOTERMINAL}/networks/base/tokens/${tokenAddress}`
    );
    const attrs = data.data?.attributes;
    if (attrs) {
      tokenInfo = {
        name: attrs.name,
        symbol: attrs.symbol,
        priceUsd: parseFloat(attrs.price_usd || "0"),
        marketCap: parseFloat(attrs.market_cap_usd || "0"),
        volume24h: parseFloat(attrs.volume_usd?.h24 || "0"),
        priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || "0"),
      };
    }
  } catch {}

  // Get token holders from Blockscout
  let holders = [];
  try {
    const data = await fetchJSON(
      `${BLOCKSCOUT}/tokens/${tokenAddress}/holders`
    );
    holders = (data.items || []).slice(0, 50);
  } catch {}

  // Analyze holder concentration
  let totalSupply = 0n;
  const holderData = [];
  
  for (const h of holders) {
    const value = BigInt(h.value || "0");
    totalSupply += value;
    holderData.push({
      address: h.address?.hash || "?",
      label: getLabel(h.address?.hash),
      balance: value,
    });
  }

  // Calculate percentages
  const topHolders = holderData
    .map(h => ({
      ...h,
      percentage: totalSupply > 0n ? (Number(h.balance * 10000n / totalSupply) / 100) : 0,
      balanceHuman: Number(h.balance) / 1e18, // assuming 18 decimals
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 20);

  // Whale detection
  const whales = topHolders.filter(h => h.percentage >= 1);
  const megaWhales = topHolders.filter(h => h.percentage >= 5);
  const topHolderPct = topHolders.slice(0, 5).reduce((sum, h) => sum + h.percentage, 0);
  const top10Pct = topHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);

  // Risk flags
  const flags = [];
  if (megaWhales.length > 0) {
    flags.push(`⚠️ ${megaWhales.length} wallet(s) hold >5% supply — dump risk`);
  }
  if (topHolderPct > 50) {
    flags.push(`⚠️ Top 5 holders own ${topHolderPct.toFixed(1)}% — whale-dominated`);
  } else if (topHolderPct < 20) {
    flags.push(`✅ Top 5 holders own only ${topHolderPct.toFixed(1)}% — well distributed`);
  }
  if (whales.length === 0) {
    flags.push(`✅ No single wallet >1% supply — low rug risk`);
  }

  // Risk score (0=safe, 100=dangerous)
  let riskScore = 0;
  if (topHolderPct > 80) riskScore += 40;
  else if (topHolderPct > 50) riskScore += 25;
  else if (topHolderPct > 30) riskScore += 10;
  if (megaWhales.length >= 3) riskScore += 30;
  else if (megaWhales.length >= 1) riskScore += 15;
  if (whales.length > 10) riskScore += 10;
  riskScore = Math.min(100, riskScore);

  const verdict = riskScore >= 60 ? "HIGH RISK — whale concentration" :
                  riskScore >= 30 ? "MODERATE RISK — some whale presence" :
                  "LOW RISK — well distributed";

  return {
    token: tokenInfo?.symbol || "?",
    tokenAddress,
    tokenInfo,
    totalHolders: holders.length,
    concentration: {
      top5Pct: topHolderPct,
      top10Pct: top10Pct,
      whalesCount: whales.length,
      megaWhalesCount: megaWhales.length,
    },
    topHolders: topHolders.slice(0, 10).map(h => ({
      address: shortAddr(h.address),
      addressFull: h.address,
      label: h.label || "Unknown",
      percentage: h.percentage,
      risk: h.percentage >= 10 ? "CRITICAL" : 
            h.percentage >= 5 ? "HIGH" : 
            h.percentage >= 1 ? "MEDIUM" : "LOW",
    })),
    flags,
    riskScore,
    verdict,
  };
}

/**
 * Whale movements — what are known whales doing across all tokens
 * Combines smart money wallet tracking with recent activity
 */
async function getWhaleMovements({ limit = 20 } = {}) {
  const movements = [];

  // Get trending tokens first
  let trendingTokens = [];
  try {
    const data = await fetchJSON(
      `${GECKOTERMINAL}/networks/base/trending_pools?page=1`
    );
    trendingTokens = (data.data || []).slice(0, 20);
  } catch {}

  // For each trending token, check if whales are involved
  for (const pool of trendingTokens.slice(0, 10)) {
    try {
      const attrs = pool.attributes;
      const vol24h = parseFloat(attrs.volume_usd?.h24 || "0");
      const txns = attrs.transactions?.h24 || {};
      const buys = txns.buys || 0;
      const sells = txns.sells || 0;

      if (vol24h < 50000) continue; // skip low volume

      const avgTxSize = vol24h / ((buys + sells) || 1);
      
      movements.push({
        pool: attrs.name,
        poolAddress: pool.id?.replace("base_", ""),
        volume24h: vol24h,
        buys24h: buys,
        sells24h: sells,
        avgTxSize: Math.round(avgTxSize),
        netFlow: buys > sells ? "INFLOW" : sells > buys ? "OUTFLOW" : "NEUTRAL",
        signal: avgTxSize > 10000 ? "WHALE_HEAVY" :
                avgTxSize > 5000 ? "WHALE_MODERATE" : "RETAIL",
        priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || "0"),
      });
    } catch {
      continue;
    }
  }

  // Sort by volume
  movements.sort((a, b) => b.volume24h - a.volume24h);

  return {
    timestamp: new Date().toISOString(),
    count: Math.min(movements.length, limit),
    movements: movements.slice(0, limit),
  };
}

/**
 * Whale heatmap — which tokens have most whale activity
 * Aggregates volume + buy/sell ratio to find accumulation zones
 */
async function getWhaleHeatmap({ limit = 20 } = {}) {
  const heatmap = [];

  try {
    const data = await fetchJSON(
      `${GECKOTERMINAL}/networks/base/trending_pools?page=1`
    );
    const pools = data.data || [];

    for (const pool of pools) {
      try {
        const attrs = pool.attributes;
        const vol24h = parseFloat(attrs.volume_usd?.h24 || "0");
        const txns = attrs.transactions?.h24 || {};
        const buys = txns.buys || 0;
        const sells = txns.sells || 0;
        const priceChange = parseFloat(attrs.price_change_percentage?.h24 || "0");

        if (vol24h < 10000) continue;

        const buyRatio = buys / ((buys + sells) || 1);
        const avgTxSize = vol24h / ((buys + sells) || 1);

        // Whale score: high volume + high avg tx size + buying pressure
        const whaleScore = Math.min(100, Math.round(
          (Math.min(vol24h / 100000, 1) * 30) +     // volume component (max 30)
          (Math.min(avgTxSize / 20000, 1) * 35) +    // avg tx size (max 35)
          (buyRatio * 35)                              // buying pressure (max 35)
        ));

        heatmap.push({
          pool: attrs.name,
          poolAddress: pool.id?.replace("base_", ""),
          volume24h: vol24h,
          volumeFormatted: `$${(vol24h / 1000).toFixed(1)}K`,
          buys24h: buys,
          sells24h: sells,
          buyRatio: Math.round(buyRatio * 100),
          avgTxSize: Math.round(avgTxSize),
          priceChange24h: priceChange,
          whaleScore,
          signal: whaleScore >= 70 ? "🐋 STRONG ACCUMULATION" :
                  whaleScore >= 50 ? "📊 MODERATE WHALE ACTIVITY" :
                  buyRatio >= 0.65 ? "🟢 BUYING PRESSURE" :
                  buyRatio <= 0.35 ? "🔴 SELLING PRESSURE" : "⚖️ NEUTRAL",
        });
      } catch {
        continue;
      }
    }
  } catch {}

  // Sort by whale score
  heatmap.sort((a, b) => b.whaleScore - a.whaleScore);

  return {
    timestamp: new Date().toISOString(),
    count: Math.min(heatmap.length, limit),
    heatmap: heatmap.slice(0, limit),
  };
}

/**
 * Accumulation detector — find tokens being accumulated by large buyers
 */
async function getAccumulationSignals({ limit = 10 } = {}) {
  const signals = [];

  try {
    const data = await fetchJSON(
      `${GECKOTERMINAL}/networks/base/trending_pools?page=1`
    );
    const pools = data.data || [];

    for (const pool of pools) {
      try {
        const attrs = pool.attributes;
        const vol24h = parseFloat(attrs.volume_usd?.h24 || "0");
        const txns = attrs.transactions?.h24 || {};
        const buys = txns.buys || 0;
        const sells = txns.sells || 0;
        const priceChange = parseFloat(attrs.price_change_percentage?.h24 || "0");

        // Accumulation pattern: high volume + more buys than sells + price stable or rising
        const buyRatio = buys / ((buys + sells) || 1);
        const avgTxSize = vol24h / ((buys + sells) || 1);

        if (vol24h >= 100000 && buyRatio >= 0.6 && avgTxSize >= 5000 && priceChange >= -5) {
          signals.push({
            pool: attrs.name,
            poolAddress: pool.id?.replace("base_", ""),
            volume24h: vol24h,
            buyRatio: Math.round(buyRatio * 100),
            avgTxSize: Math.round(avgTxSize),
            priceChange24h: priceChange,
            confidence: buyRatio >= 0.75 ? "HIGH" : buyRatio >= 0.65 ? "MEDIUM" : "LOW",
            reason: `${buys} buys vs ${sells} sells (${Math.round(buyRatio * 100)}% buy ratio), avg tx $${avgTxSize.toFixed(0)}`,
          });
        }
      } catch {
        continue;
      }
    }
  } catch {}

  signals.sort((a, b) => b.buyRatio - a.buyRatio);

  return {
    timestamp: new Date().toISOString(),
    count: Math.min(signals.length, limit),
    note: "Tokens showing accumulation patterns — high volume, buying pressure, large avg tx size",
    signals: signals.slice(0, limit),
  };
}

export {
  getWhaleAlerts,
  getTokenWhaleActivity,
  getWhaleMovements,
  getWhaleHeatmap,
  getAccumulationSignals,
};
