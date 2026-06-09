// Multi-chain configuration for RagRadar x402 API
// Supports: Base, Arbitrum, Polygon, Avalanche, Celo

export const CHAINS = {
  base: {
    name: "Base",
    chainId: 8453,
    rpc: "https://mainnet.base.org",
    explorer: "https://base.blockscout.com/api/v2",
    explorerType: "blockscout", // no API key needed
    gecko: "base",
    x402Network: "eip155:8453",
    nativeCurrency: "ETH",
    blockscout: true,
  },
  arbitrum: {
    name: "Arbitrum",
    chainId: 42161,
    rpc: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbitrum.blockscout.com/api/v2",
    explorerType: "blockscout",
    gecko: "arbitrum",
    x402Network: "eip155:42161",
    nativeCurrency: "ETH",
    blockscout: true,
  },
  polygon: {
    name: "Polygon",
    chainId: 137,
    rpc: "https://polygon-bor-rpc.publicnode.com",
    explorer: "https://api.polygonscan.com/api",
    explorerType: "etherscan", // needs free API key
    gecko: "polygon_pos",
    x402Network: "eip155:137",
    nativeCurrency: "POL",
    blockscout: false,
  },
  avalanche: {
    name: "Avalanche",
    chainId: 43114,
    rpc: "https://api.avax.network/ext/bc/C/rpc",
    explorer: "https://api.snowtrace.io/api",
    explorerType: "etherscan",
    gecko: "avax",
    x402Network: "eip155:43114",
    nativeCurrency: "AVAX",
    blockscout: false,
  },
  celo: {
    name: "Celo",
    chainId: 42220,
    rpc: "https://forno.celo.org",
    explorer: "https://celo.blockscout.com/api/v2",
    explorerType: "blockscout",
    gecko: "celo",
    x402Network: "eip155:42220",
    nativeCurrency: "CELO",
    blockscout: true,
  },
};

// Supported chain slugs (for validation)
export const SUPPORTED_CHAINS = Object.keys(CHAINS);

/**
 * Get chain config by slug
 */
export function getChain(slug) {
  const chain = CHAINS[slug];
  if (!chain) throw new Error(`Unsupported chain: ${slug}. Supported: ${SUPPORTED_CHAINS.join(", ")}`);
  return chain;
}

/**
 * Make an RPC call to any EVM chain
 */
export async function rpcCall(chainSlug, method, params) {
  const chain = getChain(chainSlug);
  const res = await fetch(chain.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

/**
 * Pad address to 32 bytes for ABI encoding
 */
export function padAddress(address) {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

export const ERC20_BALANCEOF = "0x70a08231";

/**
 * Get native token balance (ETH/MATIC/AVAX/CELO)
 */
export async function getNativeBalance(chainSlug, address) {
  const hex = await rpcCall(chainSlug, "eth_getBalance", [address, "latest"]);
  return BigInt(hex);
}

/**
 * Get ERC-20 token balance on any chain
 */
export async function getTokenBalance(chainSlug, tokenAddress, walletAddress) {
  const data = `${ERC20_BALANCEOF}${padAddress(walletAddress)}`;
  const hex = await rpcCall(chainSlug, "eth_call", [{ to: tokenAddress, data }, "latest"]);
  return BigInt(hex);
}

/**
 * Fetch from block explorer API (handles both Blockscout and Etherscan patterns)
 */
export async function fetchFromExplorer(chainSlug, endpoint, params = {}) {
  const chain = getChain(chainSlug);
  const url = new URL(`${chain.explorer}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Explorer API error: ${res.status}`);
  return res.json();
}

/**
 * Get token balances from Blockscout (Base, Arbitrum, Celo)
 */
export async function getBlockscoutTokenBalances(chainSlug, address) {
  return fetchFromExplorer(chainSlug, `/addresses/${address}/token-balances`);
}

/**
 * Get transaction history from Blockscout
 */
export async function getBlockscoutTxHistory(chainSlug, address, limit = 50) {
  const data = await fetchFromExplorer(chainSlug, `/addresses/${address}/transactions`);
  return (data.items || []).slice(0, limit);
}

/**
 * Get token transfers from Blockscout
 */
export async function getBlockscoutTokenTransfers(chainSlug, address, limit = 50) {
  const data = await fetchFromExplorer(chainSlug, `/addresses/${address}/token-transfers`);
  return (data.items || []).slice(0, limit);
}

/**
 * Get token holders from Blockscout
 */
export async function getBlockscoutTokenHolders(chainSlug, tokenAddress, limit = 100) {
  const data = await fetchFromExplorer(chainSlug, `/tokens/${tokenAddress}/holders`);
  return (data.items || []).slice(0, limit);
}

/**
 * Get address counters from Blockscout
 */
export async function getBlockscoutCounters(chainSlug, address) {
  return fetchFromExplorer(chainSlug, `/addresses/${address}/counters`);
}

/**
 * Fetch from GeckoTerminal API (works on all chains)
 */
export async function fetchFromGecko(endpoint) {
  const url = `https://api.geckoterminal.com/api/v2${endpoint}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`GeckoTerminal API error: ${res.status}`);
  return res.json();
}

/**
 * Get trending pools for a chain
 */
export async function getTrendingPools(chainSlug) {
  const chain = getChain(chainSlug);
  return fetchFromGecko(`/networks/${chain.gecko}/trending_pools`);
}

/**
 * Get new pools for a chain
 */
export async function getNewPools(chainSlug) {
  const chain = getChain(chainSlug);
  return fetchFromGecko(`/networks/${chain.gecko}/new_pools`);
}

/**
 * Get token data from GeckoTerminal
 */
export async function getGeckoToken(chainSlug, tokenAddress) {
  const chain = getChain(chainSlug);
  return fetchFromGecko(`/networks/${chain.gecko}/tokens/${tokenAddress}`);
}

/**
 * Get pool data from GeckoTerminal
 */
export async function getGeckoPool(chainSlug, poolAddress) {
  const chain = getChain(chainSlug);
  return fetchFromGecko(`/networks/${chain.gecko}/pools/${poolAddress}`);
}

/**
 * Fetch from DexScreener API (auto-detects chain)
 */
export async function fetchFromDexScreener(endpoint) {
  const url = `https://api.dexscreener.com${endpoint}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`DexScreener API error: ${res.status}`);
  return res.json();
}

/**
 * Get token pairs from DexScreener
 */
export async function getDexScreenerTokenPairs(tokenAddress) {
  return fetchFromDexScreener(`/latest/dex/tokens/${tokenAddress}`);
}

/**
 * Search DexScreener
 */
export async function searchDexScreener(query) {
  return fetchFromDexScreener(`/latest/dex/search?q=${encodeURIComponent(query)}`);
}

/**
 * Fetch from DeFiLlama (works for all chains)
 */
export async function fetchFromDeFiLlama(endpoint) {
  const url = `https://yields.llama.fi${endpoint}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`DeFiLlama API error: ${res.status}`);
  return res.json();
}

/**
 * Get DeFi yields for a chain
 */
export async function getChainYields(chainSlug, minTvl = 10000) {
  const chain = getChain(chainSlug);
  const data = await fetchFromDeFiLlama("/pools");
  return (data.data || [])
    .filter(p => p.chain === chain.name && p.tvlUsd > minTvl && p.apy > 0 && p.apy < 10000)
    .sort((a, b) => b.apy - a.apy);
}

/**
 * Safe wrapper for async calls (returns error object instead of throwing)
 */
export async function safeCall(fn, ...args) {
  try {
    return await fn(...args);
  } catch (err) {
    return { error: err.message };
  }
}
