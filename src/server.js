import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { createKeyPairSignerFromBytes } from "@solana/kit";
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

const app = express();
const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO_ADDRESS;
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_7isseb6n";
const SOLANA_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;
const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

if (!PAY_TO) {
  console.error("ERROR: PAY_TO_ADDRESS not set in .env");
  process.exit(1);
}

// Derive Solana address from private key
let SOLANA_PAY_TO = null;
if (SOLANA_KEY_HEX) {
  try {
    const keypairBytes = Buffer.from(SOLANA_KEY_HEX, "hex");
    const svmSigner = await createKeyPairSignerFromBytes(keypairBytes);
    SOLANA_PAY_TO = svmSigner.address;
    console.log(`Solana wallet: ${SOLANA_PAY_TO}`);
  } catch (e) {
    console.warn("Failed to load Solana key:", e.message);
  }
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

  // Register Base, Arbitrum, and Solana
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register("eip155:8453", new ExactEvmScheme())
    .register("eip155:42161", new ExactEvmScheme())
    .register(SOLANA_NETWORK, new ExactSvmScheme());

  const BASE = "eip155:8453";
  const ARB = "eip155:42161";
  const SOL = SOLANA_NETWORK;

  const discover = (input, inputSchema) => ({
    extensions: { ...declareDiscoveryExtension({ input, inputSchema }) },
  });

  // Multi-chain accepts helper (EVM only)
  const multiChain = (price, payTo = PAY_TO) => [
    { scheme: "exact", price, network: BASE, payTo },
    { scheme: "exact", price, network: ARB, payTo },
  ];

  // Multi-chain accepts with Solana (for discoverable endpoints)
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
      ...discover(
        { chain: { description: "Chain: base or arbitrum", type: "string", required: true }, address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { chain: { type: "string" }, address: { type: "string" } }, required: ["chain", "address"] }
      ),
    },
    "GET /api/history/:chain/:address": {
      accepts: multiChainWithSol("$0.01"),
      description: "Recent transaction history — supports Base + Arbitrum",
      mimeType: "application/json",
      ...discover(
        { chain: { description: "Chain: base or arbitrum", type: "string", required: true }, address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { chain: { type: "string" }, address: { type: "string" } }, required: ["chain", "address"] }
      ),
    },
    "GET /api/summary/:chain/:address": {
      accepts: multiChainWithSol("$0.02"),
      description: "Full wallet analytics: portfolio, history, activity — supports Base + Arbitrum",
      mimeType: "application/json",
      ...discover(
        { chain: { description: "Chain: base or arbitrum", type: "string", required: true }, address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { chain: { type: "string" }, address: { type: "string" } }, required: ["chain", "address"] }
      ),
    },

    // === TOKEN SAFETY (MULTI-CHAIN) ===
    "GET /api/token-safety/:chain/:address": {
      accepts: multiChainWithSol("$0.02"),
      description: "Token safety analysis — rug risk, honeypot, holder analysis. Supports Base + Arbitrum",
      mimeType: "application/json",
      ...discover(
        { chain: { description: "Chain: base or arbitrum", type: "string", required: true }, address: { description: "Token contract address (0x...)", type: "string", required: true } },
        { type: "object", properties: { chain: { type: "string" }, address: { type: "string" } }, required: ["chain", "address"] }
      ),
    },

    // === DEFI YIELDS ===
    "GET /api/yields": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/yields/best/:asset": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols",
      mimeType: "application/json",
      ...discover(
        { asset: { description: "Asset symbol (e.g. USDC, ETH)", type: "string", required: true } },
        { type: "object", properties: { asset: { type: "string" } }, required: ["asset"] }
      ),
    },
    "GET /api/yields/risk": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "DeFi yields categorized by risk level (low/medium/high)",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/yields/rebalance": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Rebalance recommendation — compare your current yield vs best available",
      mimeType: "application/json",
      ...discover(
        { protocol: { description: "Current protocol", type: "string" }, apy: { description: "Current APY", type: "number" } },
        { type: "object", properties: { protocol: { type: "string" }, apy: { type: "number" } }, required: ["protocol", "apy"] }
      ),
    },

    // === WALLET RISK ===
    "GET /api/wallet-risk/:address": {
      accepts: [{ scheme: "exact", price: "$0.03", network: BASE, payTo: PAY_TO }],
      description: "Wallet risk scoring — age, activity patterns, scam interaction, bot detection",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },

    // === PROTOCOL STATS ===
    "GET /api/protocols/base": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "All Base protocol stats — TVL, categories, top protocols. Data from DeFiLlama.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/protocols/base/tvl": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Base chain TVL history — 30 day trend, 7d/30d change",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/protocols/base/movers": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Top gainers and losers on Base in 24h by TVL change",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },

    // === SNIPER TRACKER ===
    "GET /api/sniper/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Early buyers (snipers) analysis for a token",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Token contract address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/sniper/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Sniper track record for a wallet",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/sniper/trending": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Top snipers from trending tokens on Base",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },

    // === SMART MONEY ===
    "GET /api/smart-money/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Smart money analysis for a wallet",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/smart-money/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Find smart money buyers of a token",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Token contract address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/smart-money/activity": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "What smart money wallets are buying right now on Base",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },

    // === WHALE ALERTS ===
    "GET /api/whale/alerts": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Recent whale alerts — large transfers from known whale wallets",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/whale/alerts/:token": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Token whale activity — holder concentration, risk score",
      mimeType: "application/json",
      ...discover({ token: { description: "Token address", type: "string", required: true } }, { type: "object", properties: { token: { type: "string" } }, required: ["token"] }),
    },
    "GET /api/whale/movements": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Cross-token whale activity — volume, buy/sell ratio",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/whale/heatmap": {
      accepts: [{ scheme: "exact", price: "$0.01", network: BASE, payTo: PAY_TO }],
      description: "Whale heatmap — tokens ranked by whale activity score",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/whale/accumulation": {
      accepts: [{ scheme: "exact", price: "$0.02", network: BASE, payTo: PAY_TO }],
      description: "Accumulation signals — tokens being accumulated by large buyers",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },

    // === AGGREGATED ENDPOINTS ===
    "GET /api/intelligence/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Complete token intelligence — safety + whale + smart money + snipers combined",
      mimeType: "application/json",
      ...discover({ address: { description: "Token contract address (0x...)", type: "string", required: true } }, { type: "object", properties: { address: { type: "string" } }, required: ["address"] }),
    },
    "GET /api/intelligence/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Complete wallet intelligence — portfolio + smart money + sniper + risk combined",
      mimeType: "application/json",
      ...discover({ address: { description: "Wallet address (0x...)", type: "string", required: true } }, { type: "object", properties: { address: { type: "string" } }, required: ["address"] }),
    },
    "GET /api/market/pulse": {
      accepts: [{ scheme: "exact", price: "$0.05", network: BASE, payTo: PAY_TO }],
      description: "Real-time market pulse — whale picks + smart money activity + top movers + yields",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/defi/dashboard": {
      accepts: [{ scheme: "exact", price: "$0.03", network: BASE, payTo: PAY_TO }],
      description: "DeFi dashboard — yields + protocols + TVL + movers combined",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/risk/:address": {
      accepts: [{ scheme: "exact", price: "$0.03", network: BASE, payTo: PAY_TO }],
      description: "Risk assessment — token safety + whale concentration + smart money signal",
      mimeType: "application/json",
      ...discover({ address: { description: "Token contract address (0x...)", type: "string", required: true } }, { type: "object", properties: { address: { type: "string" } }, required: ["address"] }),
    },

    // === GMX PERPS (ARBITRUM-SPECIFIC) ===
    "GET /api/arbitrum/gmx/stats": {
      accepts: [{ scheme: "exact", price: "$0.02", network: ARB, payTo: PAY_TO }],
      description: "GMX V2 stats — open interest, volume, fees. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/arbitrum/gmx/funding": {
      accepts: [{ scheme: "exact", price: "$0.01", network: ARB, payTo: PAY_TO }],
      description: "GMX funding rates — market sentiment indicator. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/arbitrum/gmx/glp": {
      accepts: [{ scheme: "exact", price: "$0.01", network: ARB, payTo: PAY_TO }],
      description: "GLP/APR yield data from GMX. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/arbitrum/gmx/liquidations": {
      accepts: [{ scheme: "exact", price: "$0.02", network: ARB, payTo: PAY_TO }],
      description: "Recent GMX liquidations feed. Arbitrum-specific.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
  };

  // --- Middleware ---
  app.use(cors());
  app.use(paymentMiddleware(paymentConfig, resourceServer));

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
      version: "9.1.0-solana",
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

  // --- Start ---
  app.listen(PORT, () => {
    console.log(`
RagRadar v9.0.0-multichain on port ${PORT}
Payments -> ${PAY_TO}
Networks -> ${SUPPORTED_CHAINS.join(", ")}

MULTI-CHAIN ENDPOINTS:
  GET /api/portfolio/:chain/:address   (base, arbitrum)
  GET /api/history/:chain/:address     (base, arbitrum)
  GET /api/summary/:chain/:address     (base, arbitrum)
  GET /api/token-safety/:chain/:address (base, arbitrum, polygon, avalanche, celo)

ARBITRUM-SPECIFIC (GMX):
  GET /api/arbitrum/gmx/stats
  GET /api/arbitrum/gmx/funding
  GET /api/arbitrum/gmx/glp
  GET /api/arbitrum/gmx/liquidations

BASE-SPECIFIC:
  GET /api/yields, /api/protocols/base, /api/sniper/*, /api/smart-money/*, /api/whale/*, /api/intelligence/*

Total: 32 endpoints | 2 chains
`);
  });
}

main();
