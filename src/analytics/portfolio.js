import {
  getEthBalance,
  getTokenBalance,
  KNOWN_TOKENS,
} from "./base.js";

/**
 * Get full token portfolio for a wallet on Base
 */
export async function getPortfolio(address) {
  address = address.toLowerCase();

  // Fetch ETH + all known token balances in parallel
  const ethPromise = getEthBalance(address);
  const tokenPromises = Object.entries(KNOWN_TOKENS).map(
    async ([contractAddr, meta]) => {
      const raw = await getTokenBalance(contractAddr, address);
      return {
        contract: contractAddr,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        rawBalance: raw.toString(),
        balance: Number(raw) / 10 ** meta.decimals,
      };
    }
  );

  const [ethWei, tokenResults] = await Promise.all([ethPromise, Promise.all(tokenPromises)]);

  const ethBalance = Number(ethWei) / 1e18;

  // Filter out zero balances
  const tokens = tokenResults.filter((t) => t.rawBalance !== "0");
  const hasEth = ethWei > 0n;

  const portfolio = [];

  if (hasEth) {
    portfolio.push({
      symbol: "ETH",
      name: "Ether",
      contract: "native",
      decimals: 18,
      balance: ethBalance,
      rawBalance: ethWei.toString(),
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
    network: "base",
    timestamp: new Date().toISOString(),
    tokenCount: portfolio.length,
    portfolio,
  };
}
