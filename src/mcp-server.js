// mcp-server.js — MCP Server for x402 Base Analytics
// Exposes all analytics tools as MCP tools that AI agents can auto-discover

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createPaymentWrapper } from "@x402/mcp";
import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import express from "express";
import { z } from "zod";

// Import our analytics modules
import { getPortfolio } from "./analytics/portfolio.js";
import { getTxHistory } from "./analytics/history.js";
import { getWalletSummary } from "./analytics/summary.js";
import {
  getAllYields,
  getBestYieldsForAsset,
  getYieldsByRisk,
  getRebalanceRecommendation,
} from "./aggregator.js";
import { analyzeTokenSafety } from "./tokenSafety.js";
import { analyzeWalletRisk } from "./walletRisk.js";
import {
  getBaseProtocolStats,
  getBaseTvlHistory,
  getBaseMovers,
} from "./protocolStats.js";
import {
  getTokenSnipers,
  getWalletSniperRecord,
  getTrendingSnipers,
} from "./sniper.js";
import {
  analyzeSmartMoneyWallet,
  analyzeTokenSmartMoney,
  getSmartMoneyActivity,
} from "./smartMoney.js";

// Whale alerts
import {
  getWhaleAlerts,
  getTokenWhaleActivity,
  getWhaleMovements,
  getWhaleHeatmap,
  getAccumulationSignals,
} from "./whaleAlerts.js";

const PAY_TO = process.env.PAY_TO_ADDRESS;
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_7isseb6n";
const MCP_PORT = process.env.MCP_PORT || 4022;

if (!PAY_TO) {
  console.error("ERROR: PAY_TO_ADDRESS not set");
  process.exit(1);
}

async function createFacilitator() {
  const urls = [
    process.env.FACILITATOR_URL ||
      "https://api.cdp.coinbase.com/platform/v2/x402",
    "https://facilitator.payai.network",
  ];
  for (const url of urls) {
    try {
      const client = new HTTPFacilitatorClient({ url });
      await client.getSupported();
      console.log(`MCP Facilitator: ${url}`);
      return client;
    } catch (e) {
      console.warn(`MCP Facilitator ${url} unavailable: ${e.message}`);
    }
  }
  return null;
}

