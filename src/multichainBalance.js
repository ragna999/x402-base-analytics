// Multi-chain Balance — single call to get balance across all chains
// Uses native fetch + JSON-RPC (no ethers dependency)

const CHAINS = {
  ethereum: { rpc: "https://ethereum-rpc.publicnode.com", name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io" },
  base: { rpc: "https://mainnet.base.org", name: "Base", symbol: "ETH", explorer: "https://basescan.org" },
  arbitrum: { rpc: "https://arb1.arbitrum.io/rpc", name: "Arbitrum", symbol: "ETH", explorer: "https://arbiscan.io" },
  optimism: { rpc: "https://mainnet.optimism.io", name: "Optimism", symbol: "ETH", explorer: "https://optimistic.etherscan.io" },
  polygon: { rpc: "https://polygon-bor-rpc.publicnode.com", name: "Polygon", symbol: "POL", explorer: "https://polygonscan.com" },
};

const STABLECOINS = {
  base: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18 },
  },
  ethereum: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
    "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
    "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  },
  arbitrum: {
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
    "0xfd086bccd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  },
  optimism: {
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": { symbol: "USDC", decimals: 6 },
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": { symbol: "USDT", decimals: 6 },
  },
  polygon: {
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { symbol: "USDC", decimals: 6 },
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { symbol: "USDT", decimals: 6 },
  },
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

function hexToEth(hex) {
  if (!hex || hex === "0x") return 0;
  return Number(BigInt(hex)) / 1e18;
}

function formatAmount(raw, decimals) {
  return (Number(raw) / Math.pow(10, decimals)).toFixed(2);
}

async function getStablecoinBalances(rpc, wallet, stablecoins) {
  const ERC20_BALANCE = "0x70a08231";
  const paddedWallet = "0x" + wallet.toLowerCase().replace("0x", "").padStart(64, "0");
  const balances = [];

  const promises = Object.entries(stablecoins).map(async ([addr, info]) => {
    try {
      const data = ERC20_BALANCE + paddedWallet;
      const hex = await rpcCall(rpc, "eth_call", [{ to: addr, data }, "latest"]);
      if (!hex || hex === "0x") return null;
      const raw = BigInt(hex);
      if (raw === 0n) return null;
      const human = Number(raw) / Math.pow(10, info.decimals);
      if (human > 0.01) {
        return { address: addr, symbol: info.symbol, balance: human.toFixed(2), value: `$${human.toFixed(2)}` };
      }
      return null;
    } catch { return null; }
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

export async function getMultichainBalance(walletAddress) {
  const wallet = walletAddress.toLowerCase();
  const balances = {};

  const promises = Object.entries(CHAINS).map(async ([key, config]) => {
    try {
      const [nativeHex, stables] = await Promise.all([
        rpcCall(config.rpc, "eth_getBalance", [wallet, "latest"]),
        getStablecoinBalances(config.rpc, wallet, STABLECOINS[key] || {}),
      ]);

      const nativeBalance = hexToEth(nativeHex);
      const stableTotal = stables.reduce((sum, s) => sum + parseFloat(s.balance), 0);

      return [key, {
        chain: config.name,
        native: { symbol: config.symbol, balance: nativeBalance.toFixed(6) },
        stablecoins: stables,
        stablecoinTotal: `$${stableTotal.toFixed(2)}`,
        explorer: `${config.explorer}/address/${walletAddress}`,
        status: "ok",
      }];
    } catch (err) {
      return [key, { chain: config.name, status: "error", error: err.message }];
    }
  });

  const results = await Promise.all(promises);
  for (const [key, data] of results) balances[key] = data;

  let totalStable = 0;
  for (const data of Object.values(balances)) {
    if (data.status === "ok") totalStable += parseFloat(data.stablecoinTotal.replace("$", ""));
  }

  return {
    wallet: walletAddress,
    chains: balances,
    summary: {
      chainsQueried: Object.keys(CHAINS).length,
      chainsResponded: Object.values(balances).filter(b => b.status === "ok").length,
      totalStablecoinValue: `$${totalStable.toFixed(2)}`,
    },
    timestamp: new Date().toISOString(),
  };
}
