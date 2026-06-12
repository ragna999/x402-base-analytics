/**
 * DEX Aggregator Quotes — find best swap routes across DEXes
 * Uses GeckoTerminal API for real pool data + DeFiLlama for price fallback
 */

const GECKO = "https://api.geckoterminal.com/api/v2";
const LLAMA = "https://coins.llama.fi";

const DEX_SLUGS = {
  // GeckoTerminal slug -> our clean name
  "uniswap": "uniswap",
  "uniswap-v3": "uniswap",
  "uniswap-v3-base": "uniswap",
  "uniswap-v3-arbitrum": "uniswap",
  "uniswap-v3-ethereum": "uniswap",
  "uniswap-v4-base": "uniswap",
  "aerodrome": "aerodrome",
  "aerodrome-finance": "aerodrome",
  "aerodrome-base": "aerodrome",
  "aerodrome-slipstream": "aerodrome",
  "aerodrome-slipstream-3": "aerodrome",
  "sushiswap": "sushiswap",
  "sushiswap-v3": "sushiswap",
  "pancakeswap": "pancakeswap",
  "pancakeswap-v3": "pancakeswap",
  "pancakeswap-v3-base": "pancakeswap",
  "baseswap": "baseswap",
  "base-swap": "baseswap",
  "hydrex": "hydrex",
  "hydrex-integral": "hydrex",
  "swapbased": "swapbased",
  "woofi": "woofi",
  "curve": "curve",
  "curve-finance": "curve",
};

const GECKO_CHAIN = {
  base: "base",
  arbitrum: "arbitrum",
  ethereum: "eth",
  polygon: "polygon_pos",
  optimism: "optimism",
  avalanche: "avax",
  bsc: "bsc",
  celo: "celo",
};

const CHAIN_LLAMA = {
  base: "base",
  arbitrum: "arbitrum",
  ethereum: "ethereum",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avax",
  bsc: "bsc",
  celo: "celo",
};

const CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  ethereum: 1,
  polygon: 137,
  optimism: 10,
  avalanche: 43114,
  bsc: 56,
  celo: 42220,
};

const FEE_TIERS = {
  uniswap: [0.0001, 0.0005, 0.003, 0.01],
  aerodrome: [0.0001, 0.0005, 0.0025, 0.01],
  sushiswap: [0.003],
  pancakeswap: [0.0025, 0.0005],
  baseswap: [0.003],
};

const WRAPPED_NATIVE = {
  base: "0x4200000000000000000000000000000000000006",
  arbitrum: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  ethereum: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  optimism: "0x4200000000000000000000000000000000000006",
  polygon: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  avalanche: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  bsc: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  celo: "0x471ece3750da237f93b8e339c536989b8978a438",
};

const STABLES = [
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC Base (official)
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI Base
];

function normalize(addr) {
  return addr.toLowerCase().trim();
}

function detectNativeAlias(addr, chain) {
  const n = normalize(addr);
  const native = WRAPPED_NATIVE[chain];
  const aliases = [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x0000000000000000000000000000000000000000",
    "native", "eth", "matic", "bnb", "avax", "celo",
  ];
  if (native && n === normalize(native)) return native;
  if (aliases.includes(n)) return native;
  return null;
}

