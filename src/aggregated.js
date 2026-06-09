/**
 * RagRadar Aggregator — Combine multiple data sources into unified views
 * 
 * These endpoints aggregate data from multiple modules to provide
 * comprehensive analytics in a single call.
 */

import { analyzeTokenSafety } from "./tokenSafety.js";
import { analyzeWalletRisk } from "./walletRisk.js";
import { getPortfolio } from "./analytics/portfolio.js";
import { getTxHistory } from "./analytics/history.js";
import { getWalletSummary } from "./analytics/summary.js";
import { analyzeSmartMoneyWallet, analyzeTokenSmartMoney, getSmartMoneyActivity } from "./smartMoney.js";
import { getTokenSnipers, getWalletSniperRecord, getTrendingSnipers } from "./sniper.js";
import { getTokenWhaleActivity, getWhaleHeatmap, getAccumulationSignals } from "./whaleAlerts.js";
import { getBaseProtocolStats, getBaseMovers } from "./protocolStats.js";
import { getAllYields, getBestYieldsForAsset } from "./aggregator.js";

// --- Helpers ---

function safeCall(fn, ...args) {
  return fn(...args).catch(err => ({ error: err.message }));
}

function mergeResults(...results) {
  return Object.assign({}, ...results.filter(r => r && !r.error));
}

// --- Aggregated Endpoints ---

/**
 * Token Intelligence — Complete analysis of a token
 * Combines: safety + whale activity + smart money + snipers
 */
export async function getTokenIntelligence(tokenAddress) {
  const [safety, whaleActivity, smartMoney, snipers] = await Promise.all([
    safeCall(analyzeTokenSafety, tokenAddress),
    safeCall(getTokenWhaleActivity, tokenAddress, { limit: 10 }),
    safeCall(analyzeTokenSmartMoney, tokenAddress, { maxBuyers: 10 }),
    safeCall(getTokenSnipers, tokenAddress, { maxBuyers: 10 }),
  ]);

  // Calculate composite score
  const safetyScore = safety.riskScore ?? 50;
  const whaleRisk = whaleActivity.riskScore ?? 50;
  const smartMoneySignal = smartMoney.signalStrength === "STRONG" ? 20 :
                           smartMoney.signalStrength === "MODERATE" ? 40 :
                           smartMoney.signalStrength === "WEAK" ? 60 : 50;
  const sniperScore = snipers.snipers?.length > 0 ? 30 : 60;

  const compositeScore = Math.round(
    (safetyScore * 0.3) +
    (whaleRisk * 0.3) +
    (smartMoneySignal * 0.2) +
    (sniperScore * 0.2)
  );

  const verdict = compositeScore >= 70 ? "HIGH RISK — Avoid" :
                  compositeScore >= 50 ? "MODERATE RISK — Caution" :
                  compositeScore >= 30 ? "LOW RISK — Looks OK" :
                  "VERY LOW RISK — Strong signals";

  return {
    token: tokenAddress,
    timestamp: new Date().toISOString(),
    compositeScore,
    verdict,
    breakdown: {
      safety: {
        score: safety.riskScore,
        flags: safety.flags || [],
        verdict: safety.verdict,
      },
      whaleActivity: {
        score: whaleActivity.riskScore,
        concentration: whaleActivity.concentration,
        topHolders: whaleActivity.topHolders?.slice(0, 5) || [],
        flags: whaleActivity.flags || [],
      },
      smartMoney: {
        signal: smartMoney.signalStrength,
        buyers: smartMoney.buyers?.slice(0, 5) || [],
        totalBuyers: smartMoney.totalBuyers || 0,
      },
      snipers: {
        count: snipers.snipers?.length || 0,
        topSnipers: snipers.snipers?.slice(0, 3) || [],
      },
    },
    dataSources: ["GoPlus", "Blockscout", "GeckoTerminal", "DexScreener"],
  };
}

/**
 * Market Pulse — Real-time market overview
 * Combines: trending + whale heatmap + smart money activity + protocol stats
 */
