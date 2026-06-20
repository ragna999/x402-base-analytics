// Deployer Intel — Contract creator analysis
// Data sources: Blockscout API (free, no key), Sourcify (free)
// Supports: Base, Arbitrum, Polygon, Avalanche, Celo

import { CHAINS } from "./chains.js";

const SOURCIFY_API = "https://sourcify.dev/server";

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

// Get contract creator from Blockscout (uses /addresses endpoint, not /smart-contracts)
async function getCreatorFromBlockscout(chain, address) {
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return null;

  const data = await fetchWithFallback(`${config.explorer}/addresses/${address}`);
  if (!data) return null;

  return {
    creator: data.creator_address_hash || null,
    creationTx: data.creation_tx_hash || null,
    verified: data.is_verified || false,
    isContract: data.is_contract || false,
    contractName: data.name || null,
    token: data.token || null,
  };
}

// Get creator from Sourcify (works for verified contracts on any chain)
async function getSourcifyInfo(chainId, address) {
  try {
    const data = await fetchWithFallback(
      `${SOURCIFY_API}/files/any/${chainId}/${address}`,
      8000
    );
    if (!data || !data.files) return null;

    const metadata = data.files.find(f => f.name === "metadata.json");
    if (!metadata) return { verified: true, hasMetadata: false };

    const meta = JSON.parse(metadata.content);
    const compiler = meta.compiler?.version || null;
    const language = meta.language || null;
    const sources = meta.sources ? Object.keys(meta.sources) : [];

    return {
      verified: true,
      hasMetadata: true,
      compiler,
      language,
      sourceFiles: sources.length,
      sourceNames: sources.slice(0, 10),
    };
  } catch {
    return null;
  }
}

// Get other contracts deployed by the same address via Blockscout
async function getOtherDeployments(chain, creatorAddress) {
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return [];

  // Blockscout v2: get transactions from creator (no limit param — returns ~50)
  const data = await fetchWithFallback(
    `${config.explorer}/addresses/${creatorAddress}/transactions`
  );

  if (!data || !data.items) return [];

  // Contract creation = to is null
  return data.items
    .filter(tx => !tx.to && tx.created_contract?.hash)
    .map(tx => ({
      address: tx.created_contract.hash,
      name: tx.created_contract.name || null,
      isVerified: tx.created_contract.is_verified || false,
      timestamp: tx.timestamp,
      txHash: tx.hash,
    }))
    .slice(0, 20);
}

// Flag suspicious patterns
function analyzeDeployerRisk(deployments) {
  const flags = [];
  let riskScore = 0;

  const total = deployments.length;
  const verified = deployments.filter(d => d.isVerified).length;
  const unverified = total - verified;
  const verificationRate = total > 0 ? (verified / total) * 100 : 0;

  if (total > 10) {
    flags.push("PROLIFIC_DEPLOYER");
    riskScore += 15;
  }

  if (total > 20) {
    flags.push("FACTORY_PATTERN");
    riskScore += 10;
  }

  if (unverified > 3 && verificationRate < 50) {
    flags.push("LOW_VERIFICATION");
    riskScore += 25;
  }

  if (total === 0) {
    flags.push("NO_HISTORY");
    riskScore += 5;
  }

  // Check for rapid deployment (multiple in same day)
  const timestamps = deployments.map(d => new Date(d.timestamp).getTime()).sort();
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] < 3600000) { // within 1 hour
      flags.push("RAPID_DEPLOYMENT");
      riskScore += 20;
      break;
    }
  }

  return {
    riskScore: Math.min(riskScore, 100),
    flags,
    stats: {
      totalDeployments: total,
      verified,
      unverified,
      verificationRate: Math.round(verificationRate),
    },
  };
}

// Main function
export async function analyzeDeployer(chain, contractAddress) {
  const config = CHAINS[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  // Get creator info from Blockscout
  const creatorInfo = await getCreatorFromBlockscout(chain, contractAddress);

  // Get Sourcify verification
  const sourcifyInfo = await getSourcifyInfo(config.chainId, contractAddress.toLowerCase());

  const result = {
    chain,
    contract: contractAddress,
    contractName: creatorInfo?.contractName || null,
    isToken: !!creatorInfo?.token,
    tokenInfo: creatorInfo?.token ? {
      name: creatorInfo.token.name,
      symbol: creatorInfo.token.symbol,
      type: creatorInfo.token.type,
      holders: creatorInfo.token.holders_count,
      marketCap: creatorInfo.token.circulating_market_cap,
    } : null,
    creator: creatorInfo?.creator || null,
    creationTx: creatorInfo?.creationTx || null,
    contractVerified: creatorInfo?.verified || sourcifyInfo?.verified || false,
    verificationSource: creatorInfo?.verified
      ? "blockscout"
      : sourcifyInfo?.verified
      ? "sourcify"
      : "none",
    compiler: sourcifyInfo?.compiler || null,
    language: sourcifyInfo?.language || null,
    sourceFiles: sourcifyInfo?.sourceFiles || null,
    deployerHistory: null,
    risk: null,
  };

  // If we found the creator, get their deployment history
  if (result.creator) {
    const otherContracts = await getOtherDeployments(chain, result.creator);
    const risk = analyzeDeployerRisk(otherContracts);

    result.deployerHistory = {
      creatorAddress: result.creator,
      totalDeployments: otherContracts.length,
      contracts: otherContracts,
    };
    result.risk = risk;
  }

  return result;
}