async function geckoFetch(path) {
  const res = await fetch(`${GECKO}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function geckoGetPools(token0, token1, chain, extra = "") {
  const p = `/networks/${GECKO_CHAIN[chain]}/tokens/${token0}/pools?page=1`;
  const data = await geckoFetch(p);
  if (!data?.data) return [];

  const t1 = normalize(token1);
  return data.data.filter((pool) => {
    const rels = pool.relationships;
    const a0 = normalize(rels?.base_token?.data?.id?.split("_")[1] || "");
    const a1 = normalize(rels?.quote_token?.data?.id?.split("_")[1] || "");
    return (a0 === t1 || a1 === t1);
  });
}

function makeQuote(pool, tokenIn, tokenOut, amountIn, chain) {
  const attrs = pool.attributes;
  const rels = pool.relationships;

  const reserves = attrs?.reserve_in_usd;
  if (!reserves || parseFloat(reserves) < 100) return null;

  const price0 = parseFloat(attrs?.base_token_price_usd || 0);
  const price1 = parseFloat(attrs?.quote_token_price_usd || 0);
  if (!price0 || !price1) return null;

  const inAddr = normalize(tokenIn);
  const baseAddr = normalize(rels?.base_token?.data?.id?.split("_")[1] || "");
  const quoteAddr = normalize(rels?.quote_token?.data?.id?.split("_")[1] || "");

  let priceIn, priceOut, reserveIn;
  if (baseAddr === inAddr) {
    priceIn = price0;
    priceOut = price1;
    reserveIn = parseFloat(attrs?.reserve_in_usd || 0) / 2;
  } else {
    priceIn = price1;
    priceOut = price0;
    reserveIn = parseFloat(attrs?.reserve_in_usd || 0) / 2;
  }

  const rawOut = amountIn * (priceIn / priceOut);

  const ratio = amountIn / reserveIn;
  const slippage = ratio > 0.01 ? Math.pow(ratio, 1.5) * 100 : ratio * 100;
  const effectiveSlippage = Math.min(slippage, 50);

  const amountOut = rawOut * (1 - effectiveSlippage / 100);
  // Extract fee from pool name (e.g. "WETH / USDC 0.05%") or fallback to 0.3%
  const nameMatch = attrs?.name?.match(/([\d.]+)%/);
  const fee = nameMatch ? parseFloat(nameMatch[1]) : 0.3;

  // Extract DEX from relationships (GeckoTerminal v2 format)
  const dexRaw = rels?.dex?.data?.id || attrs?.dex_id || "unknown";
  const dexClean = DEX_SLUGS[dexRaw] || dexRaw;

  return {
    pool: attrs?.address || pool.id?.split("_")[1] || "unknown",
    dex: dexClean,
    fee: +fee.toFixed(4),
    amountIn,
    amountOut: +amountOut.toFixed(8),
    priceImpact: +effectiveSlippage.toFixed(4),
    liquidityUsd: parseFloat(reserves),
    token0Price: price0,
    token1Price: price1,
    poolUrl: attrs?.pool_url || `https://geckoterminal.com/${GECKO_CHAIN[chain] || 'base'}/pools/${attrs?.address || ''}`,
  };
}