export async function getMarketPulse() {
  const [whaleHeatmap, smartMoneyActivity, protocolStats, movers, yields] = await Promise.all([
    safeCall(getWhaleHeatmap, { limit: 10 }),
    safeCall(getSmartMoneyActivity),
    safeCall(getBaseProtocolStats),
    safeCall(getBaseMovers),
    safeCall(getAllYields),
  ]);

  // Extract top opportunities
  const topWhalePicks = (whaleHeatmap.heatmap || [])
    .filter(t => t.whaleScore >= 60)
    .slice(0, 5);

  const topSmartMoneyPicks = (smartMoneyActivity.activities || [])
    .slice(0, 5);

  const topMovers = (movers.movers || []).slice(0, 5);

  return {
    timestamp: new Date().toISOString(),
    summary: {
      whaleActivity: whaleHeatmap.count || 0,
      smartMoneyWallets: smartMoneyActivity.smartMoneyWallets || 0,
      totalProtocols: protocolStats.totalProtocols || 0,
      baseTvl: protocolStats.totalTvl || 0,
    },
    topWhalePicks,
    topSmartMoneyPicks,
    topMovers,
    yields: {
      totalPools: yields.count || 0,
      topYields: (yields.yields || []).slice(0, 5),
    },
    dataSources: ["GeckoTerminal", "Blockscout", "DeFiLlama"],
  };
}

/**
 * Wallet Intelligence — Complete wallet analysis
 * Combines: portfolio + smart money score + sniper record + risk
 */
export async function getWalletIntelligence(walletAddress) {
  const [portfolio, smartMoneyScore, sniperRecord, risk] = await Promise.all([
    safeCall(getPortfolio, walletAddress),
    safeCall(analyzeSmartMoneyWallet, walletAddress),
    safeCall(getWalletSniperRecord, walletAddress),
    safeCall(analyzeWalletRisk, walletAddress),
  ]);

  // Calculate composite profile
  const smScore = smartMoneyScore.score ?? 0;
  const sniperScore = sniperRecord.score ?? 0;
  const riskScore = risk.riskScore ?? 50;

  const profile = smScore >= 70 ? "SMART MONEY" :
                  smScore >= 50 ? "ACTIVE TRADER" :
                  smScore >= 30 ? "CASUAL" : "INACTIVE";

  const activityLevel = sniperRecord.snipedTokens?.length > 5 ? "VERY ACTIVE" :
                        sniperRecord.snipedTokens?.length > 2 ? "ACTIVE" :
                        "LOW ACTIVITY";

  return {
    wallet: walletAddress,
    timestamp: new Date().toISOString(),
    profile,
    activityLevel,
    scores: {
      smartMoney: smScore,
      sniper: sniperScore,
      risk: riskScore,
    },
    portfolio: {
      totalTokens: portfolio.tokens?.length || 0,
      totalValue: portfolio.totalValueUsd || 0,
      topHoldings: (portfolio.tokens || []).slice(0, 5),
    },
    sniper: {
      snipedTokens: sniperRecord.snipedTokens?.length || 0,
      successRate: sniperRecord.successRate || 0,
      bestRoi: sniperRecord.bestRoi || null,
    },
    risk: {
      score: riskScore,
      flags: risk.flags || [],
      age: risk.age || "Unknown",
    },
    dataSources: ["Blockscout", "DexScreener", "GeckoTerminal"],
  };
}

/**
 * DeFi Dashboard — Complete DeFi overview
 * Combines: yields + protocol stats + rebalance recommendations
 */
