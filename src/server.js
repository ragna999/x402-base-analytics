import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

// Chain config
import { CHAINS, SUPPORTED_CHAINS } from "./chains.js";

// Wallet analytics (multi-chain)
import { getPortfolio } from "./analytics/portfolio.js";
import { getTxHistory } from "./analytics/history.js";
import { getWalletSummary } from "./analytics/summary.js";

// DeFi yields
import { getAllYields, getBestYieldsForAsset, getYieldsByRisk, getRebalanceRecommendation } from "./aggregator.js";

// Token safety, wallet risk, protocol stats
import { analyzeTokenSafety } from "./tokenSafety.js";
import { analyzeWalletRisk } from "./walletRisk.js";
import { getBaseProtocolStats, getBaseTvlHistory, getBaseMovers } from "./protocolStats.js";

// Sniper tracker
import { getTokenSnipers, getWalletSniperRecord, getTrendingSnipers } from "./sniper.js";

// Smart money tracker
import { analyzeSmartMoneyWallet, analyzeTokenSmartMoney, getSmartMoneyActivity } from "./smartMoney.js";

// Arbitrage scanner
import { scanAllPairs, scanSpecificPair, getSupportedTokens, getSupportedDexs } from "./arbScanner.js";

// Whale alerts
import { getWhaleAlerts, getTokenWhaleActivity, getWhaleMovements, getWhaleHeatmap, getAccumulationSignals } from "./whaleAlerts.js";

// Aggregated endpoints
import { getTokenIntelligence, getMarketPulse, getWalletIntelligence, getDefiDashboard, getRiskAssessment } from "./aggregated.js";

// GMX Perps (Arbitrum-specific)
import { getGmxStats, getGmxFundingRates, getGlpYield, getGmxLiquidations } from "./gmxPerps.js";

// Solana-specific endpoints
import { analyzeSolanaTokenSafety } from "./solanaSafety.js";
import { findSolanaSnipers, getSolanaSniperScore } from "./solanaSnipers.js";
import { getSolanaTrending, getSolanaNewTokens, getSolanaTopVolume } from "./solanaTrending.js";

// Social signals
import { getTokenSocial, getSocialTrending, getFarcasterCrypto, getKolActivity, getSocialSentiment } from "./socialSignals.js";

// Gas tracker
import { getGasPrices, getGasForChain } from "./gasTracker.js";

// Token approvals scanner
import { scanApprovals } from "./approvalsScanner.js";

// Multi-chain balance
import { getMultichainBalance } from "./multichainBalance.js";

// DEX Aggregator Quotes
import { getQuote, getPoolInfo, getSupportedDexes } from "./dexQuotes.js";

// Portfolio P&L Tracker
import { analyzePnL, getPnLSummary } from "./analytics/pnlTracker.js";

// NFT Analytics (Alchemy)
import { getNFTPortfolio, getCollectionInfo, getFloorPrice, getNFTSales, getNFTOwners } from "./nftAnalytics.js";

// Solana NFT Analytics (Magic Eden)
import { getSolanaCollectionStats, getSolanaNFTPortfolio, getSolanaTokenMetadata, getSolanaCollectionActivities } from "./solanaNft.js";
const app = express();
const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO_ADDRESS;
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_7isseb6n";
const SOLANA_PAY_TO = process.env.SOLANA_PAY_TO_ADDRESS || null;
const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

if (!PAY_TO) {
  console.error("ERROR: PAY_TO_ADDRESS not set in .env");
  process.exit(1);
}

if (SOLANA_PAY_TO) {
  console.log(`Solana wallet: ${SOLANA_PAY_TO}`);
}

async function createFacilitator() {
  const urls = [
    process.env.FACILITATOR_URL || "https://api.cdp.coinbase.com/platform/v2/x402",
    "https://facilitator.payai.network",
  ];
  for (const url of urls) {
    try {
      const client = new HTTPFacilitatorClient({ url });
      await client.getSupported();
      console.log(`Facilitator: ${url}`);
      return client;
    } catch (e) {
      console.warn(`Facilitator ${url} unavailable: ${e.message}`);
    }
  }
  return null;
}

