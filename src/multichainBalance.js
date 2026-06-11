// Multi-chain Balance — single call to get balance across all chains
import { ethers } from "ethers";

const CHAINS = {
  ethereum: {
    rpc: "https://ethereum-rpc.publicnode.com",
    name: "Ethereum",
    symbol: "ETH",
    explorer: "https://etherscan.io",
  },
  base: {
    rpc: "https://mainnet.base.org",
    name: "Base",
    symbol: "ETH",
    explorer: "https://basescan.org",
  },
  arbitrum: {
    rpc: "https://arb1.arbitrum.io/rpc",
    name: "Arbitrum",
    symbol: "ETH",
    explorer: "https://arbiscan.io",
  },
  optimism: {
    rpc: "https://mainnet.optimism.io",
    name: "Optimism",
    symbol: "ETH",
    explorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    rpc: "https://polygon-bor-rpc.publicnode.com",
    name: "Polygon",
    symbol: "POL",
    explorer: "https://polygonscan.com",
  },
};

// Common stablecoin addresses per chain
const STABLECOINS = {
  base: {
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { symbol: "USDC", decimals: 6 },
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": { symbol: "DAI", decimals: 18 },
  },
  ethereum: {
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": { symbol: "USDC", decimals: 6 },
    "0xdAC17F958D2ee523a2206206994597C13D831ec7": { symbol: "USDT", decimals: 6 },
    "0x6B175474E89094C44Da98b954EedeAC495271d0F": { symbol: "DAI", decimals: 18 },
  },
  arbitrum: {
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": { symbol: "USDC", decimals: 6 },
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": { symbol: "USDT", decimals: 6 },
    "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1": { symbol: "DAI", decimals: 18 },
  },
  optimism: {
    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85": { symbol: "USDC", decimals: 6 },
    "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58": { symbol: "USDT", decimals: 6 },
  },
  polygon: {
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": { symbol: "USDC", decimals: 6 },
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": { symbol: "USDT", decimals: 6 },
  },
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
];

async function getStablecoinBalances(provider, wallet, stablecoins) {
  const balances = [];
  const promises = Object.entries(stablecoins).map(async ([addr, info]) => {
    try {
      const contract = new ethers.Contract(addr, ERC20_ABI, provider);
      const bal = await contract.balanceOf(wallet);
      const human = Number(ethers.formatUnits(bal, info.decimals));
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
  const wallet = ethers.getAddress(walletAddress);
  const balances = {};

  const promises = Object.entries(CHAINS).map(async ([key, config]) => {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpc);
      const [nativeBal, stables] = await Promise.all([
        provider.getBalance(wallet),
        getStablecoinBalances(provider, wallet, STABLECOINS[key] || {}),
      ]);

      const nativeHuman = Number(ethers.formatEther(nativeBal));
      const stableTotal = stables.reduce((sum, s) => sum + parseFloat(s.balance), 0);

      return [key, {
        chain: config.name,
        native: {
          symbol: config.symbol,
          balance: nativeHuman.toFixed(6),
          raw: nativeBal.toString(),
        },
        stablecoins: stables,
        stablecoinTotal: `$${stableTotal.toFixed(2)}`,
        explorer: `${config.explorer}/address/${wallet}`,
        status: "ok",
      }];
    } catch (err) {
      return [key, { chain: config.name, status: "error", error: err.message }];
    }
  });

  const results = await Promise.all(promises);
  for (const [key, data] of results) {
    balances[key] = data;
  }

  // Calculate totals
  let totalNativeValue = 0;
  let totalStableValue = 0;
  
  for (const [key, data] of Object.entries(balances)) {
    if (data.status === "ok") {
      totalStableValue += parseFloat(data.stablecoinTotal.replace("$", ""));
    }
  }

  return {
    wallet,
    chains: balances,
    summary: {
      chainsQueried: Object.keys(CHAINS).length,
      chainsResponded: Object.values(balances).filter(b => b.status === "ok").length,
      totalStablecoinValue: `$${totalStableValue.toFixed(2)}`,
    },
    timestamp: new Date().toISOString(),
  };
}
