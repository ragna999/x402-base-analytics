// Token Clone Detection — find impersonators, scam copies, similar tokens
// Data sources: DexScreener search API (free, no key)
// Scammers copy names/symbols of popular tokens to trick users

async function fetchJSON(url, timeout = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchWithFallback(url, timeout = 8000) {
  try {
    return await fetchJSON(url, timeout);
  } catch {
    return null;
  }
}

// Search DexScreener for tokens with similar name/symbol
async function searchSimilarTokens(query) {
  const data = await fetchWithFallback(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
  );
  if (!data || !data.pairs) return [];
  return data.pairs;
}

// Get token info from Blockscout
async function getTokenMeta(chain, address) {
  const { CHAINS } = await import("./chains.js");
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return null;
  const data = await fetchWithFallback(`${config.explorer}/tokens/${address}`);
  if (!data) return null;
  return {
    name: data.name || null,
    symbol: data.symbol || null,
    holders: data.holders_count || "0",
    totalSupply: data.total_supply || "0",
    decimals: parseInt(data.decimals || "18"),
    exchangeRate: data.exchange_rate || null,
    type: data.type || "ERC-20",
  };
}

// Check if a pair is the original or a clone
function classifyPair(pair, originalAddress) {
  const baseAddr = pair.baseToken?.address?.toLowerCase();
  const quoteAddr = pair.quoteToken?.address?.toLowerCase();
  const origAddr = originalAddress.toLowerCase();

  const isOriginal = baseAddr === origAddr || quoteAddr === origAddr;

  return {
    ...pair,
    isOriginal,
    tokenAddress: baseAddr === origAddr ? baseAddr : quoteAddr,
    tokenSymbol: baseAddr === origAddr ? pair.baseToken?.symbol : pair.quoteToken?.symbol,
  };
}

// Calculate scam risk for a potential clone
function assessCloneRisk(pair, originalMeta) {
  let riskScore = 0;
  const flags = [];

  // Low liquidity = potential scam (rug pull setup)
  const liq = pair.liquidity?.usd || 0;
  if (liq < 1000) { riskScore += 40; flags.push("EXTREMELY_LOW_LIQUIDITY"); }
  else if (liq < 10000) { riskScore += 25; flags.push("VERY_LOW_LIQUIDITY"); }
  else if (liq < 50000) { riskScore += 10; flags.push("LOW_LIQUIDITY"); }

  // New pair (created recently = suspicious)
  if (pair.pairCreatedAt) {
    const ageHours = (Date.now() - new Date(pair.pairCreatedAt).getTime()) / 3600000;
    if (ageHours < 24) { riskScore += 20; flags.push("VERY_NEW_PAIR"); }
    else if (ageHours < 168) { riskScore += 10; flags.push("NEW_PAIR"); }
  }

  // No volume = dead or honeypot
  const vol24h = pair.volume?.h24 || 0;
  if (vol24h === 0) { riskScore += 15; flags.push("ZERO_VOLUME"); }

  // Extreme price change = pump and dump
  const priceChange = Math.abs(pair.priceChange?.h24 || 0);
  if (priceChange > 100) { riskScore += 20; flags.push("EXTREME_PRICE_CHANGE"); }
  else if (priceChange > 50) { riskScore += 10; flags.push("HIGH_PRICE_CHANGE"); }

  // Low holder count (if available from Blockscout)
  // We can't check this cheaply for every pair, so skip

  // Name/symbol exact match but different address = high scam probability
  if (pair.tokenSymbol?.toLowerCase() === originalMeta?.symbol?.toLowerCase() &&
      pair.tokenAddress?.toLowerCase() !== originalMeta?.address?.toLowerCase()) {
    riskScore += 15;
    flags.push("SYMBOL_MATCH_DIFFERENT_ADDRESS");
  }

  riskScore = Math.min(riskScore, 100);

  let verdict;
  if (riskScore >= 70) verdict = "likely_scam";
  else if (riskScore >= 40) verdict = "suspicious";
  else if (riskScore >= 20) verdict = "caution";
  else verdict = "probably_legit";

  return { riskScore, verdict, flags };
}

// Main function
export async function detectClones(chain, tokenAddress) {
  // Get original token info
  const originalMeta = await getTokenMeta(chain, tokenAddress);

  if (!originalMeta || !originalMeta.symbol) {
    return {
      chain,
      token: tokenAddress,
      error: "Token not found",
      clones: [],
    };
  }

  // Search for tokens with same symbol and name
  const [symbolResults, nameResults] = await Promise.all([
    searchSimilarTokens(originalMeta.symbol),
    originalMeta.name ? searchSimilarTokens(originalMeta.name) : Promise.resolve([]),
  ]);

  // Deduplicate by pair address
  const allPairs = new Map();
  for (const pair of [...symbolResults, ...nameResults]) {
    if (pair.pairAddress) allPairs.set(pair.pairAddress, pair);
  }

  // Classify each pair
  const classified = Array.from(allPairs.values()).map(p =>
    classifyPair(p, tokenAddress)
  );

  // Separate originals from clones
  const originals = classified.filter(p => p.isOriginal);
  const potentialClones = classified.filter(p => !p.isOriginal);

  // Assess clone risk
  const clones = potentialClones
    .map(p => ({
      pairAddress: p.pairAddress,
      tokenAddress: p.tokenAddress,
      tokenSymbol: p.tokenSymbol,
      tokenName: p.baseToken?.name || p.quoteToken?.name || null,
      chain: p.chainId,
      dex: p.dexId,
      priceUsd: p.priceUsd || "0",
      liquidity: p.liquidity?.usd || 0,
      volume24h: p.volume?.h24 || 0,
      priceChange24h: (p.priceChange?.h24 || 0).toFixed(2) + "%",
      createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
      risk: assessCloneRisk(p, { ...originalMeta, address: tokenAddress }),
      url: p.url || null,
    }))
    .sort((a, b) => b.risk.riskScore - a.risk.riskScore);

  // Summary
  const likelyScams = clones.filter(c => c.risk.verdict === "likely_scam").length;
  const suspicious = clones.filter(c => c.risk.verdict === "suspicious").length;

  return {
    chain,
    token: tokenAddress,
    original: {
      name: originalMeta.name,
      symbol: originalMeta.symbol,
      holders: originalMeta.holders,
      knownPairs: originals.length,
    },
    clones: {
      total: clones.length,
      likelyScams,
      suspicious,
      items: clones.slice(0, 20), // Top 20 most suspicious
    },
    searchQuery: originalMeta.symbol,
    analyzed_at: new Date().toISOString(),
  };
}
