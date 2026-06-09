import {
  getNativeBalance,
  getTokenBalance,
  getChain,
  CHAINS,
} from "../chains.js";

// Known tokens per chain
const CHAIN_TOKENS = {
  base: {
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { symbol: "USDC", name: "USD Coin", decimals: 6 },
    "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6Ca": { symbol: "USDbC", name: "Bridged USDC", decimals: 6 },
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": { symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    "0x4200000000000000000000000000000000000006": { symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": { symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", decimals: 18 },
    "0x940181a94A35A4569E4529A3CDfB74e38FD98631": { symbol: "AERO", name: "Aerodrome", decimals: 18 },
    "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed": { symbol: "DEGEN", name: "Degen", decimals: 18 },
    "0x532f27101965dd16442E59d40670FaF5eBB142E4": { symbol: "BRETT", name: "Brett", decimals: 18 },
    "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4": { symbol: "TOSHI", name: "Toshi", decimals: 18 },
    "0x27D2DECb5b959967786d6B532b30A4edB6734101": { symbol: "BALD", name: "Bald", decimals: 18 },
  },
  arbitrum: {
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": { symbol: "USDC", name: "USD Coin", decimals: 6 },
    "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8": { symbol: "USDC.e", name: "Bridged USDC", decimals: 6 },
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": { symbol: "USDT", name: "Tether USD", decimals: 6 },
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": { symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    "0x912CE59144191C1204E64559FE8253a0e49E6548": { symbol: "ARB", name: "Arbitrum", decimals: 18 },
    "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a": { symbol: "GMX", name: "GMX", decimals: 18 },
    "0x5402B5F40310bDED796c7D0F3FF6683f5C0cFfdf": { symbol: "sGLP", name: "Staked GLP", decimals: 18 },
    "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f": { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8 },
    "0xFEa7a6a0B346362BF88A9e4A88416B77a57FF6CA": { symbol: "MAGIC", name: "MAGIC", decimals: 18 },
    "0x5979D7b546E38E9Ab8097Bc10a59136E7Bc83422": { symbol: "wstETH", name: "Wrapped stETH", decimals: 18 },
  },
  polygon: {
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": { symbol: "USDC.e", name: "Bridged USDC", decimals: 6 },
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": { symbol: "USDC", name: "USD Coin", decimals: 6 },
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": { symbol: "USDT", name: "Tether USD", decimals: 6 },
    "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619": { symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270": { symbol: "WMATIC", name: "Wrapped MATIC", decimals: 18 },
    "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6": { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8 },
  },
  avalanche: {
    "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E": { symbol: "USDC", name: "USD Coin", decimals: 6 },
    "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7": { symbol: "USDT", name: "Tether USD", decimals: 6 },
    "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7": { symbol: "WAVAX", name: "Wrapped AVAX", decimals: 18 },
    "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB": { symbol: "WETH.e", name: "Wrapped Ether", decimals: 18 },
    "0x50b7545627a5162F82A992c33b87aDc75187B218": { symbol: "WBTC.e", name: "Wrapped Bitcoin", decimals: 8 },
  },
  celo: {
    "0x765DE816845861e75A25fCA122bb6898B8B1282a": { symbol: "cUSD", name: "Celo Dollar", decimals: 18 },
    "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73": { symbol: "cEUR", name: "Celo Euro", decimals: 18 },
    "0x471EcE3750Da237f93B8E339c536989b8978a438": { symbol: "CELO", name: "Celo", decimals: 18 },
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": { symbol: "USDT", name: "Tether USD", decimals: 6 },
  },
};

/**
 * Get full token portfolio for a wallet on any supported chain
 * @param {string} chainSlug - Chain identifier (base, arbitrum, polygon, etc.)
 * @param {string} address - Wallet address
 */
export async function getPortfolio(chainSlug, address) {
  address = address.toLowerCase();
  const chain = getChain(chainSlug);
  const knownTokens = CHAIN_TOKENS[chainSlug] || {};

  // Fetch native token balance
  const nativeWei = await getNativeBalance(chainSlug, address);

  // Fetch token balances sequentially to avoid rate limits
  const tokenResults = [];
  for (const [contractAddr, meta] of Object.entries(knownTokens)) {
    try {
      const raw = await getTokenBalance(chainSlug, contractAddr, address);
      tokenResults.push({
        contract: contractAddr,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        rawBalance: raw.toString(),
        balance: Number(raw) / 10 ** meta.decimals,
      });
    } catch (e) {
      tokenResults.push({
        contract: contractAddr,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        rawBalance: "0",
        balance: 0,
        error: e.message,
      });
    }
  }

  const nativeBalance = Number(nativeWei) / 1e18;
  const tokens = tokenResults.filter((t) => t.rawBalance !== "0");
  const hasNative = nativeWei > 0n;

  const portfolio = [];

  if (hasNative) {
    portfolio.push({
      symbol: chain.nativeCurrency,
      name: chain.nativeCurrency,
      contract: "native",
      decimals: 18,
      balance: nativeBalance,
      rawBalance: nativeWei.toString(),
    });
  }

  portfolio.push(
    ...tokens.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      contract: t.contract,
      decimals: t.decimals,
      balance: t.balance,
      rawBalance: t.rawBalance,
    }))
  );

  return {
    address,
    network: chainSlug,
    chainName: chain.name,
    timestamp: new Date().toISOString(),
    tokenCount: portfolio.length,
    portfolio,
  };
}
