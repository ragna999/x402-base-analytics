import "dotenv/config";
import express from "express";
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

const app = express();
const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO_ADDRESS;

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
    // === WALLET ANALYTICS ===
    "GET /api/portfolio/:address": {
      accepts: [{ scheme: "exact", price: "$0.005", network: N, payTo: PAY_TO }],
      description: "Wallet token portfolio on Base (ETH + ERC-20 balances)",
      mimeType: "application/json",
      ...discover(
        { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/history/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Recent transaction history for a wallet on Base",
      mimeType: "application/json",
      ...discover(
        { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/summary/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "Full wallet analytics: portfolio, history, activity stats on Base",
      mimeType: "application/json",
      ...discover(
        { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },

    // === DEFI YIELDS ===
    "GET /api/yields": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "Real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/yields/best/:asset": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols",
      mimeType: "application/json",
      ...discover(
        { asset: { description: "Asset symbol (e.g. USDC, ETH)", type: "string", required: true } },
        { type: "object", properties: { asset: { type: "string" } }, required: ["asset"] }
      ),
    },
    "GET /api/yields/risk": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "DeFi yields categorized by risk level (low/medium/high)",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/yields/rebalance": {
      accepts: [{ scheme: "exact", price: "$0.05", network: N, payTo: PAY_TO }],
      description: "Rebalance recommendation — compare your current yield vs best available",
      mimeType: "application/json",
      ...discover(
        { protocol: { description: "Current protocol", type: "string" }, apy: { description: "Current APY", type: "number" } },
        { type: "object", properties: { protocol: { type: "string" }, apy: { type: "number" } }, required: ["protocol", "apy"] }
      ),
    },

    // === SNIPER TRACKER ===
    "GET /api/sniper/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Early buyers (snipers) analysis for a token — find wallets that bought before the pump",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Token contract address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/sniper/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Sniper track record for a wallet — score, success rate, tokens traded",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/sniper/trending": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Top snipers from trending tokens on Base — wallets that buy early on multiple tokens",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },

    // === SMART MONEY TRACKER ===
    "GET /api/smart-money/wallet/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "Smart money analysis for a wallet — score, classification, trading patterns, token activity",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/smart-money/token/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "Find smart money buyers of a token — who's buying, are they still holding, smart money signal strength",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Token contract address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },
    "GET /api/smart-money/activity": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "What smart money wallets are buying right now on Base — scans trending tokens for multi-token early buyers",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },

    // === TOKEN SAFETY ===
    "GET /api/token-safety/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "Token safety analysis — rug risk score, honeypot check, holder analysis, tax info. Uses GoPlus Security data.",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Token contract address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },

    // === WALLET RISK ===
    "GET /api/wallet-risk/:address": {
      accepts: [{ scheme: "exact", price: "$0.03", network: N, payTo: PAY_TO }],
      description: "Wallet risk scoring — age, activity patterns, scam interaction, bot detection. On-chain behavior analysis.",
      mimeType: "application/json",
      ...discover(
        { address: { description: "Wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
      ),
    },

    // === BASE PROTOCOL STATS ===
    "GET /api/protocols/base": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "All Base protocol stats — TVL, categories, top protocols. Data from DeFiLlama.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/protocols/base/tvl": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Base chain TVL history — 30 day trend, 7d/30d change. Data from DeFiLlama.",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
    "GET /api/protocols/base/movers": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Top gainers and losers on Base in 24h by TVL change",
      mimeType: "application/json",
      ...discover({}, { type: "object", properties: {} }),
    },
  };

  // --- Middleware ---
  app.use(paymentMiddleware(paymentConfig, resourceServer));

  // === FREE ROUTES ===
  app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ragna Analytics — Base Chain Intelligence</title>
  <meta name="base:app_id" content="6a269dfdbac148992eb51dc4" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 600px; padding: 2rem; text-align: center; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #0052ff, #6a5cff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p { color: #888; margin-bottom: 1.5rem; line-height: 1.6; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #111; border-radius: 12px; padding: 1rem; border: 1px solid #222; }
    .stat .num { font-size: 1.5rem; font-weight: 700; color: #0052ff; }
    .stat .label { font-size: 0.75rem; color: #666; margin-top: 0.25rem; }
    a { color: #0052ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .endpoints { text-align: left; background: #111; border-radius: 12px; padding: 1.5rem; border: 1px solid #222; margin-bottom: 1.5rem; }
    .endpoints h3 { color: #fff; margin-bottom: 0.75rem; font-size: 0.9rem; }
    .ep { color: #888; font-size: 0.8rem; font-family: monospace; margin-bottom: 0.25rem; }
    .ep .price { color: #4ade80; }
    .footer { color: #444; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Ragna Analytics</h1>
    <p>AI-powered on-chain intelligence for Base. Smart analytics for smart money.</p>
    <div class="stats">
      <div class="stat"><div class="num">20</div><div class="label">REST Endpoints</div></div>
      <div class="stat"><div class="num">13</div><div class="label">MCP Tools</div></div>
      <div class="stat"><div class="num">6</div><div class="label">Categories</div></div>
    </div>
    <div class="endpoints">
      <h3>Available Services</h3>
      <div class="ep">GET /api/portfolio/:address <span class="price">$0.005</span></div>
      <div class="ep">GET /api/summary/:address <span class="price">$0.02</span></div>
      <div class="ep">GET /api/yields <span class="price">$0.02</span></div>
      <div class="ep">GET /api/token-safety/:address <span class="price">$0.02</span></div>
      <div class="ep">GET /api/smart-money/activity <span class="price">$0.02</span></div>
      <div class="ep">GET /api/sniper/trending <span class="price">$0.01</span></div>
      <div class="ep" style="color: #666; margin-top: 0.5rem;">+ 14 more endpoints...</div>
    </div>
    <p><a href="/health">Health Check</a> · <a href="/api/protocols">API Docs</a></p>
    <div class="footer">Built on Base · Powered by x402 Protocol</div>
  </div>
</body>
</html>`);
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", network: "base", payTo: PAY_TO, version: "4.0.0" });
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
