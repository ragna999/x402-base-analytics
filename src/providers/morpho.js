// Morpho Blue vaults on Base
// Docs: https://developers.morpho.org
const MORPHO_API = "https://api.morpho.org/graphql";

// Top Morpho vaults on Base (curated list for reliability)
const BASE_VAULTS = [
  // Steakhouse USDC
  "0xbeeF010f9cb27031ad51e3343d64f31767602778",
  // Gauntlet USDC
  "0x23b6Abb68a36D697661d64709B7b465f6f2E862b",
  // Re7 USDC
  "0xA0898e3E2F5D5E5c8e1d7dB3D46d5e5e6Dc6e5C2",
  // Moonwell Flagship USDC
  "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
  // Steakhouse WETH
  "0x7F5cA0C2D02f4f931EdB6A13e4C62e2b2fD3D5cD",
];

/**
 * Fetch Morpho vault data via their GraphQL API
 */
export async function getMorphoYields() {
  const query = `{
    vaults(where: { chainId_in: [8453] }, first: 50, orderBy: TotalAssetsUsd, orderDirection: desc) {
      items {
        address
        name
        symbol
        chain { id }
        state {
          apy
          totalAssetsUsd
          totalAssets
          asset { symbol address decimals }
        }
      }
    }
  }`;

  try {
    const res = await fetch(MORPHO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) throw new Error(`Morpho API: ${res.status}`);
    const data = await res.json();

    const vaults = data?.data?.vaults?.items || [];

    return vaults
      .filter((v) => v.chain?.id === 8453)
      .map((v) => ({
        protocol: "morpho",
        name: v.name || v.symbol,
        vault: v.address,
        asset: v.state?.asset?.symbol || "UNKNOWN",
        assetAddress: v.state?.asset?.address,
        apy: v.state?.apy ? Number(v.state.apy) * 100 : null,
        tvlUsd: v.state?.totalAssetsUsd ? Number(v.state.totalAssetsUsd) : null,
        chain: "base",
      }))
      .filter((v) => v.apy !== null && v.apy > 0);
  } catch (err) {
    console.error("Morpho fetch error:", err.message);
    return [];
  }
}
