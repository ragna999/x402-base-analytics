// Gas Tracker — real-time gas prices across chains
// Uses native fetch + JSON-RPC (no ethers dependency)

const RPCS = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum-rpc.publicnode.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  optimism: "https://mainnet.optimism.io",
  polygon: "https://polygon-bor-rpc.publicnode.com",
};

async function rpcCall(url, method, params = []) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function hexToGwei(hex) {
  if (!hex || hex === "0x0") return 0;
  return Math.round(parseInt(hex, 16) / 1e9 * 100) / 100;
}

export async function getGasPrices() {
  const results = {};

  const evmPromises = Object.entries(RPCS).map(async ([chain, rpc]) => {
    try {
      const [gasPrice, feeHistory] = await Promise.all([
        rpcCall(rpc, "eth_gasPrice"),
        rpcCall(rpc, "eth_feeHistory", ["0x4", "latest", [25, 75]]).catch(() => null),
      ]);

      const baseFee = hexToGwei(gasPrice);
      let maxFee = baseFee;
      let priority = 0;

      if (feeHistory && feeHistory.baseFeePerGas) {
        const latestBase = hexToGwei(feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]);
        maxFee = Math.round((latestBase + priority) * 100) / 100;
      }

      return [chain, {
        gasPrice: baseFee,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: priority,
        unit: "gwei",
        status: "ok",
      }];
    } catch (err) {
      return [chain, { status: "error", error: err.message }];
    }
  });

  const evmResults = await Promise.all(evmPromises);
  for (const [chain, data] of evmResults) results[chain] = data;

  // Solana
  try {
    const resp = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [] }),
    });
    const data = await resp.json();
    if (data.result && data.result.length > 0) {
      const avg = data.result.reduce((s, f) => s + f.prioritizationFee, 0) / data.result.length;
      results.solana = { gasPrice: Math.round(avg * 100) / 100, unit: "microLamports", status: "ok" };
    } else {
      results.solana = { status: "unavailable" };
    }
  } catch (err) {
    results.solana = { status: "error", error: err.message };
  }

  return { gasPrices: results, timestamp: new Date().toISOString(), note: "gwei (EVM) / microLamports (Solana)" };
}

export async function getGasForChain(chain) {
  if (!RPCS[chain] && chain !== "solana") {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  if (chain === "solana") {
    const all = await getGasPrices();
    return { chain, ...all.gasPrices.solana, timestamp: all.timestamp };
  }
  const hex = await rpcCall(RPCS[chain], "eth_gasPrice");
  const gwei = hexToGwei(hex);
  return { chain, gasPrice: gwei, unit: "gwei", timestamp: new Date().toISOString() };
}
