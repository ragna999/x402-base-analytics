// smartMoney.js — Smart Money Tracker for Base
// Identifies profitable wallets, tracks their activity, finds what they're buying
// Uses native fetch + Base JSON-RPC (no ethers dependency)

const BASE_RPC = "https://mainnet.base.org";
const BLOCKSCOUT = "https://base.blockscout.com/api/v2";
const DEXSCREENER = "https://api.dexscreener.com";

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

// JSON-RPC call to Base
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

// Pad address to 32 bytes for eth_call
function padAddress(addr) {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

// Get ETH balance
async function getETHBalance(address) {
  try {
    const hex = await rpcCall("eth_getBalance", [address, "latest"]);
    return parseInt(hex, 16) / 1e18;
  } catch {
    return 0;
  }
}

// Get ERC-20 balance via balanceOf
async function getTokenBalance(tokenAddress, walletAddress) {
  try {
    const data = "0x70a08231" + padAddress(walletAddress);
    const result = await rpcCall("eth_call", [
      { to: tokenAddress, data },
      "latest",
    ]);
    if (!result || result === "0x") return 0n;
    return BigInt(result);
  } catch {
    return 0n;
  }
}

// Get recent token transfers for an address
async function getTokenTransfers(address, limit = 50) {
  try {
    const data = await fetchJSON(
      `${BLOCKSCOUT}/addresses/${address}/token-transfers`
    );
    return (data.items || []).slice(0, limit);
  } catch {
    return [];
  }
}

// Get recent transactions for an address
async function getTransactions(address, limit = 50) {
  try {
    const data = await fetchJSON(
      `${BLOCKSCOUT}/addresses/${address}/transactions`
    );
    return (data.items || []).slice(0, limit);
  } catch {
    return [];
  }
}

// Get token info from DEX Screener
async function getTokenPrice(tokenAddress) {
  try {
    const data = await fetchJSON(
      `${DEXSCREENER}/latest/dex/tokens/${tokenAddress}`
    );
    const pairs = data.pairs || [];
    const basePairs = pairs.filter((p) => p.chainId === "base");
    if (basePairs.length === 0) return null;
    const best = basePairs[0];
    return {
      name: best.baseToken?.name,
      symbol: best.baseToken?.symbol,
      priceUsd: parseFloat(best.priceUsd || 0),
      priceChange24h: best.priceChange?.h24 || 0,
      volume24h: best.volume?.h24 || 0,
      liquidity: best.liquidity?.usd || 0,
      pairAddress: best.pairAddress,
      dexId: best.dexId,
    };
  } catch {
    return null;
  }
}

// Search trending tokens on Base via DEX Screener
// token-profiles/latest/v1 rarely has Base tokens, so we use multiple strategies
async function getTrendingTokens() {
  try {
    // Strategy 1: Search for popular Base memecoins/tokens
    const searches = ["base", "aero", "degen", "brett", "toshi"];
    const allTokens = new Set();

    for (const q of searches) {
      try {
        const data = await fetchJSON(
          `${DEXSCREENER}/latest/dex/search?q=${q}`
        );
        const pairs = data.pairs || [];
        for (const p of pairs) {
          if (p.chainId === "base" && p.baseToken?.address) {
            allTokens.add(p.baseToken.address.toLowerCase());
          }
        }
      } catch {
        continue;
      }
      if (allTokens.size >= 20) break;
    }

    // Strategy 2: Also check token-profiles for any base entries
    try {
      const profiles = await fetchJSON(`${DEXSCREENER}/token-profiles/latest/v1`);
      const arr = Array.isArray(profiles) ? profiles : [];
      for (const p of arr) {
        if (p.chainId === "base" && p.tokenAddress) {
          allTokens.add(p.tokenAddress.toLowerCase());
        }
      }
    } catch {}

    return Array.from(allTokens).slice(0, 30);
  } catch {
    return [];
  }
}

// Get token holders from Blockscout
async function getTokenHolders(tokenAddress, limit = 100) {
  try {
    const data = await fetchJSON(
      `${BLOCKSCOUT}/tokens/${tokenAddress}/holders`
    );
    return (data.items || []).slice(0, limit);
  } catch {
    return [];
  }
}

// Get address info from Blockscout
async function getAddressInfo(address) {
  try {
    return await fetchJSON(`${BLOCKSCOUT}/addresses/${address}`);
  } catch {
    return null;
  }
}

// Get token transfers for a specific token contract
async function getTokenContractTransfers(tokenAddress, limit = 200) {
  try {
    const data = await fetchJSON(
      `${BLOCKSCOUT}/tokens/${tokenAddress}/transfers`
    );
    return (data.items || []).slice(0, limit);
  } catch {
    return [];
  }
}

// --- Core Smart Money Analysis ---

/**
 * Analyze a wallet to determine if it's "smart money"
 * Factors: tx count, token diversity, ETH balance, age, activity patterns
 */
export async function analyzeSmartMoneyWallet(address) {
  address = address.toLowerCase();

  const [addrInfo, txs, transfers, ethBalance] = await Promise.all([
    getAddressInfo(address),
    getTransactions(address, 100),
    getTokenTransfers(address, 100),
    getETHBalance(address),
  ]);

  const txCount = addrInfo?.transactions_count || txs.length;
  const uniqueTokens = new Set(
    transfers.map((t) => t.token?.address_hash?.toLowerCase()).filter(Boolean)
  );
  const tokenCount = uniqueTokens.size;

  // Activity analysis
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const recentTxs = txs.filter(
    (t) => new Date(t.timestamp).getTime() > weekAgo
  );
  const monthlyTxs = txs.filter(
    (t) => new Date(t.timestamp).getTime() > monthAgo
  );

  // Buy vs sell analysis
  let buys = 0;
  let sells = 0;
  const tokenActivity = {};

  for (const t of transfers) {
    const tokenAddr = t.token?.address_hash?.toLowerCase();
    if (!tokenAddr) continue;

    if (!tokenActivity[tokenAddr]) {
      tokenActivity[tokenAddr] = {
        symbol: t.token?.symbol || "UNKNOWN",
        buys: 0,
        sells: 0,
        lastActivity: t.timestamp,
      };
    }

    if (t.to?.hash?.toLowerCase() === address) {
      buys++;
      tokenActivity[tokenAddr].buys++;
    } else if (t.from?.hash?.toLowerCase() === address) {
      sells++;
      tokenActivity[tokenAddr].sells++;
    }
  }

  // Smart money score (0-100)
  let score = 0;
  const reasons = [];

  if (ethBalance > 10) {
    score += 20;
    reasons.push("High ETH balance (whale)");
  } else if (ethBalance > 1) {
    score += 10;
    reasons.push("Moderate ETH balance");
  }

  if (tokenCount > 20) {
    score += 20;
    reasons.push("High token diversity (experienced)");
  } else if (tokenCount > 10) {
    score += 10;
    reasons.push("Moderate token diversity");
  }

  if (txCount > 500) {
    score += 15;
    reasons.push("High transaction volume");
  } else if (txCount > 100) {
    score += 10;
    reasons.push("Moderate transaction volume");
  }

  if (recentTxs.length > 10) {
    score += 15;
    reasons.push("Very active (10+ txs this week)");
  } else if (recentTxs.length > 3) {
    score += 10;
    reasons.push("Active this week");
  }

  const buyRatio = buys / Math.max(buys + sells, 1);
  if (buyRatio > 0.6 && buys + sells > 10) {
    score += 15;
    reasons.push("Net buyer (accumulating)");
  }

  const activeTokens = Object.values(tokenActivity).filter(
    (t) => t.buys + t.sells > 1
  );
  if (activeTokens.length > 5) {
    score += 15;
    reasons.push("Multi-token active trader");
  }

  let classification;
  if (score >= 70) classification = "SMART MONEY";
  else if (score >= 50) classification = "ACTIVE TRADER";
  else if (score >= 30) classification = "CASUAL TRADER";
  else classification = "INACTIVE/NEW";

  return {
    address,
    smartMoneyScore: score,
    classification,
    reasons,
    metrics: {
      ethBalance: ethBalance.toFixed(4),
      txCount,
      tokenCount,
      recentTxs7d: recentTxs.length,
      monthlyTxs: monthlyTxs.length,
      buys,
      sells,
      buyRatio: (buyRatio * 100).toFixed(1) + "%",
    },
    topTokens: Object.entries(tokenActivity)
      .sort((a, b) => b[1].buys + b[1].sells - (a[1].buys + a[1].sells))
      .slice(0, 10)
      .map(([addr, info]) => ({
        address: addr,
        symbol: info.symbol,
        buys: info.buys,
        sells: info.sells,
        lastActivity: info.lastActivity,
      })),
    walletAge: addrInfo?.creation_tx_timestamp || null,
  };
}

/**
 * Analyze a token to find smart money buyers
 */
export async function analyzeTokenSmartMoney(tokenAddress, opts = {}) {
  const maxBuyers = opts.maxBuyers || 30;
  tokenAddress = tokenAddress.toLowerCase();

  const [tokenInfo, holders, transfers] = await Promise.all([
    getTokenPrice(tokenAddress),
    getTokenHolders(tokenAddress, 100),
    getTokenContractTransfers(tokenAddress, 200),
  ]);

  // Find unique buyers
  const buyerMap = new Map();
  for (const t of transfers) {
    const buyer = t.to?.hash?.toLowerCase();
    if (!buyer || buyer === "0x0000000000000000000000000000000000000000") continue;
    if (!buyerMap.has(buyer)) {
      buyerMap.set(buyer, {
        address: buyer,
        firstSeen: t.timestamp,
        transferCount: 0,
      });
    }
    const entry = buyerMap.get(buyer);
    entry.transferCount++;
    if (t.timestamp < entry.firstSeen) entry.firstSeen = t.timestamp;
  }

  // Score top buyers
  const buyers = Array.from(buyerMap.values())
    .sort((a, b) => b.transferCount - a.transferCount)
    .slice(0, maxBuyers);

  const analyzed = [];
  for (const buyer of buyers) {
    try {
      const [ethBal, addrInfo, tokenBal] = await Promise.all([
        getETHBalance(buyer.address),
        getAddressInfo(buyer.address),
        getTokenBalance(tokenAddress, buyer.address),
      ]);

      const txCount = addrInfo?.transactions_count || 0;

      let quickScore = 0;
      if (ethBal > 5) quickScore += 25;
      else if (ethBal > 1) quickScore += 15;
      if (txCount > 200) quickScore += 20;
      else if (txCount > 50) quickScore += 10;
      if (buyer.transferCount > 3) quickScore += 15;

      const stillHolding = tokenBal > 0n;

      analyzed.push({
        address: buyer.address,
        smartMoneyScore: quickScore,
        ethBalance: ethBal.toFixed(4),
        txCount,
        buyCount: buyer.transferCount,
        firstSeen: buyer.firstSeen,
        stillHolding,
        classification:
          quickScore >= 40
            ? "SMART MONEY"
            : quickScore >= 25
            ? "ACTIVE TRADER"
            : "RETAIL",
      });
    } catch {
      // Skip failed wallets
    }
  }

  analyzed.sort((a, b) => b.smartMoneyScore - a.smartMoneyScore);

  const smartMoneyCount = analyzed.filter(
    (a) => a.classification === "SMART MONEY"
  ).length;
  const stillHoldingCount = analyzed.filter((a) => a.stillHolding).length;

  return {
    token: {
      address: tokenAddress,
      ...(tokenInfo || {}),
    },
    summary: {
      totalBuyersAnalyzed: analyzed.length,
      smartMoneyBuyers: smartMoneyCount,
      stillHolding: stillHoldingCount,
      smartMoneySignal:
        smartMoneyCount >= 3
          ? "STRONG"
          : smartMoneyCount >= 1
          ? "MODERATE"
          : "WEAK",
    },
    topSmartMoney: analyzed.slice(0, 15),
    holdersCount: holders.length,
  };
}

/**
 * Get what smart money wallets are actively buying on Base
 * Scans trending tokens → finds early buyers → checks their other recent activity
 */
export async function getSmartMoneyActivity() {
  const trendingAddresses = await getTrendingTokens();
  if (trendingAddresses.length === 0) {
    return { error: "Could not fetch trending tokens", activities: [] };
  }

  // For each trending token, find early buyers
  const smartWallets = new Map();

  for (const tokenAddr of trendingAddresses.slice(0, 10)) {
    try {
      const transfers = await getTokenContractTransfers(tokenAddr, 50);

      const seen = new Set();
      for (const t of transfers) {
        const buyer = t.to?.hash?.toLowerCase();
        if (!buyer || buyer === "0x0000000000000000000000000000000000000000")
          continue;
        if (seen.has(buyer)) continue;
        seen.add(buyer);

        if (!smartWallets.has(buyer)) {
          smartWallets.set(buyer, {
            address: buyer,
            tokensBought: [],
            firstSeen: t.timestamp,
          });
        }
        const entry = smartWallets.get(buyer);
        entry.tokensBought.push({
          token: tokenAddr,
          timestamp: t.timestamp,
        });
      }
    } catch {
      continue;
    }
  }

  // Filter wallets that bought multiple trending tokens
  const multiTokenBuyers = Array.from(smartWallets.values())
    .filter((w) => w.tokensBought.length >= 2)
    .sort((a, b) => b.tokensBought.length - a.tokensBought.length)
    .slice(0, 20);

  if (multiTokenBuyers.length === 0) {
    const singleBuyers = Array.from(smartWallets.values())
      .slice(0, 10)
      .map((w) => ({
        address: w.address,
        tokensBought: w.tokensBought.length,
        recentToken: w.tokensBought[0]?.token,
      }));

    return {
      trendingTokensScanned: trendingAddresses.length,
      smartMoneyWallets: 0,
      note: "No multi-token buyers found. Returning early buyers from trending tokens.",
      activities: singleBuyers,
    };
  }

  // For multi-token buyers, get their recent activity
  const results = [];
  for (const wallet of multiTokenBuyers.slice(0, 10)) {
    try {
      const [ethBal, transfers] = await Promise.all([
        getETHBalance(wallet.address),
        getTokenTransfers(wallet.address, 30),
      ]);

      const recentBuys = [];
      const seenTokens = new Set();
      for (const t of transfers) {
        const tokenAddr = t.token?.address_hash?.toLowerCase();
        if (!tokenAddr || seenTokens.has(tokenAddr)) continue;
        if (t.to?.hash?.toLowerCase() === wallet.address) {
          seenTokens.add(tokenAddr);
          recentBuys.push({
            token: tokenAddr,
            symbol: t.token?.symbol || "UNKNOWN",
            timestamp: t.timestamp,
          });
        }
      }

      results.push({
        address: wallet.address,
        ethBalance: ethBal.toFixed(4),
        trendingTokensBought: wallet.tokensBought.length,
        recentBuys: recentBuys.slice(0, 5),
        classification:
          wallet.tokensBought.length >= 3 ? "SMART MONEY" : "ACTIVE TRADER",
      });
    } catch {
      continue;
    }
  }

  return {
    trendingTokensScanned: trendingAddresses.length,
    smartMoneyWallets: results.length,
    note:
      "Wallets that bought 2+ trending tokens early. Their recent buys may signal upcoming pumps.",
    activities: results,
  };
}