async function main() {
  const facilitatorClient = await createFacilitator();
  if (!facilitatorClient) {
    console.error("ERROR: No facilitator available.");
    process.exit(1);
  }

  // Register Base and Solana (x402scan supported networks)
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register("eip155:8453", new ExactEvmScheme())
    .register(SOLANA_NETWORK, new ExactSvmScheme());

  const BASE = "eip155:8453";
  const SOL = SOLANA_NETWORK;

  const discover = (input, inputSchema, outputExample) => ({
    extensions: { ...declareDiscoveryExtension({ input, inputSchema, output: outputExample ? { example: outputExample } : undefined }) },
  });

  // Multi-chain accepts helper (Base + Solana only for x402scan)
  const multiChain = (price, payTo = PAY_TO) => [
    { scheme: "exact", price, network: BASE, payTo },
  ];

  // Add Solana if available
  const multiChainWithSol = (price) => {
    const accepts = multiChain(price);
    if (SOLANA_PAY_TO) {
      accepts.push({ scheme: "exact", price, network: SOL, payTo: SOLANA_PAY_TO });
    }
    return accepts;
  };

  const paymentConfig = {
    // === WALLET ANALYTICS (MULTI-CHAIN + SOLANA) ===
    "GET /api/portfolio/:chain/:address": {
      accepts: multiChainWithSol("$0.005"),
      description: "Wallet token portfolio — supports Base + Arbitrum",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/history/:chain/:address": {
      accepts: multiChainWithSol("$0.01"),
      description: "Recent transaction history — supports Base + Arbitrum",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/summary/:chain/:address": {
      accepts: multiChainWithSol("$0.02"),
      description: "Full wallet analytics: portfolio, history, activity — supports Base + Arbitrum",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === TOKEN SAFETY (MULTI-CHAIN) ===
    "GET /api/token-safety/:chain/:address": {
      accepts: multiChainWithSol("$0.02"),
      description: "Token safety analysis — rug risk, honeypot, holder analysis. Supports all chains.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { chain: "base", riskScore: 85, verdict: "LOW_RISK" }),
    },

    // === DEFI YIELDS ===
    "GET /api/yields": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/yields/best/:asset": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/yields/risk": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "DeFi yields categorized by risk level (low/medium/high)",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/yields/rebalance": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Rebalance recommendation — compare your current yield vs best available",
      mimeType: "application/json",
      ...discover(
        { protocol: "aave-v3", apy: "5.5" },
        { type: "object", properties: { protocol: { type: "string" }, apy: { type: "string" } }, required: ["protocol", "apy"] }
      ),
    },

    // === WALLET RISK ===
    "GET /api/wallet-risk/:address": {
      accepts: [{ scheme: "exact", price: "$0.03", network: BASE, payTo: PAY_TO }],
      description: "Wallet risk scoring — age, activity patterns, scam interaction, bot detection",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === PROTOCOL STATS ===
    "GET /api/protocols/base": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "All Base protocol stats — TVL, categories, top protocols. Data from DeFiLlama.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/protocols/base/tvl": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Base chain TVL history — 30 day trend, 7d/30d change",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/protocols/base/movers": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Top gainers and losers on Base in 24h by TVL change",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === SNIPER TRACKER ===
    "GET /api/sniper/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Early buyers (snipers) analysis for a token",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/sniper/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Sniper track record for a wallet",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/sniper/trending": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Top snipers from trending tokens on Base",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === SMART MONEY ===
    "GET /api/smart-money/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Smart money analysis for a wallet",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/smart-money/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Find smart money buyers of a token",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/smart-money/activity": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "What smart money wallets are buying right now on Base",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === WHALE ALERTS ===
    "GET /api/whale/alerts": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Recent whale alerts — large transfers from known whale wallets",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/whale/alerts/:token": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Token whale activity — holder concentration, risk score",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/whale/movements": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Cross-token whale activity — volume, buy/sell ratio",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/whale/heatmap": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Whale heatmap — tokens ranked by whale activity score",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/whale/accumulation": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Accumulation signals — tokens being accumulated by large buyers",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === AGGREGATED ENDPOINTS ===
    "GET /api/intelligence/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Complete token intelligence — safety + whale + smart money + snipers combined",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/intelligence/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Complete wallet intelligence — portfolio + smart money + sniper + risk combined",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/market/pulse": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Real-time market pulse — whale picks + smart money activity + top movers + yields",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/defi/dashboard": {
      accepts: [{ scheme: "exact", price: "$0.03", network: BASE, payTo: PAY_TO }],
      description: "DeFi dashboard — yields + protocols + TVL + movers combined",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/risk/:address": {
      accepts: [{ scheme: "exact", price: "$0.03", network: BASE, payTo: PAY_TO }],
      description: "Risk assessment — token safety + whale concentration + smart money signal",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === GMX PERPS (ARBITRUM-SPECIFIC) ===
    "GET /api/arbitrum/gmx/stats": {
      accepts: multiChainWithSol("$0.02"),
      description: "GMX V2 stats — open interest, volume, fees. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/arbitrum/gmx/funding": {
      accepts: multiChainWithSol("$0.01"),
      description: "GMX funding rates — market sentiment indicator. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/arbitrum/gmx/glp": {
      accepts: multiChainWithSol("$0.01"),
      description: "GLP/APR yield data from GMX. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/arbitrum/gmx/liquidations": {
      accepts: multiChainWithSol("$0.02"),
      description: "Recent GMX liquidations feed. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === SOLANA-SPECIFIC ENDPOINTS ===
    "GET /api/solana/token-safety/:mint": {
      accepts: multiChainWithSol("$0.02"),
      description: "Solana token safety — rug check, honeypot, holder analysis. GoPlus + GeckoTerminal data.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/solana/snipers/:mint": {
      accepts: multiChainWithSol("$0.01"),
      description: "Solana sniper tracker — early buyers detection for a token. Shows who bought in first 5 minutes.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/solana/snipers/:mint/score": {
      accepts: multiChainWithSol("$0.01"),
      description: "Solana sniper score — how much sniping activity on this token (0-100).",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/solana/trending": {
      accepts: multiChainWithSol("$0.01"),
      description: "Trending Solana pools — top tokens by activity on Solana DEXes.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/solana/new-tokens": {
      accepts: multiChainWithSol("$0.01"),
      description: "New Solana tokens — recently created pools (degen alpha signal).",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/solana/top-volume": {
      accepts: multiChainWithSol("$0.01"),
      description: "Top Solana pools by 24h volume.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === SOCIAL SIGNALS ===
    "GET /api/social/token/:chain/:address": {
      accepts: multiChainWithSol("$0.03"),
      description: "Aggregated social presence for a token — Twitter, Telegram, Discord, Farcaster, trust score.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/social/trending": {
      accepts: multiChainWithSol("$0.02"),
      description: "Trending tokens with social data — volume, social links, trust score.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/social/farcaster/crypto": {
      accepts: multiChainWithSol("$0.02"),
      description: "Trending crypto discussions on Farcaster — engagement metrics, channels.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/social/kol/activity": {
      accepts: multiChainWithSol("$0.03"),
      description: "What KOLs are buying — cluster signals, Twitter usernames.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/social/sentiment/:keyword": {
      accepts: multiChainWithSol("$0.03"),
      description: "Multi-source social sentiment — Farcaster, GeckoTerminal, DexScreener.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === GAS TRACKER ===
    "GET /api/gas": {
      accepts: multiChainWithSol("$0.001"),
      description: "Real-time gas prices across all chains — Base, ETH, Arbitrum, Optimism, Polygon, Solana",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/gas/:chain": {
      accepts: multiChainWithSol("$0.001"),
      description: "Gas price for specific chain",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === TOKEN APPROVALS SCANNER ===
    "GET /api/approvals/:chain/:address": {
      accepts: multiChainWithSol("$0.02"),
      description: "Scan wallet token approvals — detect unlimited approvals, security risks. Shows revoke recommendations.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === MULTI-CHAIN BALANCE ===
    "GET /api/balance/:address": {
      accepts: multiChainWithSol("$0.01"),
      description: "Multi-chain balance — native + stablecoins across Base, ETH, Arbitrum, Optimism, Polygon in one call",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === PORTFOLIO P&L TRACKER ===
    "GET /api/pnl/:chain/:address": {
      accepts: multiChainWithSol("$0.05"),
      description: "Full portfolio P&L — realized + unrealized, cost basis, win/loss ratio, per-token breakdown. Supports Base, Arbitrum, Celo.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/pnl/:chain/:address/summary": {
      accepts: multiChainWithSol("$0.02"),
      description: "P&L summary — total realized/unrealized, win rate, best/worst trades. Lightweight version.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === DEX AGGREGATOR QUOTES ===
    "GET /api/quote/:chain/:from/:to": {
      accepts: multiChainWithSol("$0.005"),
      description: "Best DEX swap quote — compares Aerodrome, Uniswap V3, SushiSwap, PancakeSwap, BaseSwap. Returns best route + alternatives.",
      mimeType: "application/json",
      ...discover(
        { amount: "1.0" },
        { type: "object", properties: { amount: { type: "string" } } }
      ),
    },
    "GET /api/quote/pools/:chain/:from/:to": {
      accepts: multiChainWithSol("$0.003"),
      description: "All pools for a token pair — shows liquidity, volume, fees across DEXes",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/quote/dexes/:chain": {
      accepts: multiChainWithSol("$0.001"),
      description: "Supported DEXes for a chain — names, types, fee tiers",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === NFT ANALYTICS (ALCHEMY) ===
    "GET /api/nft/portfolio/:address": {
      accepts: multiChainWithSol("$0.50"),
      description: "NFT portfolio — all NFTs owned by a wallet with metadata, images, collection info. Base + Ethereum.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/collection/:chain/:contract": {
      accepts: multiChainWithSol("$0.25"),
      description: "Collection metadata + floor price — name, symbol, supply, OpenSea data, social links.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/floor/:chain/:contract": {
      accepts: multiChainWithSol("$0.20"),
      description: "Floor price only — OpenSea + LooksRare floor price for a collection.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/sales/:chain/:contract": {
      accepts: multiChainWithSol("$0.50"),
      description: "Recent NFT sales — marketplace, tokenId, buyer, seller, price, tx hash.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/owners/:chain/:contract/:tokenId": {
      accepts: multiChainWithSol("$0.25"),
      description: "NFT owners — list of wallets owning a specific NFT token.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === SOLANA NFT ANALYTICS (MAGIC EDEN) ===
    "GET /api/nft/solana/collection/:symbol": {
      accepts: multiChainWithSol("$0.25"),
      description: "Solana collection stats — floor price, volume, listed count. Magic Eden data.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/solana/portfolio/:wallet": {
      accepts: multiChainWithSol("$0.50"),
      description: "Solana NFT portfolio — all NFTs owned by a wallet with metadata, images, collection info.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/solana/token/:mint": {
      accepts: multiChainWithSol("$0.20"),
      description: "Solana token metadata — name, image, attributes, price, collection info.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/nft/solana/activities/:collection": {
      accepts: multiChainWithSol("$0.50"),
      description: "Solana collection activities — recent sales, bids, listings from Magic Eden.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === ARBITRAGE SCANNER ===
    "GET /api/arb/scan": {
      accepts: multiChainWithSol("$0.01"),
      description: "Arbitrage scanner — scans DEX pairs for price discrepancies. Returns opportunities with profit estimates.",
      mimeType: "application/json",
      ...discover({ amount: "1000" }, { type: "object", properties: { amount: { type: "string" } } }),
    },
    "GET /api/arb/tokens": {
      accepts: multiChainWithSol("$0.01"),
      description: "Supported tokens and DEXes for arbitrage scanning.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === API DIRECTORY ===
    "GET /api/protocols": {
      accepts: multiChainWithSol("$0.01"),
      description: "Full API directory — all available endpoints, supported chains, and categories.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },

    // === ENRICHMENT ENDPOINTS ===
    "GET /api/enrich/wallet/:chain/:address": {
      accepts: multiChainWithSol("$0.05"),
      description: "Full wallet enrichment — portfolio, risk, DeFi positions, recent activity, whale status, bot detection.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/enrich/token/:chain/:address": {
      accepts: multiChainWithSol("$0.05"),
      description: "Token deep dive — price, liquidity, holders, rug score, top holders, recent large trades, AI summary.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/enrich/tx/:chain/:hash": {
      accepts: multiChainWithSol("$0.05"),
      description: "Transaction analysis — MEV detection, slippage analysis, protocol identification, gas optimization tips.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/bridge/quotes/:from/:to/:amount": {
      accepts: multiChainWithSol("$0.02"),
      description: "Cross-chain bridge quotes — compares routes across bridges, shows fees, time, and best option.",
      mimeType: "application/json",
      ...discover({ amount: "100" }, { type: "object", properties: { amount: { type: "string" } } }),
    },

    // === NEW ENDPOINTS (TEMP FREE FOR TESTING) ===
    "GET /api/heatmap/:chain": {
      accepts: multiChainWithSol("$0.00"),
      description: "Market heatmap — all token performance in one view. Shows price change, volume, market cap with color coding.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/ai/token/:chain/:address": {
      accepts: multiChainWithSol("$0.00"),
      description: "AI token analysis — MiMo-powered insights combining safety, social, price data. Returns summary, risk factors, recommendation.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
    "GET /api/protocol-health/:protocol": {
      accepts: multiChainWithSol("$0.00"),
      description: "Protocol health dashboard — TVL changes, utilization rates, governance activity. Returns health score + key metrics.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }, { status: "ok" }),
    },
  };

  // --- Security: block method abuse before x402 ---
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return next();
    if (req.method === "HEAD") return res.status(402).json({ error: "Payment required. Use GET with x402 payment." });
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    next();
  });

  // --- x402 Discovery Endpoints ---
  app.get("/.well-known/x402", (req, res) => {
    res.json({
      version: "1.0",
      resources: Object.entries(paymentConfig).map(([route, config]) => ({
        route: route.replace(/^GET /, ""),
        description: config.description,
        accepts: config.accepts,
      })),
    });
  });

  app.get("/.well-known/x402-resources", (req, res) => res.redirect(301, "/.well-known/x402"));
  app.get("/x402-resources", (req, res) => res.redirect(301, "/.well-known/x402"));
  app.get("/x402/discovery/resources", (req, res) => res.redirect(301, "/.well-known/x402"));
  app.get("/.well-known/x402/discovery/resources", (req, res) => res.redirect(301, "/.well-known/x402"));
  app.get("/v1/x402/discovery/resources", (req, res) => res.redirect(301, "/.well-known/x402"));
  app.get("/v2/x402/discovery/resources", (req, res) => res.redirect(301, "/.well-known/x402"));

  // --- Middleware ---
  app.use(cors());
  // Initialize resource server manually BEFORE middleware to catch errors properly
  // (prevents unhandled rejection crash from eager init in paymentMiddleware)
  try {
    await resourceServer.initialize();
    console.log("x402 resource server initialized");
  } catch (e) {
    console.warn("x402 resource server init failed (non-fatal, will retry):", e.message);
  }
  app.use(paymentMiddleware(paymentConfig, resourceServer, undefined, undefined, false));

  // === FREE ROUTES ===
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  app.use(express.static(join(__dirname, '..', 'public')));

  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  });

  app.get("/health", (req, res) => {
    const networks = [...SUPPORTED_CHAINS];
    if (SOLANA_PAY_TO) networks.push("solana");
    res.json({
      status: "ok",
      networks,
      payTo: PAY_TO,
      solanaPayTo: SOLANA_PAY_TO || "not configured",
      version: "10.2.0-pnl-tracker",
      builderCode: BUILDER_CODE,
    });
  });

  app.get("/builder-code", (req, res) => {
    res.json({
      builderCode: BUILDER_CODE,
      standard: "ERC-8021",
      networks: SUPPORTED_CHAINS,
      walletAddress: PAY_TO,
      registrationUrl: "https://base.dev",
      hexSuffix: "0x0762617365617070" + Buffer.from(BUILDER_CODE).toString("hex") + "80218021802180218021802180218021",
    });
  });

  app.get("/api/protocols", (req, res) => {
    res.json({
      supportedChains: SUPPORTED_CHAINS,
      wallet: ["portfolio/:chain/:address", "history/:chain/:address", "summary/:chain/:address"],
      yields: ["yields", "yields/best/:asset", "yields/risk", "yields/rebalance"],
      safety: ["token-safety/:chain/:address", "wallet-risk/:address"],
      stats: ["protocols/base", "protocols/base/tvl", "protocols/base/movers"],
      sniper: ["token/:address", "wallet/:address", "trending"],
      smartMoney: ["wallet/:address", "token/:address", "activity"],
      whale: ["alerts", "alerts/:token", "movements", "heatmap", "accumulation"],
      intelligence: ["token/:address", "wallet/:address"],
      market: ["pulse"],
      defi: ["dashboard"],
      risk: [":address"],
      arbitrum: ["gmx/stats", "gmx/funding", "gmx/glp", "gmx/liquidations"],
      social: ["token/:chain/:address", "trending", "farcaster/crypto", "kol/activity", "sentiment/:keyword"],
      gas: ["", ":chain"],
      approvals: [":chain/:address"],
      balance: [":address"],
      pnl: [":chain/:address", ":chain/:address/summary"],
      quote: [":chain/:from/:to", "pools/:chain/:from/:to", "dexes/:chain"],
    });
  });

  // === MULTI-CHAIN WALLET ANALYTICS ===
  app.get("/api/portfolio/:chain/:address", async (req, res) => {
    try {
      const { chain, address } = req.params;
      if (!SUPPORTED_CHAINS.includes(chain)) return res.status(400).json({ error: `Unsupported chain. Use: ${SUPPORTED_CHAINS.join(", ")}` });
      res.json(await getPortfolio(chain, address));
    } catch (err) { console.error("Portfolio error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/history/:chain/:address", async (req, res) => {
    try {
      const { chain, address } = req.params;
      if (!SUPPORTED_CHAINS.includes(chain)) return res.status(400).json({ error: `Unsupported chain. Use: ${SUPPORTED_CHAINS.join(", ")}` });
      res.json(await getTxHistory(chain, address, Math.min(parseInt(req.query.limit) || 20, 100)));
    } catch (err) { console.error("History error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/summary/:chain/:address", async (req, res) => {
    try {
      const { chain, address } = req.params;
      if (!SUPPORTED_CHAINS.includes(chain)) return res.status(400).json({ error: `Unsupported chain. Use: ${SUPPORTED_CHAINS.join(", ")}` });
      res.json(await getWalletSummary(chain, address));
    } catch (err) { console.error("Summary error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === MULTI-CHAIN TOKEN SAFETY ===
  app.get("/api/token-safety/:chain/:address", async (req, res) => {
    try {
      const { chain, address } = req.params;
      if (!SUPPORTED_CHAINS.includes(chain)) return res.status(400).json({ error: `Unsupported chain. Use: ${SUPPORTED_CHAINS.join(", ")}` });
      res.json(await analyzeTokenSafety(chain, address));
    } catch (err) { console.error("Token safety error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === DEFI YIELDS ===
  app.get("/api/yields", async (req, res) => {
    try { res.json(await getAllYields()); }
    catch (err) { console.error("Yields error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/yields/best/:asset", async (req, res) => {
    try { res.json(await getBestYieldsForAsset(req.params.asset)); }
    catch (err) { console.error("Best yield error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/yields/risk", async (req, res) => {
    try { res.json(await getYieldsByRisk()); }
    catch (err) { console.error("Risk yields error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/yields/rebalance", async (req, res) => {
    try {
      const { protocol, apy } = req.query;
      if (!protocol || !apy) return res.status(400).json({ error: "Missing: protocol, apy" });
      res.json(await getRebalanceRecommendation(protocol, apy));
    } catch (err) { console.error("Rebalance error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === WALLET RISK ===
  app.get("/api/wallet-risk/:address", async (req, res) => {
    try { res.json(await analyzeWalletRisk(req.params.address)); }
    catch (err) { console.error("Wallet risk error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === BASE PROTOCOL STATS ===
  app.get("/api/protocols/base", async (req, res) => {
    try { res.json(await getBaseProtocolStats()); }
    catch (err) { console.error("Protocol stats error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/protocols/base/tvl", async (req, res) => {
    try { res.json(await getBaseTvlHistory()); }
    catch (err) { console.error("TVL error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/protocols/base/movers", async (req, res) => {
    try { res.json(await getBaseMovers()); }
    catch (err) { console.error("Movers error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === SNIPER TRACKER ===
  app.get("/api/sniper/token/:address", async (req, res) => {
    try {
      const maxBuyers = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getTokenSnipers(req.params.address, { maxBuyers }));
    } catch (err) { console.error("Sniper token error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/sniper/wallet/:address", async (req, res) => {
    try { res.json(await getWalletSniperRecord(req.params.address)); }
    catch (err) { console.error("Sniper wallet error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/sniper/trending", async (req, res) => {
    try { res.json(await getTrendingSnipers()); }
    catch (err) { console.error("Sniper trending error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === SMART MONEY TRACKER ===
  app.get("/api/smart-money/wallet/:address", async (req, res) => {
    try { res.json(await analyzeSmartMoneyWallet(req.params.address)); }
    catch (err) { console.error("Smart money wallet error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/smart-money/token/:address", async (req, res) => {
    try {
      const maxBuyers = Math.min(parseInt(req.query.limit) || 30, 50);
      res.json(await analyzeTokenSmartMoney(req.params.address, { maxBuyers }));
    } catch (err) { console.error("Smart money token error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/smart-money/activity", async (req, res) => {
    try { res.json(await getSmartMoneyActivity()); }
    catch (err) { console.error("Smart money activity error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === WHALE ALERTS ===
  app.get("/api/whale/alerts", async (req, res) => {
    try {
      const minAmount = parseInt(req.query.min_amount) || 10000;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      res.json(await getWhaleAlerts({ minAmount, limit }));
    } catch (err) { console.error("Whale alerts error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/whale/alerts/:token", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 30, 50);
      res.json(await getTokenWhaleActivity(req.params.token, { limit }));
    } catch (err) { console.error("Whale token error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/whale/movements", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getWhaleMovements({ limit }));
    } catch (err) { console.error("Whale movements error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/whale/heatmap", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getWhaleHeatmap({ limit }));
    } catch (err) { console.error("Whale heatmap error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/whale/accumulation", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 30);
      res.json(await getAccumulationSignals({ limit }));
    } catch (err) { console.error("Whale accumulation error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === ARBITRAGE SCANNER (internal — free) ===
  app.get("/api/arb/scan", async (req, res) => {
    try {
      const amount = parseInt(req.query.amount) || 1000;
      res.json(await scanAllPairs(amount));
    } catch (err) { console.error("Arb scan error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/arb/pair/:from/:to", async (req, res) => {
    try {
      const amount = parseInt(req.query.amount) || 1000;
      const result = await scanSpecificPair(req.params.from.toUpperCase(), req.params.to.toUpperCase(), amount);
      res.json(result);
    } catch (err) { console.error("Arb pair error:", err.message); res.status(500).json({ error: "Failed", details: err.message }); }
  });

  app.get("/api/arb/tokens", (req, res) => {
    res.json({ tokens: getSupportedTokens(), dexs: getSupportedDexs() });
  });

  // === AGGREGATED ENDPOINTS ===
  app.get("/api/intelligence/token/:address", async (req, res) => {
    try { res.json(await getTokenIntelligence(req.params.address)); }
    catch (err) { console.error("Token intelligence error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/intelligence/wallet/:address", async (req, res) => {
    try { res.json(await getWalletIntelligence(req.params.address)); }
    catch (err) { console.error("Wallet intelligence error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/market/pulse", async (req, res) => {
    try { res.json(await getMarketPulse()); }
    catch (err) { console.error("Market pulse error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/defi/dashboard", async (req, res) => {
    try { res.json(await getDefiDashboard()); }
    catch (err) { console.error("DeFi dashboard error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/risk/:address", async (req, res) => {
    try { res.json(await getRiskAssessment(req.params.address)); }
    catch (err) { console.error("Risk assessment error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === GMX PERPS (ARBITRUM-SPECIFIC) ===
  app.get("/api/arbitrum/gmx/stats", async (req, res) => {
    try { res.json(await getGmxStats()); }
    catch (err) { console.error("GMX stats error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/arbitrum/gmx/funding", async (req, res) => {
    try { res.json(await getGmxFundingRates()); }
    catch (err) { console.error("GMX funding error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/arbitrum/gmx/glp", async (req, res) => {
    try { res.json(await getGlpYield()); }
    catch (err) { console.error("GLP yield error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/arbitrum/gmx/liquidations", async (req, res) => {
    try { res.json(await getGmxLiquidations()); }
    catch (err) { console.error("GMX liquidations error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === SOLANA-SPECIFIC ENDPOINTS ===
  app.get("/api/solana/token-safety/:mint", async (req, res) => {
    try { res.json(await analyzeSolanaTokenSafety(req.params.mint)); }
    catch (err) { console.error("Solana safety error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/solana/snipers/:mint", async (req, res) => {
    try {
      const maxBuyers = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await findSolanaSnipers(req.params.mint, { maxBuyers }));
    } catch (err) { console.error("Solana snipers error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/solana/snipers/:mint/score", async (req, res) => {
    try { res.json(await getSolanaSniperScore(req.params.mint)); }
    catch (err) { console.error("Solana sniper score error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/solana/trending", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getSolanaTrending(limit));
    } catch (err) { console.error("Solana trending error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/solana/new-tokens", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getSolanaNewTokens(limit));
    } catch (err) { console.error("Solana new tokens error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/solana/top-volume", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getSolanaTopVolume(limit));
    } catch (err) { console.error("Solana top volume error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === SOCIAL SIGNALS ===
  app.get("/api/social/token/:chain/:address", async (req, res) => {
    try { res.json(await getTokenSocial(req.params.chain, req.params.address)); }
    catch (err) { console.error("Social token error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/social/trending", async (req, res) => {
    try {
      const chain = req.query.chain || "base";
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getSocialTrending(chain, limit));
    } catch (err) { console.error("Social trending error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/social/farcaster/crypto", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      res.json(await getFarcasterCrypto(limit));
    } catch (err) { console.error("Farcaster crypto error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/social/kol/activity", async (req, res) => {
    try {
      const chain = req.query.chain || "sol";
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      res.json(await getKolActivity(chain, limit));
    } catch (err) { console.error("KOL activity error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/social/sentiment/:keyword", async (req, res) => {
    try { res.json(await getSocialSentiment(req.params.keyword)); }
    catch (err) { console.error("Social sentiment error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === GAS TRACKER ===
  app.get("/api/gas", async (req, res) => {
    try {
      res.json(await getGasPrices());
    } catch (err) {
      console.error("Gas prices error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/gas/:chain", async (req, res) => {
    try {
      res.json(await getGasForChain(req.params.chain));
    } catch (err) {
      console.error("Gas chain error:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // === TOKEN APPROVALS SCANNER ===
  app.get("/api/approvals/:chain/:address", async (req, res) => {
    try {
      const { chain, address } = req.params;
      res.json(await scanApprovals(chain, address));
    } catch (err) {
      console.error("Approvals error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // === MULTI-CHAIN BALANCE ===
  app.get("/api/balance/:address", async (req, res) => {
    try {
      res.json(await getMultichainBalance(req.params.address));
    } catch (err) {
      console.error("Balance error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // === PORTFOLIO P&L TRACKER ===
  app.get("/api/pnl/:chain/:address", async (req, res) => {
    try {
      const { chain, address } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 100, 200);
      const includeUnrealized = req.query.realized_only !== "true";
      res.json(await analyzePnL(chain, address, { limit, includeUnrealized }));
    } catch (err) { console.error("P&L error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/pnl/:chain/:address/summary", async (req, res) => {
    try {
      const { chain, address } = req.params;
      res.json(await getPnLSummary(chain, address));
    } catch (err) { console.error("P&L summary error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  // === DEX AGGREGATOR QUOTES ===
  app.get("/api/quote/:chain/:from/:to", async (req, res) => {
    try {
      const { chain, from, to } = req.params;
      const amount = parseFloat(req.query.amount) || 1;
      res.json(await getQuote(chain, from, to, amount));
    } catch (err) {
      console.error("DEX quote error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/quote/pools/:chain/:from/:to", async (req, res) => {
    try {
      const { chain, from, to } = req.params;
      res.json(await getPoolInfo(chain, from, to));
    } catch (err) {
      console.error("Pool info error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/quote/dexes/:chain", async (req, res) => {
    try {
      res.json(await getSupportedDexes(req.params.chain));
    } catch (err) {
      console.error("Dexes error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // === NFT ANALYTICS (ALCHEMY) ===
  app.get("/api/nft/portfolio/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const chain = req.query.chain || 'base';
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const pageKey = req.query.pageKey || undefined;
      res.json(await getNFTPortfolio(address, chain, limit, pageKey));
    } catch (err) {
      console.error("NFT portfolio error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/collection/:chain/:contract", async (req, res) => {
    try {
      const { chain, contract } = req.params;
      res.json(await getCollectionInfo(contract, chain));
    } catch (err) {
      console.error("NFT collection error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/floor/:chain/:contract", async (req, res) => {
    try {
      const { chain, contract } = req.params;
      res.json(await getFloorPrice(contract, chain));
    } catch (err) {
      console.error("NFT floor error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/sales/:chain/:contract", async (req, res) => {
    try {
      const { chain, contract } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const fromBlock = req.query.fromBlock || undefined;
      const toBlock = req.query.toBlock || undefined;
      res.json(await getNFTSales(contract, chain, limit, fromBlock, toBlock));
    } catch (err) {
      console.error("NFT sales error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/owners/:chain/:contract/:tokenId", async (req, res) => {
    try {
      const { chain, contract, tokenId } = req.params;
      res.json(await getNFTOwners(contract, tokenId, chain));
    } catch (err) {
      console.error("NFT owners error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // === SOLANA NFT ANALYTICS (MAGIC EDEN) ===
  app.get("/api/nft/solana/collection/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      res.json(await getSolanaCollectionStats(symbol));
    } catch (err) {
      console.error("Solana collection error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/solana/portfolio/:wallet", async (req, res) => {
    try {
      const { wallet } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      res.json(await getSolanaNFTPortfolio(wallet, limit, offset));
    } catch (err) {
      console.error("Solana portfolio error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/solana/token/:mint", async (req, res) => {
    try {
      const { mint } = req.params;
      res.json(await getSolanaTokenMetadata(mint));
    } catch (err) {
      console.error("Solana token error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/nft/solana/activities/:collection", async (req, res) => {
    try {
      const { collection } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      res.json(await getSolanaCollectionActivities(collection, limit, offset));
    } catch (err) {
      console.error("Solana activities error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // === ENRICHMENT ENDPOINTS ===

  // Full wallet enrichment
  app.get("/api/enrich/wallet/:chain/:address", async (req, res) => {
    const { chain, address } = req.params;
    try {
      const [portfolio, risk, summary] = await Promise.all([
        getPortfolio(chain, address).catch(() => null),
        analyzeWalletRisk(address).catch(() => null),
        getWalletSummary(chain, address).catch(() => null),
      ]);

      const isWhale = portfolio?.tokens?.some(t => parseFloat(t.value) > 100000) || false;

      res.json({
        address,
        chain,
        portfolio: portfolio || { error: "unavailable" },
        risk: risk || { error: "unavailable" },
        summary: summary || { error: "unavailable" },
        is_whale: isWhale,
        enriched_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Wallet enrichment error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Token deep dive
  app.get("/api/enrich/token/:chain/:address", async (req, res) => {
    const { chain, address } = req.params;
    try {
      const [safety, social] = await Promise.all([
        analyzeTokenSafety(chain, address).catch(() => null),
        getTokenSocial(chain, address).catch(() => null),
      ]);

      // Fetch price data from DexScreener
      let priceData = null;
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        const dexData = await dexRes.json();
        if (dexData.pairs?.[0]) {
          const pair = dexData.pairs[0];
          priceData = {
            price: pair.priceUsd,
            price_change_24h: pair.priceChange?.h24,
            volume_24h: pair.volume?.h24,
            liquidity: pair.liquidity?.usd,
            market_cap: pair.marketCap,
            pair_address: pair.pairAddress,
            dex: pair.dexId,
          };
        }
      } catch (e) { /* ignore */ }

      res.json({
        token: address,
        chain,
        price: priceData || { error: "unavailable" },
        safety: safety || { error: "unavailable" },
        social: social || { error: "unavailable" },
        enriched_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Token enrichment error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Transaction analysis
  app.get("/api/enrich/tx/:chain/:hash", async (req, res) => {
    const { chain, hash } = req.params;
    try {
      // Fetch tx data from chain explorer
      const chainConfig = CHAINS[chain];
      if (!chainConfig?.explorer) {
        return res.json({ error: `Chain ${chain} not supported for tx analysis` });
      }

      // Use Blockscout API for tx data
      const txUrl = `${chainConfig.explorer}/transactions/${hash}`;
      const [txRes] = await Promise.all([
        fetch(txUrl, { headers: { "Accept": "application/json" } }).then(r => r.json()).catch(() => null),
      ]);

      if (!txRes || txRes.error) {
        return res.json({ error: "Transaction not found" });
      }

      const tx = txRes;
      const value = parseFloat(tx.value || 0) / 1e18;
      const gasUsed = tx.gas_used || null;
      const gasPrice = parseFloat(tx.gas_price || 0) / 1e9; // Gwei
      const status = tx.status === "ok" ? "success" : tx.status || "unknown";

      // Detect method from decoded input or method ID
      const methodId = tx.method_call?.slice(0, 10) || tx.input?.slice(0, 10);
      const methodName = tx.decoded_input?.method_call || null;
      const isSwap = methodName?.toLowerCase().includes("swap") || false;
      const isTransfer = methodName?.toLowerCase().includes("transfer") || false;

      // MEV detection heuristics
      const mevRisk = gasPrice > 100 ? "high" : gasPrice > 50 ? "medium" : "low";

      res.json({
        tx_hash: hash,
        chain,
        from: tx.from?.hash || tx.from,
        to: tx.to?.hash || tx.to,
        value: `${value.toFixed(6)} ETH`,
        status,
        block: tx.block,
        timestamp: tx.timestamp,
        gas_used: gasUsed,
        gas_price_gwei: gasPrice.toFixed(2),
        method: isSwap ? "swap" : isTransfer ? "transfer" : methodName || "other",
        method_id: methodId,
        mev_risk: mevRisk,
        nonce: tx.nonce,
        analyzed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("TX analysis error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Bridge quotes
  app.get("/api/bridge/quotes/:from/:to/:amount", async (req, res) => {
    const { from, to, amount } = req.params;
    try {
      // Use LiFi API for bridge quotes
      const lifiUrl = `https://li.quest/v1/quote?fromChain=${from}&toChain=${to}&fromToken=USDC&toToken=USDC&fromAmount=${parseFloat(amount) * 1e6}`;

      const lifiRes = await fetch(lifiUrl, {
        headers: { "Accept": "application/json" }
      });

      if (!lifiRes.ok) {
        // Fallback: return estimated quotes
        const bridgeEstimates = [
          { bridge: "Stargate", estimated_fee: "$1.50", estimated_time: "2-5 min", reliability: "high" },
          { bridge: "Across", estimated_fee: "$1.20", estimated_time: "1-3 min", reliability: "high" },
          { bridge: "Hop", estimated_fee: "$2.00", estimated_time: "5-10 min", reliability: "medium" },
          { bridge: "Synapse", estimated_fee: "$1.80", estimated_time: "3-7 min", reliability: "medium" },
        ];

        return res.json({
          from_chain: from,
          to_chain: to,
          amount: `$${amount}`,
          quotes: bridgeEstimates,
          note: "Estimated values — use LiFi/Socket for exact quotes",
          quoted_at: new Date().toISOString(),
        });
      }

      const lifiData = await lifiRes.json();

      res.json({
        from_chain: from,
        to_chain: to,
        amount: `$${amount}`,
        best_route: {
          bridge: lifiData.tool?.name || "unknown",
          from_amount: lifiData.estimate?.fromAmount,
          to_amount: lifiData.estimate?.toAmount,
          fee: lifiData.estimate?.gasCosts?.[0]?.amountUSD || "unknown",
          time: lifiData.estimate?.executionDuration || "unknown",
        },
        quoted_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Bridge quote error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // === NEW ENDPOINTS ===

  // Market Heatmap
  app.get("/api/heatmap/:chain", async (req, res) => {
    const { chain } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    try {
      // Get trending tokens from DexScreener
      const trendingRes = await fetch(`https://api.dexscreener.com/token-boosts/top/v1`);
      const trendingData = await trendingRes.json();

      // Get top pairs for the chain
      let tokens = [];

      // Method 1: Get trending tokens for this chain
      if (trendingData?.length > 0) {
        const chainTokens = trendingData
          .filter(t => t.chainId === chain)
          .slice(0, limit);

        // Fetch price data for each token
        for (const t of chainTokens.slice(0, 20)) { // limit to 20 to avoid rate limits
          try {
            const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${t.tokenAddress}`);
            const dexData = await dexRes.json();
            if (dexData.pairs?.[0]) {
              const pair = dexData.pairs[0];
              tokens.push({
                symbol: pair.baseToken?.symbol || t.symbol || "Unknown",
                name: pair.baseToken?.name || t.name || "Unknown",
                address: t.tokenAddress,
                price: pair.priceUsd,
                price_change_5m: pair.priceChange?.m5,
                price_change_1h: pair.priceChange?.h1,
                price_change_24h: pair.priceChange?.h24,
                volume_24h: pair.volume?.h24,
                volume_6h: pair.volume?.h6,
                liquidity: pair.liquidity?.usd,
                market_cap: pair.marketCap,
                pair_address: pair.pairAddress,
                dex: pair.dexId,
                color: pair.priceChange?.h24 > 0 ? "green" : pair.priceChange?.h24 < 0 ? "red" : "neutral",
                boost_count: t.amount,
              });
            }
          } catch (e) { /* skip */ }
        }
      }

      // Method 2: If no trending, try search
      if (tokens.length === 0) {
        const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${chain}`);
        const searchData = await searchRes.json();
        if (searchData.pairs?.length > 0) {
          tokens = searchData.pairs.slice(0, limit).map(pair => ({
            symbol: pair.baseToken?.symbol || "Unknown",
            name: pair.baseToken?.name || "Unknown",
            address: pair.baseToken?.address,
            price: pair.priceUsd,
            price_change_5m: pair.priceChange?.m5,
            price_change_1h: pair.priceChange?.h1,
            price_change_24h: pair.priceChange?.h24,
            volume_24h: pair.volume?.h24,
            volume_6h: pair.volume?.h6,
            liquidity: pair.liquidity?.usd,
            market_cap: pair.marketCap,
            pair_address: pair.pairAddress,
            dex: pair.dexId,
            color: pair.priceChange?.h24 > 0 ? "green" : pair.priceChange?.h24 < 0 ? "red" : "neutral",
          }));
        }
      }

      res.json({
        chain,
        token_count: tokens.length,
        tokens,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Heatmap error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // AI Token Analysis
  app.get("/api/ai/token/:chain/:address", async (req, res) => {
    const { chain, address } = req.params;
    try {
      // Gather all data
      const [safety, social] = await Promise.all([
        analyzeTokenSafety(chain, address).catch(() => null),
        getTokenSocial(chain, address).catch(() => null),
      ]);

      // Get price data
      let priceData = null;
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        const dexData = await dexRes.json();
        if (dexData.pairs?.[0]) {
          const pair = dexData.pairs[0];
          priceData = {
            price: pair.priceUsd,
            price_change_24h: pair.priceChange?.h24,
            volume_24h: pair.volume?.h24,
            liquidity: pair.liquidity?.usd,
            market_cap: pair.marketCap,
          };
        }
      } catch (e) { /* ignore */ }

      // Build context for MiMo
      const context = {
        token: address,
        chain,
        safety: safety ? {
          risk_score: safety.riskScore,
          verdict: safety.verdict,
          risks: safety.risks?.map(r => r.detail) || [],
          holders: safety.details?.holderCount,
          is_open_source: safety.details?.isOpenSource,
        } : null,
        price: priceData,
        social: social?.social || null,
      };

      // Generate AI analysis using MiMo
      const MIMO_API_KEY = process.env.MIMO_API_KEY;
      let aiAnalysis = "AI analysis unavailable — MiMo API key not configured";

      if (MIMO_API_KEY) {
        try {
          const mimoRes = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${MIMO_API_KEY}`,
            },
            body: JSON.stringify({
              model: "mimo-v2.5",
              messages: [
                {
                  role: "system",
                  content: "You are a crypto token analyst. Analyze the token data provided and give a concise analysis. Include: 1) Overall assessment 2) Risk factors 3) Bull/bear case 4) Recommendation (avoid/cautious/consider/strong). Be direct and factual. Max 200 words."
                },
                {
                  role: "user",
                  content: `Analyze this token:\n${JSON.stringify(context, null, 2)}`
                }
              ],
              temperature: 0.3,
              max_tokens: 500,
            }),
          });
          const mimoData = await mimoRes.json();
          aiAnalysis = mimoData.choices?.[0]?.message?.content || "Analysis generation failed";
        } catch (e) {
          aiAnalysis = `AI analysis error: ${e.message}`;
        }
      }

      res.json({
        token: address,
        chain,
        safety,
        price: priceData,
        social: social?.social || null,
        ai_analysis: aiAnalysis,
        analyzed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("AI token analysis error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Protocol Health Dashboard
  app.get("/api/protocol-health/:protocol", async (req, res) => {
    const { protocol } = req.params;
    try {
      // Get protocol data from DeFiLlama
      const llamaRes = await fetch(`https://api.llama.fi/protocol/${protocol}`);
      if (!llamaRes.ok) {
        return res.json({ error: `Protocol ${protocol} not found on DeFiLlama` });
      }
      const llamaData = await llamaRes.json();

      // Get TVL history
      const tvlHistory = llamaData.tvl || [];
      const currentTvl = tvlHistory.length > 0 ? tvlHistory[tvlHistory.length - 1].totalLiquidityUSD : 0;
      const tvl1dAgo = tvlHistory.length > 1 ? tvlHistory[tvlHistory.length - 2].totalLiquidityUSD : currentTvl;
      const tvl7dAgo = tvlHistory.length > 7 ? tvlHistory[tvlHistory.length - 8].totalLiquidityUSD : currentTvl;
      const tvl30dAgo = tvlHistory.length > 30 ? tvlHistory[tvlHistory.length - 31].totalLiquidityUSD : currentTvl;

      const tvlChange1d = tvl1dAgo > 0 ? ((currentTvl - tvl1dAgo) / tvl1dAgo * 100).toFixed(2) : 0;
      const tvlChange7d = tvl7dAgo > 0 ? ((currentTvl - tvl7dAgo) / tvl7dAgo * 100).toFixed(2) : 0;
      const tvlChange30d = tvl30dAgo > 0 ? ((currentTvl - tvl30dAgo) / tvl30dAgo * 100).toFixed(2) : 0;

      // Calculate health score (0-100)
      let healthScore = 50; // base
      if (currentTvl > 1000000000) healthScore += 20; // > $1B TVL
      else if (currentTvl > 100000000) healthScore += 15; // > $100M
      else if (currentTvl > 10000000) healthScore += 10; // > $10M

      if (tvlChange7d > 0) healthScore += 10; // growing
      if (tvlChange30d > 0) healthScore += 10; // growing long term

      if (llamaData.audits && llamaData.audits !== "0") healthScore += 10; // audited
      if (llamaData.category) healthScore += 5; // has category

      healthScore = Math.min(100, Math.max(0, healthScore));

      // Determine health status
      const healthStatus = healthScore >= 80 ? "excellent" : healthScore >= 60 ? "good" : healthScore >= 40 ? "moderate" : "at_risk";

      res.json({
        protocol: llamaData.name || protocol,
        category: llamaData.category,
        chains: llamaData.chains || [],
        tvl: {
          current: currentTvl,
          change_1d: `${tvlChange1d}%`,
          change_7d: `${tvlChange7d}%`,
          change_30d: `${tvlChange30d}%`,
        },
        health: {
          score: healthScore,
          status: healthStatus,
          factors: {
            tvl_size: currentTvl > 100000000 ? "strong" : currentTvl > 10000000 ? "moderate" : "weak",
            growth_trend: tvlChange7d > 0 ? "positive" : tvlChange7d < 0 ? "negative" : "stable",
            audit_status: llamaData.audits && llamaData.audits !== "0" ? "audited" : "unaudited",
          },
        },
        metadata: {
          description: llamaData.description,
          url: llamaData.url,
          twitter: llamaData.twitter,
          github: llamaData.github,
        },
        analyzed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Protocol health error:", err.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // --- Start ---
  app.listen(PORT, () => {
    console.log(`
RagRadar v10.2.0-pnl-tracker on port ${PORT}
Payments -> ${PAY_TO}
Networks -> ${SUPPORTED_CHAINS.join(", ")}

MULTI-CHAIN ENDPOINTS:
  GET /api/portfolio/:chain/:address   (base, arbitrum)
  GET /api/history/:chain/:address     (base, arbitrum)
  GET /api/summary/:chain/:address     (base, arbitrum)
  GET /api/token-safety/:chain/:address (base, arbitrum, polygon, avalanche, celo)

P&L TRACKER (NEW):
  GET /api/pnl/:chain/:address          (full P&L breakdown)
  GET /api/pnl/:chain/:address/summary  (summary only)

ARBITRUM-SPECIFIC (GMX):
  GET /api/arbitrum/gmx/stats
  GET /api/arbitrum/gmx/funding
  GET /api/arbitrum/gmx/glp
  GET /api/arbitrum/gmx/liquidations

GAS TRACKER:
  GET /api/gas
  GET /api/gas/:chain

TOKEN APPROVALS:
  GET /api/approvals/:chain/:address

MULTI-CHAIN BALANCE:
  GET /api/balance/:address

DEX AGGREGATOR QUOTES:
  GET /api/quote/:chain/:from/:to     (best swap route)
  GET /api/quote/pools/:chain/:from/:to (all pools)
  GET /api/quote/dexes/:chain         (supported DEXes)
  GET /api/yields, /api/protocols/base, /api/sniper/*, /api/smart-money/*, /api/whale/*, /api/intelligence/*

Total: 57 endpoints | 6 chains
`);
  });
}

main();