async function getLlamaPrice(chain, address) {
  const id = `${CHAIN_LLAMA[chain]}:${normalize(address)}`;
  const res = await fetch(`${LLAMA}/prices/current/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.coins?.[id]?.price || null;
}

export async function getQuote(chain, fromToken, toToken, amountIn = 1) {
  const c = chain.toLowerCase();

  let fromAddr = normalize(fromToken);
  let toAddr = normalize(toToken);
  const nativeFrom = detectNativeAlias(fromToken, c);
  const nativeTo = detectNativeAlias(toToken, c);
  if (nativeFrom) fromAddr = normalize(nativeFrom);
  if (nativeTo) toAddr = normalize(nativeTo);

  const pools = await geckoGetPools(fromAddr, toAddr, c);
  const quotes = [];

  for (const pool of pools) {
    try {
      const q = makeQuote(pool, fromAddr, toAddr, amountIn, c);
      if (q && q.amountOut > 0) quotes.push(q);
    } catch {}
  }

  quotes.sort((a, b) => b.amountOut - a.amountOut);

  if (quotes.length === 0) {
    return fallbackQuote(c, fromAddr, toAddr, amountIn);
  }

  const best = quotes[0];
  const savingsVsWorst = quotes.length > 1
    ? ((best.amountOut - quotes[quotes.length - 1].amountOut) / quotes[quotes.length - 1].amountOut * 100).toFixed(2)
    : 0;

  return {
    best: {
      dex: best.dex,
      pool: best.pool,
      fee: best.fee,
      amountIn: best.amountIn,
      amountOut: best.amountOut,
      priceImpact: best.priceImpact,
      liquidityUsd: best.liquidityUsd,
      poolUrl: best.poolUrl,
    },
    alternatives: quotes.slice(1, 5).map((q) => ({
      dex: q.dex,
      pool: q.pool,
      fee: q.fee,
      amountOut: q.amountOut,
      priceImpact: q.priceImpact,
      vsBest: `-${((1 - q.amountOut / best.amountOut) * 100).toFixed(2)}%`,
    })),
    summary: {
      from: fromAddr,
      to: toAddr,
      chain: c,
      dexesScanned: new Set(quotes.map((q) => q.dex)).size,
      totalPools: quotes.length,
      savingsVsWorst: `${savingsVsWorst}%`,
      disclaimer: "Quotes are estimates based on pool reserves. Actual execution may differ.",
    },
    timestamp: new Date().toISOString(),
  };
}

async function fallbackQuote(chain, fromAddr, toAddr, amountIn) {
  const [pIn, pOut] = await Promise.all([
    getLlamaPrice(chain, fromAddr),
    getLlamaPrice(chain, toAddr),
  ]);

  if (!pIn || !pOut) {
    return {
      error: "No pools or price data found for this pair",
      from: fromAddr,
      to: toAddr,
      chain,
      hint: "Verify token addresses are correct for this chain",
    };
  }

  const dexes = ["aerodrome", "uniswap", "sushiswap", "pancakeswap"];
  const quotes = dexes.map((dex) => {
    const fee = (FEE_TIERS[dex] || [0.003])[0];
    const amountOut = amountIn * (pIn / pOut) * (1 - fee);
    return {
      pool: "virtual",
      dex,
      fee: +(fee * 100).toFixed(4),
      amountIn,
      amountOut: +amountOut.toFixed(8),
      priceImpact: 0,
      liquidityUsd: 0,
    };
  });

  quotes.sort((a, b) => b.amountOut - a.amountOut);

  return {
    best: quotes[0],
    alternatives: quotes.slice(1),
    summary: {
      from: fromAddr,
      to: toAddr,
      chain,
      dexesScanned: dexes.length,
      totalPools: dexes.length,
      savingsVsWorst: quotes.length > 1
        ? `${((1 - quotes[quotes.length - 1].amountOut / quotes[0].amountOut) * 100).toFixed(2)}%`
        : "0%",
      source: "DeFiLlama prices (virtual quotes — real pool data unavailable)",
      disclaimer: "These are price-based estimates. No real pool reserves were found.",
    },
    timestamp: new Date().toISOString(),
  };
}

export async function getPoolInfo(chain, token0, token1) {
  const c = chain.toLowerCase();
  let t0 = normalize(token0);
  let t1 = normalize(token1);

  const n0 = detectNativeAlias(token0, c);
  const n1 = detectNativeAlias(token1, c);
  if (n0) t0 = normalize(n0);
  if (n1) t1 = normalize(n1);

  const pools = await geckoGetPools(t0, t1, c);

  return {
    chain: c,
    pair: `${t0} / ${t1}`,
    totalPools: pools.length,
    pools: pools.slice(0, 15).map((p) => ({
      address: p.attributes?.address || p.id,
      dex: DEX_SLUGS[p.attributes?.dex_id] || p.attributes?.dex_id,
      fee: p.attributes?.pool_fee_rate || p.attributes?.fee,
      priceUsd: p.attributes?.base_token_price_usd,
      volume24h: p.attributes?.volume_usd?.h24,
      liquidityUsd: p.attributes?.reserve_in_usd,
      priceChange24h: p.attributes?.price_change_percentage?.h24,
      url: p.attributes?.pool_url,
    })),
    timestamp: new Date().toISOString(),
  };
}

export async function getSupportedDexes(chain) {
  const c = chain?.toLowerCase() || "base";
  return {
    chain: c,
    supported: [
      { name: "Aerodrome", slug: "aerodrome", type: "ve(3,3) / CL + Stable", chains: ["base"] },
      { name: "Uniswap V3", slug: "uniswap", type: "Concentrated Liquidity", chains: ["base", "arbitrum", "ethereum", "optimism", "polygon", "bsc"] },
      { name: "SushiSwap", slug: "sushiswap", type: "AMM (xy=k)", chains: ["base", "arbitrum", "ethereum"] },
      { name: "PancakeSwap", slug: "pancakeswap", type: "AMM + V3 CL", chains: ["base", "bsc", "ethereum"] },
      { name: "BaseSwap", slug: "baseswap", type: "AMM (xy=k)", chains: ["base"] },
      { name: "Hydrex", slug: "hydrex", type: "Integral / Concentrated", chains: ["base"] },
    ],
    nativeToken: WRAPPED_NATIVE[c] || "unknown",
    note: "Quotes use real pool data from GeckoTerminal. Accuracy depends on pool liquidity.",
    timestamp: new Date().toISOString(),
  };
}
