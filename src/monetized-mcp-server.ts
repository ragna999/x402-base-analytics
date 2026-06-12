import {
  MonetizedMCPServer,
  type MakePurchaseRequest,
  type MakePurchaseResponse,
  type PaymentMethodsResponse,
  type PriceListingRequest,
  type PriceListingResponse,
  PaymentsTools,
  PaymentMethods,
} from "monetizedmcp-sdk";
import { v4 as uuidv4 } from "uuid";

// Config
const SERVER_WALLET_ADDRESS = process.env.SERVER_WALLET_ADDRESS;
if (!SERVER_WALLET_ADDRESS) {
  console.error("ERROR: SERVER_WALLET_ADDRESS not set in .env");
  process.exit(1);
}

// === PURCHASABLE ITEMS ===

const purchasableItems = [
  // WALLET ANALYTICS
  {
    id: "wallet-portfolio",
    name: "Get Wallet Portfolio",
    description: "Get token portfolio for a wallet on Base, Arbitrum, Celo. Returns native + ERC-20 balances.",
    price: { amount: 0.005, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "wallet",
  },
  {
    id: "wallet-summary",
    name: "Get Wallet Summary",
    description: "Full wallet analytics: portfolio, history, activity stats. Supports Base, Arbitrum, Celo.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "wallet",
  },

  // TOKEN SAFETY
  {
    id: "token-safety",
    name: "Check Token Safety",
    description: "Token safety analysis — rug risk, honeypot check, holder analysis. Uses GoPlus Security data.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "safety",
  },
  {
    id: "wallet-risk",
    name: "Check Wallet Risk",
    description: "Wallet risk scoring — age, activity patterns, scam interaction, bot detection.",
    price: { amount: 0.03, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { address: "0x..." },
    category: "safety",
  },

  // DEFI YIELDS
  {
    id: "defi-yields",
    name: "Get DeFi Yields",
    description: "Real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "defi",
  },
  {
    id: "best-yield",
    name: "Get Best Yield",
    description: "Best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { asset: "USDC" },
    category: "defi",
  },

  // SMART MONEY
  {
    id: "smart-money-wallet",
    name: "Analyze Smart Money Wallet",
    description: "Smart money analysis for a wallet — score 0-100, classification, trading patterns.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { address: "0x..." },
    category: "smart-money",
  },
  {
    id: "smart-money-token",
    name: "Find Smart Money Buyers",
    description: "Find smart money buyers of a token — who's buying, still holding, signal strength.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { address: "0x..." },
    category: "smart-money",
  },
  {
    id: "smart-money-activity",
    name: "Get Smart Money Activity",
    description: "What smart money wallets are buying right now on Base — scans trending tokens.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "smart-money",
  },

  // WHALE TRACKING
  {
    id: "whale-alerts",
    name: "Get Whale Alerts",
    description: "Recent whale alerts — large transfers from known whale wallets.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { min_amount: 10000, limit: 50 },
    category: "whale",
  },
  {
    id: "whale-heatmap",
    name: "Get Whale Heatmap",
    description: "Whale heatmap — tokens ranked by whale activity score.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { limit: 20 },
    category: "whale",
  },
  {
    id: "whale-accumulation",
    name: "Get Accumulation Signals",
    description: "Detect tokens being accumulated by large buyers — high volume, buying pressure.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { limit: 10 },
    category: "whale",
  },

  // SNIPER TRACKING
  {
    id: "token-snipers",
    name: "Find Token Snipers",
    description: "Early buyers (snipers) analysis for a token — who bought before the pump.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { address: "0x..." },
    category: "sniper",
  },
  {
    id: "trending-snipers",
    name: "Get Trending Snipers",
    description: "Top snipers from trending tokens — wallets that buy early on multiple tokens.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "sniper",
  },

  // PROTOCOL STATS
  {
    id: "base-protocols",
    name: "Get Base Protocols",
    description: "All Base protocol stats — TVL, categories, top protocols. Data from DeFiLlama.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "protocol",
  },
  {
    id: "base-movers",
    name: "Get Base Movers",
    description: "Top gainers and losers on Base in 24h by TVL change.",
    price: { amount: 0.01, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "protocol",
  },

  // AGGREGATED INTELLIGENCE
  {
    id: "token-intelligence",
    name: "Get Token Intelligence",
    description: "Complete token intelligence — safety + whale + smart money + snipers combined.",
    price: { amount: 0.05, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { address: "0x..." },
    category: "intelligence",
  },
  {
    id: "wallet-intelligence",
    name: "Get Wallet Intelligence",
    description: "Complete wallet intelligence — portfolio + smart money + sniper + risk combined.",
    price: { amount: 0.05, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { address: "0x..." },
    category: "intelligence",
  },
  {
    id: "market-pulse",
    name: "Get Market Pulse",
    description: "Real-time market pulse — whale picks + smart money activity + top movers + yields.",
    price: { amount: 0.05, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "intelligence",
  },

  // P&L TRACKER
  {
    id: "portfolio-pnl",
    name: "Get Portfolio P&L",
    description: "Full portfolio P&L — realized + unrealized, cost basis, win/loss ratio, per-token breakdown.",
    price: { amount: 0.05, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "pnl",
  },
  {
    id: "pnl-summary",
    name: "Get P&L Summary",
    description: "P&L summary — total realized/unrealized, win rate, best/worst trades.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "pnl",
  },

  // SOCIAL SIGNALS
  {
    id: "social-token",
    name: "Get Token Social",
    description: "Aggregated social presence for a token — Twitter, Telegram, Discord, Farcaster, trust score.",
    price: { amount: 0.03, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "social",
  },
  {
    id: "social-sentiment",
    name: "Get Social Sentiment",
    description: "Multi-source social sentiment — Farcaster, GeckoTerminal, DexScreener.",
    price: { amount: 0.03, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { keyword: "bitcoin" },
    category: "social",
  },

  // DEX AGGREGATOR
  {
    id: "dex-quote",
    name: "Get DEX Quote",
    description: "Best DEX swap quote — compares Aerodrome, Uniswap V3, SushiSwap, PancakeSwap. Returns best route.",
    price: { amount: 0.005, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", from: "ETH", to: "USDC", amount: 1 },
    category: "dex",
  },

  // GAS & APPROVALS
  {
    id: "gas-prices",
    name: "Get Gas Prices",
    description: "Real-time gas prices across all chains — Base, ETH, Arbitrum, Optimism, Polygon.",
    price: { amount: 0.001, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: {},
    category: "gas",
  },
  {
    id: "token-approvals",
    name: "Scan Token Approvals",
    description: "Scan wallet token approvals — detect unlimited approvals, security risks.",
    price: { amount: 0.02, paymentMethod: PaymentMethods.USDC_BASE_MAINNET },
    params: { chain: "base", address: "0x..." },
    category: "safety",
  },
];

// Payment methods
const paymentMethodsList: PaymentMethodsResponse[] = [
  {
    walletAddress: SERVER_WALLET_ADDRESS as `0x${string}`,
    paymentMethod: PaymentMethods.USDC_BASE_MAINNET,
  },
];

// === SERVER ===

export class RagRadarMCPServer extends MonetizedMCPServer {
  async priceListing(
    request: PriceListingRequest
  ): Promise<PriceListingResponse> {
    const items = request.searchQuery
      ? purchasableItems.filter((item) =>
          item.name.toLowerCase().includes(request.searchQuery!.toLowerCase()) ||
          item.description.toLowerCase().includes(request.searchQuery!.toLowerCase()) ||
          item.category.toLowerCase().includes(request.searchQuery!.toLowerCase())
        )
      : purchasableItems;
    return { items };
  }

  async paymentMethods(): Promise<PaymentMethodsResponse[]> {
    return paymentMethodsList;
  }

  async makePurchase(
    request: MakePurchaseRequest
  ): Promise<MakePurchaseResponse> {
    console.log("makePurchase", request);

    try {
      const paymentsTools = new PaymentsTools();

      const item = purchasableItems.find(
        (item) =>
          item.id === request.itemId &&
          item.price.paymentMethod === request.paymentMethod
      );

      if (!item) {
        return {
          purchasableItemId: request.itemId,
          makePurchaseRequest: request,
          orderId: uuidv4(),
          toolResult: "Item not found. Please check the item ID and payment method.",
        };
      }

      console.log(`Processing: ${item.name} | $${item.price.amount}`);

      const payment = await paymentsTools.verifyAndSettlePayment(
        item.price.amount,
        SERVER_WALLET_ADDRESS as `0x${string}`,
        {
          facilitatorUrl: "https://x402.org/facilitator",
          paymentHeader: request.signedTransaction,
          resource: "https://ragradar.vercel.app",
          paymentMethod: request.paymentMethod,
        }
      );

      if (payment.success) {
        return {
          purchasableItemId: request.itemId,
          makePurchaseRequest: request,
          orderId: uuidv4(),
          toolResult: `Payment successful. Access ${item.name} at https://ragradar.vercel.app/api/...`,
        };
      }

      return {
        purchasableItemId: request.itemId,
        makePurchaseRequest: request,
        orderId: uuidv4(),
        toolResult: `Payment failed: ${payment.error || "Unknown error"}`,
      };
    } catch (error) {
      console.error("Purchase error:", error);
      return {
        purchasableItemId: request.itemId,
        makePurchaseRequest: request,
        orderId: uuidv4(),
        toolResult: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  constructor() {
    super();
    super.runMonetizeMCPServer();
  }
}

// Start
new RagRadarMCPServer();
console.log(`RagRadar MonetizedMCP server started`);
console.log(`Wallet: ${SERVER_WALLET_ADDRESS}`);
console.log(`Items: ${purchasableItems.length}`);