async function main() {
  const facilitatorClient = await createFacilitator();
  if (!facilitatorClient) {
    console.error("ERROR: No facilitator available");
    process.exit(1);
  }

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    "eip155:8453",
    new ExactEvmScheme()
  );

  const N = "eip155:8453";

  // Create payment wrappers for different price tiers
  const microPaid = (description) =>
    createPaymentWrapper(resourceServer, {
      accepts: [
        {
          scheme: "exact",
          network: N,
          payTo: PAY_TO,
          price: "$0.005",
          resource: {
            url: `mcp://x402-base-analytics/${description}`,
            description,
            mimeType: "application/json",
            serviceName: "Base Analytics",
          },
        },
      ],
    });

  const standardPaid = (description) =>
    createPaymentWrapper(resourceServer, {
      accepts: [
        {
          scheme: "exact",
          network: N,
          payTo: PAY_TO,
          price: "$0.01",
          resource: {
            url: `mcp://x402-base-analytics/${description}`,
            description,
            mimeType: "application/json",
            serviceName: "Base Analytics",
          },
        },
      ],
    });

  const premiumPaid = (description) =>
    createPaymentWrapper(resourceServer, {
      accepts: [
        {
          scheme: "exact",
          network: N,
          payTo: PAY_TO,
          price: "$0.02",
          resource: {
            url: `mcp://x402-base-analytics/${description}`,
            description,
            mimeType: "application/json",
            serviceName: "Base Analytics",
          },
        },
      ],
    });

  // Create MCP server
  const mcpServer = new McpServer({
    name: "base-analytics",
    version: "4.0.0",
  });

  // === WALLET TOOLS ===

  mcpServer.tool(
    "get_portfolio",
    "Get token portfolio for a wallet on Base (ETH + ERC-20 balances). Cost: $0.005",
    { address: z.string().describe("EVM wallet address (0x...)") },
    microPaid("Wallet portfolio")(
      async (args) => {
        const data = await getPortfolio(args.address);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_tx_history",
    "Get recent transaction history for a wallet on Base. Cost: $0.01",
    {
      address: z.string().describe("EVM wallet address (0x...)"),
      limit: z.number().optional().describe("Number of transactions (default 20, max 100)"),
    },
    standardPaid("Transaction history")(
      async (args) => {
        const data = await getTxHistory(args.address, Math.min(args.limit || 20, 100));
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_wallet_summary",
    "Full wallet analytics: portfolio, history, activity stats on Base. Cost: $0.02",
    { address: z.string().describe("EVM wallet address (0x...)") },
    premiumPaid("Wallet summary")(
      async (args) => {
        const data = await getWalletSummary(args.address);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === YIELD TOOLS ===

  mcpServer.tool(
    "get_defi_yields",
    "Get real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY. Cost: $0.02",
    {},
    premiumPaid("DeFi yields")(
      async () => {
        const data = await getAllYields();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_best_yield",
    "Get best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols. Cost: $0.01",
    { asset: z.string().describe("Asset symbol, e.g. USDC, ETH") },
    standardPaid("Best yield")(
      async (args) => {
        const data = await getBestYieldsForAsset(args.asset);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === SAFETY TOOLS ===

  mcpServer.tool(
    "check_token_safety",
    "Token safety analysis — rug risk, honeypot check, holder analysis. Uses GoPlus data. Cost: $0.02",
    { address: z.string().describe("Token contract address (0x...)") },
    premiumPaid("Token safety")(
      async (args) => {
        const data = await analyzeTokenSafety(args.address);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "check_wallet_risk",
    "Wallet risk scoring — age, activity, scam interaction, bot detection. Cost: $0.03",
    { address: z.string().describe("Wallet address (0x...)") },
    createPaymentWrapper(resourceServer, {
      accepts: [
        {
          scheme: "exact",
          network: N,
          payTo: PAY_TO,
          price: "$0.03",
          resource: {
            url: "mcp://x402-base-analytics/wallet-risk",
            description: "Wallet risk scoring",
            mimeType: "application/json",
            serviceName: "Base Analytics",
          },
        },
      ],
    })(
      async (args) => {
        const data = await analyzeWalletRisk(args.address);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === SNIPER TOOLS ===

  mcpServer.tool(
    "find_token_snipers",
    "Find early buyers (snipers) of a token — who bought before the pump. Cost: $0.01",
    { address: z.string().describe("Token contract address (0x...)") },
    standardPaid("Token snipers")(
      async (args) => {
        const data = await getTokenSnipers(args.address, { maxBuyers: 20 });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_trending_snipers",
    "Top snipers from trending tokens — wallets that buy early on multiple tokens. Cost: $0.01",
    {},
    standardPaid("Trending snipers")(
      async () => {
        const data = await getTrendingSnipers();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === SMART MONEY TOOLS ===

  mcpServer.tool(
    "analyze_smart_money_wallet",
    "Smart money analysis for a wallet — score 0-100, classification, trading patterns. Cost: $0.02",
    { address: z.string().describe("Wallet address (0x...)") },
    premiumPaid("Smart money wallet")(
      async (args) => {
        const data = await analyzeSmartMoneyWallet(args.address);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "find_smart_money_buyers",
    "Find smart money buyers of a token — who's buying, still holding, signal strength. Cost: $0.02",
    { address: z.string().describe("Token contract address (0x...)") },
    premiumPaid("Smart money token")(
      async (args) => {
        const data = await analyzeTokenSmartMoney(args.address, { maxBuyers: 30 });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_smart_money_activity",
    "What smart money wallets are buying right now on Base — scans trending tokens. Cost: $0.02",
    {},
    premiumPaid("Smart money activity")(
      async () => {
        const data = await getSmartMoneyActivity();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === PROTOCOL TOOLS ===

  mcpServer.tool(
    "get_base_protocols",
    "All Base protocol stats — TVL, categories, top protocols. From DeFiLlama. Cost: $0.01",
    {},
    standardPaid("Base protocols")(
      async () => {
        const data = await getBaseProtocolStats();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === WHALE TOOLS ===

  mcpServer.tool(
    "get_whale_alerts",
    "Get recent whale alerts on Base — large transfers, whale buys/sells, pool activity. Cost: $0.01",
    {
      min_amount: z.number().optional().describe("Minimum USD amount to flag (default $10,000)"),
      limit: z.number().optional().describe("Max alerts to return (default 50)"),
    },
    standardPaid("Whale alerts")(
      async (args) => {
        const data = await getWhaleAlerts({
          minAmount: args.min_amount || 10000,
          limit: Math.min(args.limit || 50, 100),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_token_whale_activity",
    "Get whale activity for a specific token — holder concentration, top holders, risk score. Cost: $0.02",
    { address: z.string().describe("Token contract address (0x...)") },
    premiumPaid("Token whale activity")(
      async (args) => {
        const data = await getTokenWhaleActivity(args.address, { limit: 30 });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_whale_movements",
    "What are whales doing across trending Base tokens — volume, buy/sell ratio, signals. Cost: $0.01",
    {
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    standardPaid("Whale movements")(
      async (args) => {
        const data = await getWhaleMovements({ limit: Math.min(args.limit || 20, 50) });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_whale_heatmap",
    "Whale heatmap — tokens ranked by whale activity score, accumulation/distribution signals. Cost: $0.01",
    {
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    standardPaid("Whale heatmap")(
      async (args) => {
        const data = await getWhaleHeatmap({ limit: Math.min(args.limit || 20, 50) });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  mcpServer.tool(
    "get_accumulation_signals",
    "Detect tokens being accumulated by large buyers — high volume, buying pressure, large avg tx. Cost: $0.02",
    {
      limit: z.number().optional().describe("Max results (default 10)"),
    },
    premiumPaid("Accumulation signals")(
      async (args) => {
        const data = await getAccumulationSignals({ limit: Math.min(args.limit || 10, 30) });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    )
  );

  // === EXPRESS SERVER FOR SSE TRANSPORT ===

  const app = express();
  let sseTransport = null;

  app.get("/sse", async (req, res) => {
    sseTransport = new SSEServerTransport("/messages", res);
    await mcpServer.connect(sseTransport);
  });

  app.post("/messages", async (req, res) => {
    if (sseTransport) {
      await sseTransport.handlePostMessage(req, res);
    } else {
      res.status(400).json({ error: "No active SSE connection" });
    }
  });

  // Health check
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      protocol: "MCP",
      transport: "SSE",
      payTo: PAY_TO,
      tools: 18,
      version: "5.0.0-whale",
    });
  });

  app.listen(MCP_PORT, () => {
    console.log(`
=== MCP Server (Base Analytics) ===

Transport: SSE
URL: http://localhost:${MCP_PORT}/sse
Health: http://localhost:${MCP_PORT}/health

Tools (18):
  WALLET:
    get_portfolio          ($0.005) — token balances
    get_tx_history         ($0.01)  — transaction history
    get_wallet_summary     ($0.02)  — full analytics

  YIELDS:
    get_defi_yields        ($0.02)  — Morpho, Moonwell, Aerodrome
    get_best_yield         ($0.01)  — best yield per asset

  SAFETY:
    check_token_safety     ($0.02)  — rug detection
    check_wallet_risk      ($0.03)  — risk scoring

  SNIPER:
    find_token_snipers     ($0.01)  — early buyers
    get_trending_snipers   ($0.01)  — top snipers

  SMART MONEY:
    analyze_smart_money_wallet  ($0.02) — wallet scoring
    find_smart_money_buyers     ($0.02) — token buyers
    get_smart_money_activity    ($0.02) — trending activity

  WHALE ALERTS:  [NEW]
    get_whale_alerts           ($0.01) — large transfers & swaps
    get_token_whale_activity   ($0.02) — holder concentration
    get_whale_movements        ($0.01) — cross-token whale activity
    get_whale_heatmap          ($0.01) — accumulation/distribution
    get_accumulation_signals   ($0.02) — buying pressure detection

  PROTOCOLS:
    get_base_protocols     ($0.01)  — DeFiLlama data

Payments -> ${PAY_TO}
Network: Base (eip155:8453)
    `);
  });
}

main();
