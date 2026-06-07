// Common constants and helpers for Base chain
export const BASE_RPC = "https://mainnet.base.org";

// Top tokens on Base (address -> metadata)
export const KNOWN_TOKENS = {
  // USDC
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": {
    symbol: "USDC", name: "USD Coin", decimals: 6,
  },
  // USDbC (Bridged USDC)
  "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6Ca": {
    symbol: "USDbC", name: "Bridged USDC", decimals: 6,
  },
  // DAI
  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb": {
    symbol: "DAI", name: "Dai Stablecoin", decimals: 18,
  },
  // WETH
  "0x4200000000000000000000000000000000000006": {
    symbol: "WETH", name: "Wrapped Ether", decimals: 18,
  },
  // cbETH
  "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22": {
    symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", decimals: 18,
  },
  // AERO
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631": {
    symbol: "AERO", name: "Aerodrome", decimals: 18,
  },
  // DEGEN
  "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed": {
    symbol: "DEGEN", name: "Degen", decimals: 18,
  },
  // BRETT
  "0x532f27101965dd16442E59d40670FaF5eBB142E4": {
    symbol: "BRETT", name: "Brett", decimals: 18,
  },
  // TOSHI
  "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4": {
    symbol: "TOSHI", name: "Toshi", decimals: 18,
  },
  // BALD
  "0x27D2DECb5b959967786d6B532b30A4edB6734101": {
    symbol: "BALD", name: "Bald", decimals: 18,
  },
};

export const ERC20_BALANCEOF = "0x70a08231"; // balanceOf(address)

/**
 * Make an RPC call to Base
 */
export async function rpcCall(method, params) {
  const res = await fetch(BASE_RPC, {
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

/**
 * Get ETH balance in wei
 */
export async function getEthBalance(address) {
  const hex = await rpcCall("eth_getBalance", [address, "latest"]);
  return BigInt(hex);
}

/**
 * Get ERC-20 token balance
 */
export async function getTokenBalance(tokenAddress, walletAddress) {
  const data = `${ERC20_BALANCEOF}${padAddress(walletAddress)}`;
  const hex = await rpcCall("eth_call", [{ to: tokenAddress, data }, "latest"]);
  return BigInt(hex);
}
