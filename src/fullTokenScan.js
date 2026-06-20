// Full Token Scan — comprehensive token analysis combining all intelligence
// Combines: holder analysis, MEV detection, liquidity, deployer intel, token safety
// Data sources: All above modules + GoPlus + DexScreener

import { analyzeHolders } from "./holderAnalysis.js";
import { analyzeMev } from "./mevDetection.js";
import { analyzeLiquidity } from "./liquidityAnalysis.js";
import { analyzeDeployer } from "./deployerIntel.js";
import { analyzeTokenSafety } from "./tokenSafety.js";

// Quick risk aggregation
function aggregateRisk(results) {
  const scores = [];
  const allFlags = [];

  if (results.holders?.analysis?.riskScore > 0) {
    scores.push({ source: "holders", score: results.holders.analysis.riskScore });
    allFlags.push(...results.holders.analysis.flags.map(f => `[holders] ${f}`));
  }

  if (results.mev?.risk?.riskScore > 0) {
    scores.push({ source: "mev", score: results.mev.risk.riskScore });
    allFlags.push(...results.mev.risk.flags.map(f => `[mev] ${f}`));
  }

  if (results.liquidity?.health?.score !== undefined) {
    // Invert liquidity score (high liquidity = low risk)
    const liqRisk = Math.max(0, 100 - results.liquidity.health.score);
    scores.push({ source: "liquidity", score: liqRisk });
    allFlags.push(...(results.liquidity.health.flags || []).map(f => `[liquidity] ${f}`));
  }

  if (results.deployer?.risk?.riskScore > 0) {
    scores.push({ source: "deployer", score: results.deployer.risk.riskScore });
    allFlags.push(...results.deployer.risk.flags.map(f => `[deployer] ${f}`));
  }

  if (results.safety?.riskScore > 0) {
    scores.push({ source: "safety", score: results.safety.riskScore });
    if (results.safety.flags) allFlags.push(...results.safety.flags.map(f => `[safety] ${f}`));
  }

  // Weighted average (liquidity and safety matter most)
  const weights = { holders: 0.2, mev: 0.15, liquidity: 0.3, deployer: 0.15, safety: 0.2 };
  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of scores) {
    const w = weights[s.source] || 0.1;
    weightedSum += s.score * w;
    totalWeight += w;
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  let verdict;
  if (overallScore >= 70) verdict = "HIGH_RISK";
  else if (overallScore >= 40) verdict = "MODERATE_RISK";
  else if (overallScore >= 20) verdict = "LOW_RISK";
  else verdict = "SAFE";

  return {
    overallRiskScore: overallScore,
    verdict,
    flags: allFlags,
    breakdown: scores,
  };
}

// Generate human-readable summary
function generateSummary(results) {
  const parts = [];

  // Token identity
  const name = results.holders?.tokenInfo?.name || results.safety?.name || "Unknown";
  const symbol = results.holders?.tokenInfo?.symbol || results.safety?.symbol || "?";
  parts.push(`${name} (${symbol})`);

  // Holders
  if (results.holders?.tokenInfo?.totalHolders) {
    const holders = parseInt(results.holders.tokenInfo.totalHolders).toLocaleString();
    parts.push(`${holders} holders`);
  }

  // Distribution
  if (results.holders?.analysis?.distribution) {
    parts.push(`Distribution: ${results.holders.analysis.distribution}`);
  }

  // Liquidity
  if (results.liquidity?.health?.totalLiquidity) {
    const liq = parseFloat(results.liquidity.health.totalLiquidity);
    parts.push(`Liquidity: $${(liq / 1e6).toFixed(2)}M`);
  }

  // MEV
  if (results.mev?.risk?.mevExposure && results.mev.risk.mevExposure !== "none_detected") {
    parts.push(`MEV exposure: ${results.mev.risk.mevExposure}`);
  }

  // Deployer
  if (results.deployer?.contractVerified) {
    parts.push("Contract: verified");
  } else if (results.deployer && !results.deployer.contractVerified) {
    parts.push("Contract: unverified");
  }

  return parts.join(" | ");
}

// Main function
export async function fullTokenScan(chain, tokenAddress) {
  const startTime = Date.now();

  // Run all analyses in parallel (with graceful failures)
  const [holders, mev, liquidity, deployer, safety] = await Promise.allSettled([
    analyzeHolders(chain, tokenAddress).catch(() => null),
    analyzeMev(chain, tokenAddress).catch(() => null),
    analyzeLiquidity(chain, tokenAddress).catch(() => null),
    analyzeDeployer(chain, tokenAddress).catch(() => null),
    analyzeTokenSafety(chain, tokenAddress).catch(() => null),
  ]);

  const results = {
    holders: holders.status === "fulfilled" ? holders.value : null,
    mev: mev.status === "fulfilled" ? mev.value : null,
    liquidity: liquidity.status === "fulfilled" ? liquidity.value : null,
    deployer: deployer.status === "fulfilled" ? deployer.value : null,
    safety: safety.status === "fulfilled" ? safety.value : null,
  };

  const risk = aggregateRisk(results);
  const summary = generateSummary(results);
  const duration = Date.now() - startTime;

  return {
    chain,
    token: tokenAddress,
    summary,
    risk,
    holders: results.holders ? {
      totalHolders: results.holders.tokenInfo?.totalHolders,
      distribution: results.holders.analysis?.distribution,
      topHolder: results.holders.analysis?.concentration?.top1,
      whales: results.holders.analysis?.whales?.length || 0,
    } : null,
    mev: results.mev ? {
      exposure: results.mev.risk?.mevExposure,
      score: results.mev.risk?.riskScore,
      sandwiches: results.mev.detections?.sandwichAttacks?.length || 0,
      frontrunning: results.mev.detections?.frontrunning?.length || 0,
      washTrading: results.mev.detections?.washTrading?.length || 0,
    } : null,
    liquidity: results.liquidity ? {
      score: results.liquidity.health?.score,
      rating: results.liquidity.health?.rating,
      totalLiquidity: results.liquidity.health?.totalLiquidity,
      volume24h: results.liquidity.health?.totalVolume24h,
      pairs: results.liquidity.health?.pairCount,
    } : null,
    deployer: results.deployer ? {
      creator: results.deployer.creator,
      verified: results.deployer.contractVerified,
      contractName: results.deployer.contractName,
      deployments: results.deployer.deployerHistory?.totalDeployments || 0,
    } : null,
    safety: results.safety ? {
      riskScore: results.safety.riskScore,
      isHoneypot: results.safety.isHoneypot,
      isOpenSource: results.safety.isOpenSource,
    } : null,
    scanDuration: duration + "ms",
    analyzed_at: new Date().toISOString(),
  };
}
