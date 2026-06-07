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
import {
  getAllYields,
  getBestYieldsForAsset,
  getYieldsByRisk,
  getRebalanceRecommendation,
} from "./aggregator.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAY_TO_ADDRESS;

if (!PAY_TO) {
  console.error("ERROR: PAY_TO_ADDRESS not set in .env");
  process.exit(1);
}

// --- Facilitator ---
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

  // Helper: Bazaar discovery extension
  const discover = (input, inputSchema) => ({
    extensions: { ...declareDiscoveryExtension({ input, inputSchema }) },
  });

  // --- Payment config ---
  const paymentConfig = {
    // === WALLET ANALYTICS ===
    "GET /api/portfolio/:address": {
      accepts: [{ scheme: "exact", price: "$0.005", network: N, payTo: PAY_TO }],
      description: "Wallet token portfolio on Base (ETH + ERC-20 balances)",
      mimeType: "application/json",
      ...discover(
        { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string", description: "EVM wallet address" } }, required: ["address"] }
      ),
    },
    "GET /api/history/:address": {
      accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
      description: "Recent transaction history for a wallet on Base",
      mimeType: "application/json",
      ...discover(
        { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string", description: "EVM wallet address" } }, required: ["address"] }
      ),
    },
    "GET /api/summary/:address": {
      accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
      description: "Full wallet analytics: portfolio, history, activity stats on Base",
      mimeType: "application/json",
      ...discover(
        { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
        { type: "object", properties: { address: { type: "string", description: "EVM wallet address" } }, required: ["address"] }
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
        { asset: { description: "Asset symbol (e.g. USDC, ETH, DAI)", type: "string", required: true } },
        { type: "object", properties: { asset: { type: "string", description: "Asset symbol" } }, required: ["asset"] }
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
  };

  // --- Middleware ---
  app.use(paymentMiddleware(paymentConfig, resourceServer));

  // === FREE ROUTES ===
  app.get("/health", (req, res) => {
    res.json({ status: "ok", network: "base", payTo: PAY_TO, version: "2.0.0" });
  });

  app.get("/api/protocols", (req, res) => {
    res.json({
      wallet: ["portfolio", "history", "summary"],
      yields: ["morpho", "moonwell", "aerodrome"],
    });
  });

  // === WALLET ANALYTICS ROUTES ===
  app.get("/api/portfolio/:address", async (req, res) => {
    try {
      res.json(await getPortfolio(req.params.address));
    } catch (err) {
      console.error("Portfolio error:", err.message);
      res.status(500).json({ error: "Failed to fetch portfolio" });
    }
  });

  app.get("/api/history/:address", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      res.json(await getTxHistory(req.params.address, limit));
    } catch (err) {
      console.error("History error:", err.message);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/summary/:address", async (req, res) => {
    try {
      res.json(await getWalletSummary(req.params.address));
    } catch (err) {
      console.error("Summary error:", err.message);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // === DEFI YIELD ROUTES ===
  app.get("/api/yields", async (req, res) => {
    try {
      res.json(await getAllYields());
    } catch (err) {
      console.error("Yields error:", err.message);
      res.status(500).json({ error: "Failed to fetch yields" });
    }
  });

  app.get("/api/yields/best/:asset", async (req, res) => {
    try {
      res.json(await getBestYieldsForAsset(req.params.asset));
    } catch (err) {
      console.error("Best yield error:", err.message);
      res.status(500).json({ error: "Failed to fetch best yield" });
    }
  });

  app.get("/api/yields/risk", async (req, res) => {
    try {
      res.json(await getYieldsByRisk());
    } catch (err) {
      console.error("Risk yields error:", err.message);
      res.status(500).json({ error: "Failed to fetch yields by risk" });
    }
  });

  app.get("/api/yields/rebalance", async (req, res) => {
    try {
      const { protocol, apy } = req.query;
      if (!protocol || !apy) {
        return res.status(400).json({ error: "Missing: protocol, apy" });
      }
      res.json(await getRebalanceRecommendation(protocol, apy));
    } catch (err) {
      console.error("Rebalance error:", err.message);
      res.status(500).json({ error: "Failed to generate recommendation" });
    }
  });

  // --- Start ---
  app.listen(PORT, () => {
    console.log(`
Base Analytics API v2.0 running on port ${PORT}
Payments -> ${PAY_TO}

FREE:
  GET /health
  GET /api/protocols

WALLET:
  GET /api/portfolio/:address     ($0.005)
  GET /api/history/:address       ($0.01)
  GET /api/summary/:address       ($0.02)

YIELDS:
  GET /api/yields                 ($0.02)
  GET /api/yields/best/:asset     ($0.01)
  GET /api/yields/risk            ($0.02)
  GET /api/yields/rebalance       ($0.05)

Bazaar discovery: ENABLED
`);
  });
}

main();
