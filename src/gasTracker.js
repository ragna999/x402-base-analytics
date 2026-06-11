// Gas Tracker — real-time gas prices across chains
import { ethers } from "ethers";

const RPCS = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum-rpc.publicnode.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  optimism: "https://mainnet.optimism.io",
  polygon: "https://polygon-bor-rpc.publicnode.com",
};

export async function getGasPrices() {
  const results = {};
  
  // EVM chains — parallel fetch
  const evmPromises = Object.entries(RPCS).map(async ([chain, rpc]) => {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const feeData = await provider.getFeeData();
      
      const gwei = Number(feeData.gasPrice) / 1e9;
      const maxFeeGwei = feeData.maxFeePerGas ? Number(feeData.maxFeePerGas) / 1e9 : null;
      const maxPriorityGwei = feeData.maxPriorityFeePerGas ? Number(feeData.maxPriorityFeePerGas) / 1e9 : null;
      
      return [chain, {
        gasPrice: Math.round(gwei * 100) / 100,
        maxFeePerGas: maxFeeGwei ? Math.round(maxFeeGwei * 100) / 100 : null,
        maxPriorityFeePerGas: maxPriorityGwei ? Math.round(maxPriorityGwei * 100) / 100 : null,
        unit: "gwei",
        status: "ok",
      }];
    } catch (err) {
      return [chain, { status: "error", error: err.message }];
    }
  });

  const evmResults = await Promise.all(evmPromises);
  for (const [chain, data] of evmResults) {
    results[chain] = data;
  }

  // Solana — use public RPC
  try {
    const resp = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getRecentPrioritizationFees",
        params: [],
      }),
    });
    const data = await resp.json();
    if (data.result && data.result.length > 0) {
      const avgFee = data.result.reduce((sum, f) => sum + f.prioritizationFee, 0) / data.result.length;
      results.solana = {
        gasPrice: Math.round(avgFee * 100) / 100,
        unit: "microLamports",
        status: "ok",
      };
    } else {
      results.solana = { status: "unavailable" };
    }
  } catch (err) {
    results.solana = { status: "error", error: err.message };
  }

  return {
    gasPrices: results,
    timestamp: new Date().toISOString(),
    note: "Prices in gwei (EVM) or microLamports (Solana)",
  };
}

export async function getGasForChain(chain) {
  if (!RPCS[chain] && chain !== "solana") {
    throw new Error(`Unsupported chain: ${chain}. Use: ${Object.keys(RPCS).join(", ")}, solana`);
  }
  
  if (chain === "solana") {
    const all = await getGasPrices();
    return { chain, ...all.gasPrices.solana, timestamp: all.timestamp };
  }
  
  const provider = new ethers.JsonRpcProvider(RPCS[chain]);
  const feeData = await provider.getFeeData();
  const gwei = Number(feeData.gasPrice) / 1e9;
  
  return {
    chain,
    gasPrice: Math.round(gwei * 100) / 100,
    maxFeePerGas: feeData.maxFeePerGas ? Math.round(Number(feeData.maxFeePerGas) / 1e9 * 100) / 100 : null,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? Math.round(Number(feeData.maxPriorityFeePerGas) / 1e9 * 100) / 100 : null,
    unit: "gwei",
    timestamp: new Date().toISOString(),
  };
}
