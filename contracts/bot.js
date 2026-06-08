// bot.js — Flash Loan Arbitrage Execution Bot
// Monitors prices and executes arb when profitable

const { ethers } = require("ethers");
require("dotenv").config();

// === CONFIG ===
const RPC_URL = "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.ARB_CONTRACT;

// Tokens
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";

// DEX Quoters
const UNISWAP_QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

// Settings
const MIN_SPREAD_PERCENT = 0.3; // Minimum spread to consider
const BORROW_AMOUNT = ethers.parseUnits("10000", 6); // 10,000 USDC
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const MIN_PROFIT = ethers.parseUnits("10", 6); // Minimum $10 profit

// Contract ABI (only the functions we need)
const CONTRACT_ABI = [
  "function executeArb(tuple(address tokenBorrow, address tokenTrade, uint256 amountBorrow, bool buyOnAerodrome, uint24 uniswapFee, uint256 minProfit) params) external",
  "function withdraw(address token) external",
  "function withdrawETH() external",
  "event ArbExecuted(address indexed tokenBorrow, address indexed tokenTrade, uint256 amountBorrowed, uint256 profit)",
];

// Quoter ABI
const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160, uint32, uint256)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, bool stable) external view returns (address)",
];

const POOL_ABI = [
  "function getReserves() external view returns (uint256, uint256, uint256)",
  "function token0() external view returns (address)",
];

const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

// === INIT ===
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
const quoter = new ethers.Contract(UNISWAP_QUOTER, QUOTER_ABI, provider);
const factory = new ethers.Contract(AERODROME_FACTORY, FACTORY_ABI, provider);

// === HELPERS ===

async function getUniswapQuote(tokenIn, tokenOut, amountIn, fee = 3000) {
  try {
    const result = await quoter.quoteExactInputSingle.staticCall(
      tokenIn,
      tokenOut,
      fee,
      amountIn,
      0
    );
    return result[0]; // amountOut
  } catch {
    return 0n;
  }
}

async function getAerodromeQuote(tokenIn, tokenOut, amountIn) {
  try {
    const poolAddress = await factory.getPool(tokenIn, tokenOut, false);
    if (poolAddress === ethers.ZeroAddress) return 0n;

    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const [r0, r1] = await pool.getReserves();
    const token0 = await pool.token0();

    const isToken0In = tokenIn.toLowerCase() === token0.toLowerCase();
    const reserveIn = isToken0In ? r0 : r1;
    const reserveOut = isToken0In ? r1 : r0;

    if (reserveIn === 0n || reserveOut === 0n) return 0n;

    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    return numerator / denominator;
  } catch {
    return 0n;
  }
}

function calculateSpread(quote1, quote2) {
  if (quote1 === 0n || quote2 === 0n) return 0;
  const diff = quote1 > quote2 ? quote1 - quote2 : quote2 - quote1;
  const min = quote1 < quote2 ? quote1 : quote2;
  return Number((diff * 10000n) / min) / 100; // Percentage
}

// === MAIN LOOP ===

async function checkAndExecute() {
  const timestamp = new Date().toISOString();
  
  try {
    // Get quotes for USDC → WETH
    const uniQuote = await getUniswapQuote(USDC, WETH, BORROW_AMOUNT);
    const aeroQuote = await getAerodromeQuote(USDC, WETH, BORROW_AMOUNT);
    
    if (uniQuote === 0n || aeroQuote === 0n) {
      console.log(`[${timestamp}] Quotes unavailable`);
      return;
    }
    
    const uniWETH = Number(ethers.formatEther(uniQuote));
    const aeroWETH = Number(ethers.formatEther(aeroQuote));
    const spread = calculateSpread(uniQuote, aeroQuote);
    
    console.log(`[${timestamp}] Uni: ${uniWETH.toFixed(6)} | Aero: ${aeroWETH.toFixed(6)} | Spread: ${spread.toFixed(2)}%`);
    
    // Check if profitable
    if (spread < MIN_SPREAD_PERCENT) {
      return; // Not enough spread
    }
    
    // Determine direction
    const buyOnAerodrome = aeroQuote > uniQuote; // Buy where it's cheaper (more WETH out)
    
    console.log(`[${timestamp}] 🚨 OPPORTUNITY DETECTED!`);
    console.log(`  Direction: ${buyOnAerodrome ? "Buy Aerodrome → Sell Uniswap" : "Buy Uniswap → Sell Aerodrome"}`);
    console.log(`  Spread: ${spread.toFixed(2)}%`);
    
    // Execute arb
    const params = {
      tokenBorrow: USDC,
      tokenTrade: WETH,
      amountBorrow: BORROW_AMOUNT,
      buyOnAerodrome: buyOnAerodrome,
      uniswapFee: 3000,
      minProfit: MIN_PROFIT,
    };
    
    console.log(`[${timestamp}] Executing arb...`);
    
    const tx = await contract.executeArb(params, {
      gasLimit: 500000,
    });
    
    console.log(`[${timestamp}] TX sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[${timestamp}] TX confirmed in block ${receipt.blockNumber}`);
    
    // Parse events
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed.name === "ArbExecuted") {
          const profit = ethers.formatUnits(parsed.args.profit, 6);
          console.log(`[${timestamp}] 💰 PROFIT: $${profit} USDC`);
        }
      } catch {}
    }
    
  } catch (error) {
    console.error(`[${timestamp}] Error:`, error.message);
  }
}

// === START ===

async function main() {
  console.log("=== Flash Loan Arbitrage Bot ===");
  console.log("Network: Base Mainnet");
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Wallet:", wallet.address);
  console.log("Borrow amount: $10,000 USDC");
  console.log("Min spread:", MIN_SPREAD_PERCENT + "%");
  console.log("Check interval:", CHECK_INTERVAL / 1000 + "s");
  console.log("");
  
  // Check wallet balance
  const balance = await provider.getBalance(wallet.address);
  console.log("Wallet ETH balance:", ethers.formatEther(balance));
  
  // Check USDC balance
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);
  const usdcBal = await usdc.balanceOf(wallet.address);
  console.log("Wallet USDC balance:", ethers.formatUnits(usdcBal, 6));
  
  console.log("");
  console.log("Starting price monitor...");
  console.log("─".repeat(60));
  
  // Main loop
  setInterval(checkAndExecute, CHECK_INTERVAL);
  
  // Initial check
  await checkAndExecute();
}

main().catch(console.error);