export async function getDefiDashboard() {
  const [yields, protocolStats, tvlHistory, movers] = await Promise.all([
    safeCall(getAllYields),
    safeCall(getBaseProtocolStats),
    safeCall(getBaseTvlHistory),
    safeCall(getBaseMovers),
  ]);

  // Categorize yields by risk
  const yieldsByRisk = {
    low: (yields.yields || []).filter(y => y.apy < 5),
    medium: (yields.yields || []).filter(y => y.apy >= 5 && y.apy < 20),
    high: (yields.yields || []).filter(y => y.apy >= 20),
  };

  // Top yields per category
  const topYields = {
    stablecoins: (yields.yields || [])
      .filter(y => ["USDC", "USDT", "DAI", "USDbC"].includes(y.asset))
      .sort((a, b) => (b.apy || 0) - (a.apy || 0))
      .slice(0, 3),
    eth: (yields.yields || [])
      .filter(y => ["ETH", "WETH", "stETH", "wstETH"].includes(y.asset))
      .sort((a, b) => (b.apy || 0) - (a.apy || 0))
      .slice(0, 3),
  };

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalPools: yields.count || 0,
      totalProtocols: protocolStats.totalProtocols || 0,
      baseTvl: protocolStats.totalTvl || 0,
      tvlChange7d: tvlHistory.change7d || null,
    },
    topYields,
    yieldsByRisk: {
      low: { count: yieldsByRisk.low.length, avgApy: avgApy(yieldsByRisk.low) },
      medium: { count: yieldsByRisk.medium.length, avgApy: avgApy(yieldsByRisk.medium) },
      high: { count: yieldsByRisk.high.length, avgApy: avgApy(yieldsByRisk.high) },
    },
    topMovers: (movers.movers || []).slice(0, 5),
    topProtocols: (protocolStats.protocols || []).slice(0, 10),
    dataSources: ["DeFiLlama", "Morpho", "Moonwell", "Aerodrome"],
  };
}

/**
 * Risk Assessment — Combined risk analysis
 * Combines: token safety + wallet risk + whale concentration
 */
export async function getRiskAssessment(tokenAddress) {
  const [safety, whaleActivity, smartMoney] = await Promise.all([
    safeCall(analyzeTokenSafety, tokenAddress),
    safeCall(getTokenWhaleActivity, tokenAddress, { limit: 20 }),
    safeCall(analyzeTokenSmartMoney, tokenAddress, { maxBuyers: 10 }),
  ]);

  // Calculate overall risk
  const safetyRisk = safety.riskScore ?? 50;
  const whaleRisk = whaleActivity.riskScore ?? 50;
  const smartMoneyRisk = smartMoney.signalStrength === "STRONG" ? 20 :
                         smartMoney.signalStrength === "MODERATE" ? 40 :
                         60;

  const overallRisk = Math.round(
    (safetyRisk * 0.4) +
    (whaleRisk * 0.35) +
    (smartMoneyRisk * 0.25)
  );

  const riskLevel = overallRisk >= 70 ? "CRITICAL" :
                    overallRisk >= 50 ? "HIGH" :
                    overallRisk >= 30 ? "MEDIUM" : "LOW";

  const recommendation = overallRisk >= 70 ? "DO NOT BUY — High rug risk" :
                         overallRisk >= 50 ? "CAUTION — Proceed with extreme care" :
                         overallRisk >= 30 ? "MODERATE RISK — DYOR" :
                         "LOW RISK — Looks safe to trade";

  return {
    token: tokenAddress,
    timestamp: new Date().toISOString(),
    overallRisk,
    riskLevel,
    recommendation,
    breakdown: {
      safety: {
        score: safetyRisk,
        honeypot: safety.isHoneypot || false,
        renounced: safety.isRenounced || false,
        flags: safety.flags || [],
      },
      whaleConcentration: {
        score: whaleRisk,
        top5Pct: whaleActivity.concentration?.top5Pct || 0,
        whalesCount: whaleActivity.concentration?.whalesCount || 0,
        megaWhalesCount: whaleActivity.concentration?.megaWhalesCount || 0,
      },
      smartMoney: {
        score: smartMoneyRisk,
        signal: smartMoney.signalStrength || "NONE",
        totalBuyers: smartMoney.totalBuyers || 0,
        stillHolding: smartMoney.stillHolding || 0,
      },
    },
    dataSources: ["GoPlus", "Blockscout", "GeckoTerminal"],
  };
}

// Helper
function avgApy(yields) {
  if (!yields.length) return 0;
  const sum = yields.reduce((acc, y) => acc + (y.apy || 0), 0);
  return Math.round((sum / yields.length) * 100) / 100;
}
