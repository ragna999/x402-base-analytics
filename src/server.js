import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

// Wallet analytics
import { getPortfolio } from "./analytics/portfolio.js";
import { getTxHistory } from "./analytics/history.js";
import { getWalletSummary } from "./analytics/summary.js";

// DeFi yields
import { getAllYields, getBestYieldsForAsset, getYieldsByRisk, getRebalanceRecommendation } from "./aggregator.js";

// New: Token safety, wallet risk, protocol stats
import { analyzeTokenSafety } from "./tokenSafety.js";
import { analyzeWalletRisk } from "./walletRisk.js";
import { getBaseProtocolStats, getBaseTvlHistory, getBaseMovers } from "./protocolStats.js";

// Sniper tracker
import { getTokenSnipers, getWalletSniperRecord, getTrendingSnipers } from "./sniper.js";

// Smart money tracker
import { analyzeSmartMoneyWallet, analyzeTokenSmartMoney, getSmartMoneyActivity } from "./smartMoney.js";

// Arbitrage scanner
import { scanAllPairs, scanSpecificPair, getSupportedTokens, getSupportedDexs } from "./arbScanner.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO_ADDRESS;
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_7isseb6n";

if (!PAY_TO) {
  console.error("ERROR: PAY_TO_ADDRESS not set in .env");
  process.exit(1);
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

  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register("eip155:8453", new ExactEvmScheme());

  const N = "eip155:8453";
  const discover = (input, inputSchema) => ({
    extensions: { ...declareDiscoveryExtension({ input, inputSchema }) },
  });

  const paymentConfig = {
    // === FREE DAY — ALL ENDPOINTS FREE FOR 24 HOURS ===
    // Uncomment below to re-enable payments

    // // === WALLET ANALYTICS ===
    // "GET /api/portfolio/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.005", network: N, payTo: PAY_TO }],
    //   description: "Wallet token portfolio on Base (ETH + ERC-20 balances)",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/history/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Recent transaction history for a wallet on Base",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/summary/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "Full wallet analytics: portfolio, history, activity stats on Base",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/yields": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "Real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY.",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
    // "GET /api/yields/best/:asset": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols",
    //   mimeType: "application/json",
    //   ...discover(
    //     { asset: { description: "Asset symbol (e.g. USDC, ETH)", type: "string", required: true } },
    //     { type: "object", properties: { asset: { type: "string" } }, required: ["asset"] }
    //   ),
    // },
    // "GET /api/yields/risk": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "DeFi yields categorized by risk level (low/medium/high)",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
    // "GET /api/yields/rebalance": {
    //   accepts: [{ scheme: "exact", price: "$0.05", network: N, payTo: PAY_TO }],
    //   description: "Rebalance recommendation — compare your current yield vs best available",
    //   mimeType: "application/json",
    //   ...discover(
    //     { protocol: { description: "Current protocol", type: "string" }, apy: { description: "Current APY", type: "number" } },
    //     { type: "object", properties: { protocol: { type: "string" }, apy: { type: "number" } }, required: ["protocol", "apy"] }
    //   ),
    // },
    // "GET /api/sniper/token/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Early buyers (snipers) analysis for a token — find wallets that bought before the pump",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "Token contract address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/sniper/wallet/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Sniper track record for a wallet — score, success rate, tokens traded",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "Wallet address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/sniper/trending": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Top snipers from trending tokens on Base — wallets that buy early on multiple tokens",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
    // "GET /api/smart-money/wallet/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "Smart money analysis for a wallet — score, classification, trading patterns, token activity",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "Wallet address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/smart-money/token/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "Find smart money buyers of a token — who's buying, are they still holding, smart money signal strength",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "Token contract address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/smart-money/activity": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "What smart money wallets are buying right now on Base — scans trending tokens for multi-token early buyers",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
    // "GET /api/token-safety/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
    //   description: "Token safety analysis — rug risk score, honeypot check, holder analysis, tax info. Uses GoPlus Security data.",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "Token contract address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/wallet-risk/:address": {
    //   accepts: [{ scheme: "exact", price: "$0.03", network: N, payTo: PAY_TO }],
    //   description: "Wallet risk scoring — age, activity patterns, scam interaction, bot detection. On-chain behavior analysis.",
    //   mimeType: "application/json",
    //   ...discover(
    //     { address: { description: "Wallet address (0x...)", type: "string", required: true } },
    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
    //   ),
    // },
    // "GET /api/protocols/base": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "All Base protocol stats — TVL, categories, top protocols. Data from DeFiLlama.",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
    // "GET /api/protocols/base/tvl": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Base chain TVL history — 30 day trend, 7d/30d change. Data from DeFiLlama.",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
    // "GET /api/protocols/base/movers": {
    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
    //   description: "Top gainers and losers on Base in 24h by TVL change",
    //   mimeType: "application/json",
    //   ...discover({}, { type: "object", properties: {} }),
    // },
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
    res.json({ status: "ok", network: "base", payTo: PAY_TO, version: "5.0.0-free", builderCode: BUILDER_CODE, note: "All endpoints free for 24 hours!" });
  });

  // Builder Code info (ERC-8021)
  app.get("/builder-code", (req, res) => {
    res.json({
      builderCode: BUILDER_CODE,
      standard: "ERC-8021",
      network: "base",
      walletAddress: PAY_TO,
      registrationUrl: "https://base.dev",
      howToUse: "Append builder code suffix to transaction calldata for attribution. See https://docs.base.org/apps/builder-codes/agent-developers",
      hexSuffix: "0x0762617365617070" + Buffer.from(BUILDER_CODE).toString("hex") + "80218021802180218021802180218021",
    });
  });

  app.get("/api/protocols", (req, res) => {
    res.json({
      wallet: ["portfolio", "history", "summary"],
      yields: ["morpho", "moonwell", "aerodrome"],
      safety: ["token-safety", "wallet-risk"],
      stats: ["protocols/base", "protocols/base/tvl", "protocols/base/movers"],
      sniper: ["token/:address", "wallet/:address", "trending"],
      smartMoney: ["wallet/:address", "token/:address", "activity"],
    });
  });

  // === WALLET ANALYTICS ===
  app.get("/api/portfolio/:address", async (req, res) => {
    try { res.json(await getPortfolio(req.params.address)); }
    catch (err) { console.error("Portfolio error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/history/:address", async (req, res) => {
    try { res.json(await getTxHistory(req.params.address, Math.min(parseInt(req.query.limit) || 20, 100))); }
    catch (err) { console.error("History error:", err.message); res.status(500).json({ error: "Failed" }); }
  });

  app.get("/api/summary/:address", async (req, res) => {
    try { res.json(await getWalletSummary(req.params.address)); }
    catch (err) { console.error("Summary error:", err.message); res.status(500).json({ error: "Failed" }); }
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

  // === TOKEN SAFETY ===
  app.get("/api/token-safety/:address", async (req, res) => {
    try { res.json(await analyzeTokenSafety(req.params.address)); }
    catch (err) { console.error("Token safety error:", err.message); res.status(500).json({ error: "Failed" }); }
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

  // === SNIPER TRACKER (FREE - testing phase) ===
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

  // === ARBITRAGE SCANNER (internal tool — free) ===
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

  // --- Start ---
  app.listen(PORT, () => {
    console.log(`
Base Analytics API v3.0 running on port ${PORT}
Payments -> ${PAY_TO}

FREE:
  GET /health
  GET /api/protocols

WALLET ($0.005-$0.02):
  GET /api/portfolio/:address
  GET /api/history/:address
  GET /api/summary/:address

YIELDS ($0.01-$0.05):
  GET /api/yields
  GET /api/yields/best/:asset
  GET /api/yields/risk
  GET /api/yields/rebalance

SAFETY ($0.02-$0.03):  [NEW]
  GET /api/token-safety/:address
  GET /api/wallet-risk/:address

STATS ($0.01):  [NEW]
  GET /api/protocols/base
  GET /api/protocols/base/tvl
  GET /api/protocols/base/movers

SNIPER TRACKER ($0.01):
  GET /api/sniper/token/:address
  GET /api/sniper/wallet/:address
  GET /api/sniper/trending

SMART MONEY ($0.02):
  GET /api/smart-money/wallet/:address
  GET /api/smart-money/token/:address
  GET /api/smart-money/activity

Total: 20 endpoints | Bazaar discovery: ENABLED
`);
  });
}

main();
