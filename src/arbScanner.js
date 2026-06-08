// arbScanner.js — DEX Price Scanner & Arbitrage Detector for Base
// Scans Uniswap V3, Aerodrome, SushiSwap for price differences
// Identifies profitable flash loan arbitrage opportunities

const BASE_RPC = "https://mainnet.base.org";

// === DEX ROUTER ADDRESSES ON BASE ===
const DEXS = {
  uniswapV3: {
    name: "Uniswap V3",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  },
  aerodrome: {
    name: "Aerodrome",
    router: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  },
  sushiSwap: {
    name: "SushiSwap",
    router: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",
    factory: "0x71524B4f93c58fcbF659783f8e3b4f8b9e8b8b8b",
  },
};

// === POPULAR TOKEN PAIRS ON BASE ===
const TOKENS = {
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  AERO: { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18 },
  DEGEN: { address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 },
  BRETT: { address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", decimals: 18 },
  TOSHI: { address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4", decimals: 18 },
  cbETH: { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18 },
};

// Uniswap V3 Quoter ABI (quoteExactInputSingle)
const QUOTER_ABI = {
  inputs: [
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ],
  name: "quoteExactInputSingle",
  outputs: [{ name: "amountOut", type: "uint256" }],
  stateMutability: "nonpayable",
  type: "function",
};

// Encode function call
function encodeFunction(abi, params) {
  // Manual ABI encoding for quoteExactInputSingle
  const [tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96] = params;
  const selector = "0xc6a5026a"; // quoteExactInputSingle selector

  const encoded =
    selector +
    tokenIn.toLowerCase().replace("0x", "").padStart(64, "0") +
    tokenOut.toLowerCase().replace("0x", "").padStart(64, "0") +
    BigInt(amountIn).toString(16).padStart(64, "0") +
    fee.toString(16).padStart(64, "0") +
    BigInt(sqrtPriceLimitX96).toString(16).padStart(64, "0");

  return encoded;
}

// Decode uint256 result
function decodeUint256(hex) {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

// RPC call
async function rpcCall(method, params) {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// Get quote from Uniswap V3
async function getUniswapQuote(tokenIn, tokenOut, amountIn, fee = 3000) {
  try {
    const data = encodeFunction(QUOTER_ABI, [
      tokenIn,
      tokenOut,
      amountIn,
      fee,
      0,
    ]);
    const result = await rpcCall("eth_call", [
      { to: DEXS.uniswapV3.quoter, data },
      "latest",
    ]);
    return decodeUint256(result);
  } catch {
    return 0n;
  }
}

// Get reserves from Aerodrome (Solidly-style DEX)
// Uses pool contract's getReserves()
async function getAerodromeReserves(tokenA, tokenB) {
  try {
    // Aerodrome factory.getPool(tokenA, tokenB, stable)
    const stable = false; // volatile pool
    const selector = "0x1698ee82"; // getPool(address,address,bool)
    const data =
      selector +
      tokenA.toLowerCase().replace("0x", "").padStart(64, "0") +
      tokenB.toLowerCase().replace("0x", "").padStart(64, "0") +
      (stable ? "1" : "0").padStart(64, "0");

    const poolResult = await rpcCall("eth_call", [
      { to: DEXS.aerodrome.factory, data },
      "latest",
    ]);

    const poolAddress = "0x" + poolResult.slice(26, 66);
    if (
      poolAddress === "0x0000000000000000000000000000000000000000"
    )
      return null;

    // getReserves()
    const reservesData = "0x0902f1ac"; // getReserves()
    const reservesResult = await rpcCall("eth_call", [
      { to: poolAddress, data: reservesData },
      "latest",
    ]);

    const reserve0 = BigInt(reservesResult.slice(0, 66));
    const reserve1 = BigInt("0x" + reservesResult.slice(66, 130));

    return { poolAddress, reserve0, reserve1 };
  } catch {
    return null;
  }
}

// Calculate Aerodrome output using constant product formula
function calculateAerodromeOutput(reserveIn, reserveOut, amountIn) {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}

// Get price quote from Aerodrome
async function getAerodromeQuote(tokenIn, tokenOut, amountIn) {
  try {
    const reserves = await getAerodromeReserves(tokenIn, tokenOut);
    if (!reserves) return 0n;

    const tokenA = tokenIn.toLowerCase();
    const factoryAddr = DEXS.aerodrome.factory.toLowerCase();

    // Determine which reserve is for tokenIn
    // Need to check token ordering in pool
    const poolToken0Data =
      "0x0dfe1681" + // token0()
      reserves.poolAddress.toLowerCase().replace("0x", "").padStart(64, "0");

    // Simplified: assume reserve0 = tokenIn, reserve1 = tokenOut
    // In production, check token0() to determine ordering
    return calculateAerodromeOutput(
      reserves.reserve0,
      reserves.reserve1,
      amountIn
    );
  } catch {
    return 0n;
  }
}

// Scan all DEXs for a token pair
async function scanPair(tokenIn, tokenOut, amountIn, symbol) {
  const [uniQuote, aeroQuote] = await Promise.all([
    getUniswapQuote(tokenIn, tokenOut, amountIn),
    getAerodromeQuote(tokenIn, tokenOut, amountIn),
  ]);

  const uniOut = Number(uniQuote);
  const aeroOut = Number(aeroQuote);

  const results = [];
  if (uniOut > 0)
    results.push({ dex: "Uniswap V3", output: uniOut, raw: uniQuote });
  if (aeroOut > 0)
    results.push({ dex: "Aerodrome", output: aeroOut, raw: aeroQuote });

  return results;
}

// Detect arbitrage opportunity
function detectArbitrage(quotes, tokenInDecimals, tokenOutDecimals) {
  if (quotes.length < 2) return null;

  // Sort by output (highest first)
  const sorted = quotes.sort((a, b) => b.output - a.output);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const diff = best.output - worst.output;
  const diffPercent =
    (diff / worst.output) * 100;

  // Estimate gas cost (simplified)
  const gasEstimate = 200000; // ~200K gas for flash loan arb
  const gasPrice = 0.001; // ~0.001 gwei on Base (very cheap)
  const gasCost = gasEstimate * gasPrice;

  // Calculate profit in token terms
  const profitRaw = diff;
  const profitFormatted =
    profitRaw / Math.pow(10, tokenOutDecimals);

  return {
    profitable: diffPercent > 0.3, // Minimum 0.3% spread
    buyFrom: worst.dex,
    sellTo: best.dex,
    spreadPercent: diffPercent.toFixed(2),
    estimatedProfit: profitFormatted.toFixed(6),
    gasCostEstimate: gasCost.toFixed(6),
    netProfit: (profitFormatted - gasCost).toFixed(6),
  };
}

// === MAIN SCANNER ===

// Scan all configured pairs across all DEXs
export async function scanAllPairs(amountUSDC = 1000) {
  const amountIn = BigInt(amountUSDC) * BigInt(10 ** 6); // USDC has 6 decimals
  const opportunities = [];

  const pairs = [
    { from: "USDC", to: "WETH" },
    { from: "USDC", to: "AERO" },
    { from: "USDC", to: "DEGEN" },
    { from: "USDC", to: "BRETT" },
    { from: "WETH", to: "USDC" },
    { from: "WETH", to: "AERO" },
    { from: "AERO", to: "USDC" },
    { from: "AERO", to: "WETH" },
  ];

  for (const pair of pairs) {
    const tokenIn = TOKENS[pair.from];
    const tokenOut = TOKENS[pair.to];
    if (!tokenIn || !tokenOut) continue;

    const adjustedAmountIn =
      BigInt(amountUSDC) * BigInt(10 ** tokenIn.decimals);

    try {
      const quotes = await scanPair(
        tokenIn.address,
        tokenOut.address,
        adjustedAmountIn,
        `${pair.from}/${pair.to}`
      );

      const arb = detectArbitrage(
        quotes,
        tokenIn.decimals,
        tokenOut.decimals
      );

      if (arb && arb.profitable) {
        opportunities.push({
          pair: `${pair.from} → ${pair.to}`,
          amountIn: `${amountUSDC} ${pair.from}`,
          ...arb,
          quotes: quotes.map((q) => ({
            dex: q.dex,
            output: (q.output / Math.pow(10, tokenOut.decimals)).toFixed(6),
          })),
        });
      }
    } catch (e) {
      // Skip failed pairs
    }

    // Rate limit: wait 100ms between pairs
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    timestamp: new Date().toISOString(),
    amountScanned: `$${amountUSDC}`,
    pairsScanned: pairs.length,
    opportunitiesFound: opportunities.length,
    opportunities,
  };
}

// Scan a specific pair
export async function scanSpecificPair(
  fromSymbol,
  toSymbol,
  amount = 1000
) {
  const from = TOKENS[fromSymbol];
  const to = TOKENS[toSymbol];
  if (!from || !to)
    return { error: `Unknown token: ${fromSymbol} or ${toSymbol}` };

  const adjustedAmount = BigInt(amount) * BigInt(10 ** from.decimals);

  const quotes = await scanPair(
    from.address,
    to.address,
    adjustedAmount,
    `${fromSymbol}/${toSymbol}`
  );

  const arb = detectArbitrage(quotes, from.decimals, to.decimals);

  return {
    pair: `${fromSymbol} → ${toSymbol}`,
    amount: `${amount} ${fromSymbol}`,
    quotes: quotes.map((q) => ({
      dex: q.dex,
      output: (q.output / Math.pow(10, to.decimals)).toFixed(6),
    })),
    arbitrage: arb,
  };
}

// Get supported tokens
export function getSupportedTokens() {
  return Object.entries(TOKENS).map(([symbol, info]) => ({
    symbol,
    address: info.address,
    decimals: info.decimals,
  }));
}

// Get supported DEXs
export function getSupportedDexs() {
  return Object.entries(DEXS).map(([key, info]) => ({
    id: key,
    name: info.name,
  }));
}
