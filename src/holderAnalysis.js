// Token Holder Analysis — concentration, whales, distribution
// Data sources: Blockscout API (free, no key)
// Supports: Base, Arbitrum, Polygon, Avalanche, Celo

import { CHAINS } from "./chains.js";

async function fetchJSON(url, timeout = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchWithFallback(url, timeout = 8000) {
  try {
    return await fetchJSON(url, timeout);
  } catch {
    return null;
  }
}

// Get token info (name, symbol, decimals, totalSupply)
async function getTokenInfo(chain, address) {
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return null;
  const data = await fetchWithFallback(`${config.explorer}/tokens/${address}`);
  if (!data) return null;
  return {
    name: data.name || null,
    symbol: data.symbol || null,
    decimals: parseInt(data.decimals || "18"),
    totalSupply: data.total_supply || "0",
    holders: data.holders_count || "0",
    exchangeRate: data.exchange_rate || null,
    type: data.type || "ERC-20",
  };
}

// Get top holders from Blockscout
async function getTopHolders(chain, address, limit = 50) {
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return [];
  const data = await fetchWithFallback(`${config.explorer}/tokens/${address}/holders`);
  if (!data || !data.items) return [];
  return data.items.slice(0, limit).map(item => ({
    address: item.address?.hash || null,
    isContract: item.address?.is_contract || false,
    name: item.address?.name || null,
    ens: item.address?.ens_domain_name || null,
    value: item.value || "0",
    tokenId: item.token_id || null,
  }));
}

// Known labels for common addresses
const KNOWN_LABELS = {
  // Base
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x33128a8fC17869897dcE68Ed026d694621f6FDfD": "Base Bridge",
  "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e": "Base Portal",
  // Aerodrome
  "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43": "Aerodrome Voter",
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631": "Aerodrome (AERO)",
  // Uniswap
  "0x2626664c2603336E57B271c5C0b26F421741e481": "Uniswap Universal Router",
  "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD": "Uniswap Universal Router V2",
};

function getLabel(address, name) {
  const addr = address?.toLowerCase();
  for (const [known, label] of Object.entries(KNOWN_LABELS)) {
    if (known.toLowerCase() === addr) return label;
  }
  return name || null;
}

// Calculate concentration metrics
function analyzeConcentration(holders, totalSupply, decimals) {
  const supplyNum = parseFloat(totalSupply) / Math.pow(10, decimals);
  const holderValues = holders.map(h => ({
    ...h,
    balance: parseFloat(h.value) / Math.pow(10, decimals),
  }));

  // Calculate percentages
  for (const h of holderValues) {
    h.percent = supplyNum > 0 ? (h.balance / supplyNum) * 100 : 0;
  }

  // Sort by balance descending
  holderValues.sort((a, b) => b.balance - a.balance);

  // Concentration metrics
  const top10Percent = holderValues.slice(0, 10).reduce((sum, h) => sum + h.percent, 0);
  const top20Percent = holderValues.slice(0, 20).reduce((sum, h) => sum + h.percent, 0);
  const top50Percent = holderValues.slice(0, 50).reduce((sum, h) => sum + h.percent, 0);

  // Whale detection (holdings > 1% of supply)
  const whales = holderValues.filter(h => h.percent > 1).map(h => ({
    address: h.address,
    label: getLabel(h.address, h.name),
    balance: h.balance.toFixed(4),
    percent: h.percent.toFixed(2) + "%",
    isContract: h.isContract,
  }));

  // Risk scoring
  let riskScore = 0;
  const flags = [];

  if (top10Percent > 90) {
    riskScore += 40;
    flags.push("EXTREME_CONCENTRATION_TOP10");
  } else if (top10Percent > 70) {
    riskScore += 25;
    flags.push("HIGH_CONCENTRATION_TOP10");
  } else if (top10Percent > 50) {
    riskScore += 10;
    flags.push("MODERATE_CONCENTRATION_TOP10");
  }

  if (whales.length > 0 && whales[0].percent.replace("%", "") > 50) {
    riskScore += 30;
    flags.push("SINGLE_WHALE_DOMINANCE");
  }

  if (whales.length > 5) {
    riskScore += 10;
    flags.push("MANY_WHALES");
  }

  // Contract holders (could be team, treasury, etc.)
  const contractHolders = holderValues.filter(h => h.isContract);
  const contractPercent = contractHolders.reduce((sum, h) => sum + h.percent, 0);
  if (contractPercent > 30) {
    riskScore += 10;
    flags.push("HIGH_CONTRACT_HOLDINGS");
  }

  riskScore = Math.min(riskScore, 100);

  // Distribution classification
  let distribution;
  if (top10Percent > 90) distribution = "highly_concentrated";
  else if (top10Percent > 70) distribution = "concentrated";
  else if (top10Percent > 50) distribution = "moderate";
  else if (top10Percent > 30) distribution = "distributed";
  else distribution = "well_distributed";

  return {
    distribution,
    riskScore,
    flags,
    concentration: {
      top1: holderValues[0] ? { address: holderValues[0].address, label: getLabel(holderValues[0].address, holderValues[0].name), percent: holderValues[0].percent.toFixed(2) + "%" } : null,
      top5: top10Percent.toFixed(2) + "% (top 5 shown in holders)",
      top10: top10Percent.toFixed(2) + "%",
      top20: top20Percent.toFixed(2) + "%",
      top50: top50Percent.toFixed(2) + "%",
    },
    whales,
    contractHolders: contractHolders.length,
    contractPercent: contractPercent.toFixed(2) + "%",
  };
}

// Main function
export async function analyzeHolders(chain, tokenAddress) {
  const config = CHAINS[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  // Fetch token info and holders in parallel
  const [tokenInfo, rawHolders] = await Promise.all([
    getTokenInfo(chain, tokenAddress),
    getTopHolders(chain, tokenAddress, 50),
  ]);

  if (!tokenInfo) throw new Error("Token not found");
  if (rawHolders.length === 0) {
    return {
      chain,
      token: tokenAddress,
      tokenInfo,
      holders: [],
      analysis: { distribution: "unknown", riskScore: 0, flags: ["NO_HOLDER_DATA"], whales: [] },
    };
  }

  const analysis = analyzeConcentration(rawHolders, tokenInfo.totalSupply, tokenInfo.decimals);

  // Format holders with percentages
  const supplyNum = parseFloat(tokenInfo.totalSupply) / Math.pow(10, tokenInfo.decimals);
  const holders = rawHolders.map((h, i) => {
    const balance = parseFloat(h.value) / Math.pow(10, tokenInfo.decimals);
    const percent = supplyNum > 0 ? (balance / supplyNum) * 100 : 0;
    return {
      rank: i + 1,
      address: h.address,
      label: getLabel(h.address, h.name),
      balance: balance.toFixed(4),
      percent: percent.toFixed(2) + "%",
      isContract: h.isContract,
    };
  });

  return {
    chain,
    token: tokenAddress,
    tokenInfo: {
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      type: tokenInfo.type,
      totalHolders: tokenInfo.holders,
      exchangeRate: tokenInfo.exchangeRate,
    },
    holders,
    analysis,
    analyzed_at: new Date().toISOString(),
  };
}
