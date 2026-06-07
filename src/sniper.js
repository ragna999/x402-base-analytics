/**
 * Sniper Tracker — Find early buyers (snipers) for tokens on Base
 * 
 * Data sources:
 * - DEX Screener: token pairs, price data, trending
 * - Blockscout: transaction history, token transfers
 * - Base RPC: on-chain reads
 */

const DEXSCREENER_API = "https://api.dexscreener.com";
const BLOCKSCOUT_API = "https://base.blockscout.com/api/v2";

// Common DEX router addresses on Base (for identifying swaps)
const DEX_ROUTERS = new Set([
  "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Uniswap V2 Router
  "0x2626664c2603336E57B271c5C0b26F421741e481", // Uniswap Universal Router
  "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", // Aerodrome Router
  "0x827922686190790b37229fd06084350E74485b72", // Aerodrome Router v2
]);

// Stablecoin addresses (used as quote tokens)
const STABLECOINS = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
]);

// WETH address
const WETH = "0x4200000000000000000000000000000000000006".toLowerCase();

/**
 * Fetch with timeout and retry
 */
async function fetchJSON(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/**
 * Get token pair info from DEX Screener
 */
async function getTokenPairs(tokenAddress) {
  const data = await fetchJSON(`${DEXSCREENER_API}/latest/dex/tokens/${tokenAddress}`);
  if (!data.pairs || data.pairs.length === 0) return null;
  
  // Filter for Base chain pairs only, sort by liquidity
  const basePairs = data.pairs
    .filter(p => p.chainId === "base")
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  
  return basePairs.length > 0 ? basePairs[0] : null;
}

/**
 * Get trending tokens on Base from DEX Screener
 * Uses the search endpoint for popular Base tokens
 */
async function getTrendingTokens() {
  try {
    // Try token-profiles first
    const data = await fetchJSON(`${DEXSCREENER_API}/token-profiles/latest/v1`);
    if (Array.isArray(data)) {
      const baseTokens = data.filter(t => t.chainId === "base").slice(0, 20);
      if (baseTokens.length > 0) return baseTokens;
    }
  } catch (err) {
    // Fallback to search
  }
  
  // Fallback: search for popular Base tokens
  try {
    const searchTerms = ["base", "aerodrome", "degen", "brett"];
    const allTokens = [];
    
    for (const term of searchTerms) {
      const data = await fetchJSON(`${DEXSCREENER_API}/latest/dex/search?q=${term}`);
      if (data.pairs) {
        const basePairs = data.pairs
          .filter(p => p.chainId === "base" && p.liquidity?.usd > 10000)
          .slice(0, 5);
        allTokens.push(...basePairs.map(p => ({
          tokenAddress: p.baseToken?.address,
          description: `${p.baseToken?.symbol} - ${p.dexId}`,
        })));
      }
      await new Promise(r => setTimeout(r, 300));
    }
    
    // Deduplicate
    const seen = new Set();
    return allTokens.filter(t => {
      if (seen.has(t.tokenAddress)) return false;
      seen.add(t.tokenAddress);
      return true;
    }).slice(0, 10);
  } catch (err) {
    return [];
  }
}

/**
 * Get recent transactions for an address from Blockscout
 */
async function getTransactions(address, limit = 50) {
  const data = await fetchJSON(
    `${BLOCKSCOUT_API}/addresses/${address}/transactions`
  );
  return (data.items || []).slice(0, limit);
}

/**
 * Get token transfers for an address from Blockscout
 */
async function getTokenTransfers(address, limit = 100) {
  const data = await fetchJSON(
    `${BLOCKSCOUT_API}/addresses/${address}/token-transfers`
  );
  return (data.items || []).slice(0, limit);
}

/**
 * Analyze early buyers of a token
 * 
 * Flow:
 * 1. Get token pair info (price, liquidity)
 * 2. Get early transactions for the pair contract
 * 3. Identify buyers (addresses that received tokens early)
 * 4. Calculate current ROI for each buyer
 */
export async function getTokenSnipers(tokenAddress, options = {}) {
  const { maxBuyers = 30, minAge = 0 } = options;
  
  // Step 1: Get pair info
  const pairInfo = await getTokenPairs(tokenAddress);
  if (!pairInfo) {
    return { error: "No trading pairs found for this token on Base", tokenAddress };
  }

  const pairAddress = pairInfo.pairAddress;
  const currentPrice = parseFloat(pairInfo.priceUsd || 0);
  const priceChange = pairInfo.priceChange || {};
  const volume = pairInfo.volume || {};
  const liquidity = pairInfo.liquidity || {};

  // Step 2: Get early token transfers from the pair
  let transfers;
  try {
    transfers = await getTokenTransfers(pairAddress, 100);
  } catch (err) {
    // Fallback: try getting transfers from token contract
    try {
      transfers = await getTokenTransfers(tokenAddress, 100);
    } catch (err2) {
      return { 
        error: "Could not fetch transaction data",
        tokenAddress,
        pairAddress,
        suggestion: "Token may be too new or Blockscout data unavailable"
      };
    }
  }

  // Step 3: Identify early buyers
  // A buyer is someone who received tokens in early transactions
  const buyers = new Map(); // address -> { firstBuy, totalTokens, txCount }
  const tokenDecimals = pairInfo.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase() 
    ? 18 : 6; // default decimals
  
  for (const transfer of transfers.slice(0, 100)) {
    if (!transfer.to || !transfer.total) continue;
    
    const buyerAddr = transfer.to.hash?.toLowerCase();
    if (!buyerAddr) continue;
    
    // Skip DEX routers and pair contracts
    if (DEX_ROUTERS.has(buyerAddr)) continue;
    if (buyerAddr === pairAddress?.toLowerCase()) continue;
    if (buyerAddr === tokenAddress.toLowerCase()) continue;
    
    const amount = parseFloat(transfer.total || 0);
    if (amount <= 0) continue;
    
    if (!buyers.has(buyerAddr)) {
      buyers.set(buyerAddr, {
        address: buyerAddr,
        firstBuyBlock: transfer.block_number,
        firstBuyTime: transfer.timestamp,
        totalTokens: 0,
        txCount: 0,
      });
    }
    
    const buyer = buyers.get(buyerAddr);
    buyer.totalTokens += amount;
    buyer.txCount += 1;
  }

  // Step 3: Calculate ROI and build sniper list
  // Since we don't have exact buy prices from Blockscout transfers alone,
  // we estimate based on position in the transaction list (earlier = lower price)
  const buyerList = Array.from(buyers.values())
    .slice(0, maxBuyers)
    .map((buyer, index) => {
      // Estimate: early buyers got in at lower prices
      // This is a rough heuristic - real implementation would trace swap calldata
      const entryMultiplier = 1 + (index * 0.1); // later buyers paid more
      const estimatedEntryPrice = currentPrice / entryMultiplier;
      const roi = currentPrice > 0 && estimatedEntryPrice > 0 
        ? ((currentPrice - estimatedEntryPrice) / estimatedEntryPrice * 100)
        : 0;

      return {
        address: buyer.address,
        firstBuyTime: buyer.firstBuyTime,
        firstBuyBlock: buyer.firstBuyBlock,
        tokenAmount: buyer.totalTokens || 0,
        txCount: buyer.txCount,
        estimatedROI: Math.round(roi * 100) / 100,
        position: index + 1, // 1 = earliest buyer
      };
    })
    .sort((a, b) => b.estimatedROI - a.estimatedROI);

  return {
    token: {
      address: tokenAddress,
      symbol: pairInfo.baseToken?.symbol || "UNKNOWN",
      name: pairInfo.baseToken?.name || "Unknown Token",
      currentPrice: currentPrice,
      priceChange24h: priceChange.h24 || 0,
      volume24h: volume.h24 || 0,
      liquidity: liquidity.usd || 0,
      pairAddress: pairAddress,
      dexId: pairInfo.dexId,
    },
    snipers: buyerList,
    totalFound: buyerList.length,
    analysis: {
      note: "ROI estimates based on position in early transactions. For precise ROI, trace swap calldata.",
      dataSource: "Blockscout + DEX Screener",
    },
  };
}

/**
 * Get sniper track record for a wallet
 * Checks if wallet has been early buyer on multiple tokens
 */
export async function getWalletSniperRecord(walletAddress) {
  // Get wallet's recent token transfers from Blockscout
  let transfers;
  try {
    transfers = await getTokenTransfers(walletAddress, 100);
  } catch (err) {
    return { error: "Could not fetch wallet data", walletAddress };
  }

  if (!transfers || transfers.length === 0) {
    return { 
      walletAddress,
      sniperScore: 0,
      message: "No token transfer history found",
    };
  }

  // Group transfers by token
  const tokenActivity = new Map(); // tokenAddress -> { symbol, name, firstSeen, txCount, buyCount }
  
  for (const transfer of transfers) {
    if (!transfer.token) continue;
    
    const tokenAddr = transfer.token.address_hash?.toLowerCase() || transfer.token.address?.toLowerCase();
    if (!tokenAddr) continue;
    
    // Skip stablecoins and WETH
    if (STABLECOINS.has(tokenAddr) || tokenAddr === WETH) continue;
    
    if (!tokenActivity.has(tokenAddr)) {
      tokenActivity.set(tokenAddr, {
        address: tokenAddr,
        symbol: transfer.token.symbol || "UNKNOWN",
        name: transfer.token.name || "Unknown",
        firstSeen: transfer.timestamp,
        txCount: 0,
        buyCount: 0,
      });
    }
    
    const activity = tokenActivity.get(tokenAddr);
    activity.txCount += 1;
    
    // Check if this was a buy (wallet received tokens)
    const toAddr = transfer.to?.hash?.toLowerCase();
    if (toAddr === walletAddress.toLowerCase()) {
      activity.buyCount += 1;
    }
  }

  // Filter to tokens where wallet was a buyer
  const boughtTokens = Array.from(tokenActivity.values()).filter(t => t.buyCount > 0);
  
  if (boughtTokens.length === 0) {
    return {
      walletAddress,
      sniperScore: 0,
      totalTokensTraded: 0,
      successfulTrades: 0,
      successRate: 0,
      tokens: [],
      analysis: {
        note: "No buy transactions found for this wallet",
        dataSource: "Blockscout + DEX Screener",
      },
    };
  }

  // Analyze each token the wallet bought
  const tokenAnalysis = [];
  
  for (const activity of boughtTokens.slice(0, 10)) { // Limit to avoid rate limits
    try {
      const pairInfo = await getTokenPairs(activity.address);
      if (!pairInfo) continue;
      
      const currentPrice = parseFloat(pairInfo.priceUsd || 0);
      const priceChange24h = pairInfo.priceChange?.h24 || 0;
      const volume24h = pairInfo.volume?.h24 || 0;
      
      tokenAnalysis.push({
        token: {
          address: activity.address,
          symbol: activity.symbol,
          name: activity.name,
        },
        firstSeen: activity.firstSeen,
        txCount: activity.txCount,
        buyCount: activity.buyCount,
        currentPrice,
        priceChange24h,
        volume24h,
      });
    } catch (err) {
      continue;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  // Calculate sniper score
  const successfulTrades = tokenAnalysis.filter(t => t.priceChange24h > 0).length;
  const totalTrades = tokenAnalysis.length;
  const successRate = totalTrades > 0 ? (successfulTrades / totalTrades * 100) : 0;
  
  const volumeScore = Math.min(totalTrades * 5, 30);
  const successScore = successRate * 0.5;
  const activityScore = Math.min(tokenAnalysis.reduce((sum, t) => sum + t.txCount, 0) * 2, 20);
  
  const sniperScore = Math.round(volumeScore + successScore + activityScore);

  return {
    walletAddress,
    sniperScore: Math.min(sniperScore, 100),
    totalTokensTraded: totalTrades,
    successfulTrades,
    successRate: Math.round(successRate * 100) / 100,
    tokens: tokenAnalysis.slice(0, 10),
    analysis: {
      note: "Sniper score based on trading activity and success rate. Entry prices not tracked in on-demand mode.",
      dataSource: "Blockscout + DEX Screener",
    },
  };
}

/**
 * Get trending snipers — find wallets that are early buyers on trending tokens
 */
export async function getTrendingSnipers() {
  // Step 1: Get trending tokens on Base
  const trending = await getTrendingTokens();
  if (!trending || trending.length === 0) {
    return { error: "Could not fetch trending tokens", snipers: [] };
  }

  // Step 2: For each trending token, find early buyers
  const allSnipers = new Map(); // wallet -> { tokens, count }
  
  for (const token of trending.slice(0, 5)) { // Limit to 5 to avoid rate limits
    try {
      const tokenAddress = token.tokenAddress;
      if (!tokenAddress) continue;
      
      const result = await getTokenSnipers(tokenAddress, { maxBuyers: 10 });
      if (result.error || !result.snipers) continue;
      
      for (const sniper of result.snipers) {
        if (!allSnipers.has(sniper.address)) {
          allSnipers.set(sniper.address, {
            address: sniper.address,
            tokens: [],
            snipeCount: 0,
          });
        }
        
        const entry = allSnipers.get(sniper.address);
        entry.tokens.push({
          symbol: result.token?.symbol || "UNKNOWN",
          address: tokenAddress,
          roi: sniper.estimatedROI,
          position: sniper.position,
        });
        entry.snipeCount += 1;
      }
      
      // Rate limit between tokens
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      continue;
    }
  }

  // Step 3: Rank snipers by frequency and success
  const rankedSnipers = Array.from(allSnipers.values())
    .filter(s => s.snipeCount >= 2) // Must appear on at least 2 tokens
    .sort((a, b) => b.snipeCount - a.snipeCount)
    .slice(0, 20)
    .map((sniper, index) => ({
      rank: index + 1,
      address: sniper.address,
      snipeCount: sniper.snipeCount,
      tokens: sniper.tokens,
      avgROI: Math.round(
        sniper.tokens.reduce((sum, t) => sum + t.roi, 0) / sniper.tokens.length * 100
      ) / 100,
    }));

  return {
    trendingTokens: trending.slice(0, 5).map(t => ({
      address: t.tokenAddress,
      description: t.description?.slice(0, 100) || "",
    })),
    snipers: rankedSnipers,
    totalFound: rankedSnipers.length,
    analysis: {
      note: "Snipers identified by appearing as early buyers on multiple trending tokens. Requires 2+ snipes to qualify.",
      dataSource: "Blockscout + DEX Screener",
    },
  };
}
