# Arbitrum Chain Ecosystem Research - x402 Paid API Analytics

## 1. FREE PUBLIC RPC ENDPOINTS (No API Key)

Verified via live testing:
- https://arb1.arbitrum.io/rpc (Official, VERIFIED) - primary
- https://1rpc.io/arb (Ankr 1RPC, VERIFIED) - fallback
- https://arbitrum-one.publicnode.com (PublicNode, VERIFIED) - fallback
- https://arbitrum.drpc.org (dRPC, VERIFIED) - fallback
- https://rpc.ankr.com/arbitrum (NOW NEEDS KEY)

All RPCs use chain ID 42161. Same JSON-RPC interface as Base.

## 2. BLOCK EXPLORER APIs

### A) Blockscout for Arbitrum (FREE, NO API KEY) - PRIMARY
Base URL: https://arbitrum.blockscout.com/api/v2
Rate Limits: ~5-10 req/s (no key needed)
Same API shape as base.blockscout.com/api/v2

Key Endpoints:
- GET /addresses/{address}/transactions - tx history with pagination
- GET /addresses/{address}/token-balances - ERC-20 token balances
- GET /addresses/{address}/token-transfers - token transfer history
- GET /tokens/{address}/transfers - token transfer history
- GET /tokens/{address}/holders - token holders list
- GET /main-page/transactions - latest transactions
- GET /main-page/blocks - latest blocks
- GET /transactions/{tx_hash} - tx details
- GET /addresses/{address} - address info + ETH balance

### B) Arbiscan / Etherscan V2 (REQUIRES FREE API KEY)
Base URL: https://api.etherscan.io/v2/api?chainid=42161
Status: REQUIRES API KEY (confirmed via live testing)
Free Tier: 5 calls/sec, 100K calls/day (free registration)

Recommendation: Blockscout as primary (no key). Etherscan V2 as backup.

## 3. TOP DEXs ON ARBITRUM

### A) Uniswap V3 (Highest volume)
- Router: 0xE592427A0AEce92De3Edee1F18E0157C05861564
- Quoter V2: 0x61fFE014bA17989E743c5F6cB21bF9697530B21e
- Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984
- Fee Tiers: 100/500/3000/10000

### B) Camelot DEX (Arbitrum-native, top volume)
- Router: 0xc873fEcbd354f5A56E00E710B90EF4201db2448d
- Factory: 0x6EcCab422D763aC031210895C81787E87B43A652
- Uses Algebra-style concentrated liquidity

### C) GMX V2 (Perps + spot)
- Router: 0x7C68C7866A64FA2160F78eaeA2B1452C516D1f4D
- Data API: https://arbitrum-api.gmxinfra.io/ (FREE, no key)
- Endpoints: /positions, /orders, /stats, /tokens

### D) SushiSwap V3
- Router: 0x0116AbC6b063B2f4aD58a2837e5062ACbC58B27e

### E) Ramses Exchange (Solidly-style, Arbitrum-native)
- Router: 0xAAA20D08e59f6561f249b130496158B0Cf541455

### F) Trader Joe V2.1
- Router: 0xb4315e873dBcf96fD0Cd8EdF6b98D2b59bEBfa66

All DEXs have data on GeckoTerminal and DexScreener (both free, no key).

## 4. MAJOR DeFi PROTOCOLS AND DATA SOURCES

### A) GMX V2 (Arbitrum flagship perps)
- FREE API: https://arbitrum-api.gmxinfra.io/
- Analytics: open interest, funding rates, liquidations, GLP yield, trader PnL

### B) Aave V3
- Pool: 0x794a61358D6845594F94dc1DB02A252b5b4814aD
- UiPoolDataProvider: 0x38Dce46C6c7b6fD23e4864EB706f326Afa8fDF0c

### C) Radiant Capital V2
- Lending Pool: 0xF4B14861779Ef60a6576A01E2451BE275aE77685

### D) Pendle Finance
- FREE API: https://api-v2.pendle.finance/core/v1/
- GET /42161/markets - all Arbitrum Pendle markets

### E) Curve Finance
- API: https://api.curve.fi/v1/getPools/arbitrum/main (free)

### F) Compound V3
- Comet: 0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA

## 5. TOKEN DATA APIs (ALL FREE, NO KEY)

### A) GeckoTerminal API v2 (by CoinGecko)
Base URL: https://api.geckoterminal.com/api/v2
Rate Limit: ~30 req/min (free, no key)

Key Endpoints:
- GET /networks/arbitrum/trending_pools - trending pools
- GET /networks/arbitrum/new_pools - newly created pools
- GET /networks/arbitrum/pools/{pool_address} - pool data
- GET /networks/arbitrum/tokens/{token_address} - token data
- GET /networks/arbitrum/pools/{pool_address}/ohlcv/{timeframe} - OHLCV
- GET /networks/arbitrum/tokens/{token_address}/pools - token pools
- GET /networks/arbitrum/pools/{address}/trades - recent trades
- GET /search/pools?query={name}&network=arbitrum - search

### B) DexScreener API (FREE, NO KEY)
Base URL: https://api.dexscreener.com
Rate Limit: ~60 req/min

Key Endpoints:
- GET /latest/dex/tokens/{address} - token pairs and prices
- GET /latest/dex/search?q={query} - search pairs
- GET /latest/dex/pairs/arbitrum/{pairAddress} - pair data

### C) GoPlus Security API (FREE, NO KEY)
- GET /token_security/42161?contract_addresses={addr} - token safety
- Chain ID for Arbitrum: 42161

## 6. WHALE TRACKING / SMART MONEY DATA SOURCES

### Primary: Blockscout Arbitrum
- URL: https://arbitrum.blockscout.com/api/v2
- Track large transfers via token transfer API
- Monitor whale wallets via address tx history
- Token holder rankings

### Known Whale Addresses on Arbitrum
- Binance: 0xB38e8c17e38363aF9EdbE1f07eFDa4091b1f3d24
- Binance 14: 0x28c6c06298d514db089934071355e5743bf21d60
- Coinbase: 0x56Eddb7aa87536c09CCc2793473599fD21A8b17F
- Wintermute: 0x0000006daea1723962647b7e189d311d757Fb793
- Jump Trading: 0xf584F8728B874a6a5c7A8d4d387C9aae9172D621

## 7. DeFiLlama SUPPORT FOR ARBITRUM (FREE, NO KEY)

- Protocol TVL: https://api.llama.fi/protocols (filter chains: Arbitrum)
- Yield Pools: https://yields.llama.fi/pools (filter chain: Arbitrum)
- TVL History: https://api.llama.fi/v2/historicalChainTvl/Arbitrum
- Protocol Detail: https://api.llama.fi/protocol/{slug}
- DEX Volume: https://api.llama.fi/overview/dexs/arbitrum
- Fees/Revenue: https://api.llama.fi/overview/fees/arbitrum
- All endpoints free, no API key needed. Cache 10min recommended.

## 8. ARBITRUM-SPECIFIC UNIQUE DATA

### A) GMX V2 Perpetuals (FLAGSHIP)
- API: https://arbitrum-api.gmxinfra.io/
- Unique Analytics:
  - Open interest (long/short ratios)
  - Funding rates per market
  - Liquidation events
  - GLP/GM yield stats
  - Trader PnL leaderboard
  - Fee distribution to stakers

### B) Arbitrum Stylus Contracts
- Enables Rust/C/C++ smart contracts alongside Solidity
- Detection: Check contract bytecode magic bytes
- Very few chains have this - differentiator

### C) Orbit Chains (Arbitrum L3s)
- Framework for L3 deployment
- Known: Xai (gaming), Rari, Parallel
- Cross-chain activity tracking between L2 and L3

### D) ARB Token Governance
- ARB Token: 0x912CE59144191C1204E64559FE8253a0e49E6548
- On-chain voting, delegate tracking

### E) Timeboost (Arbitrum-specific MEV)
- Transaction ordering policy unique to Arbitrum

## 9. PROPOSED ARBITRUM x402 API ENDPOINTS (24 total)

### Tier 1: Direct Port from Base (12 endpoints)
1. GET /api/arb/portfolio/:address - $0.005 (Blockscout + RPC)
2. GET /api/arb/history/:address - $0.01 (Blockscout)
3. GET /api/arb/token-safety/:address - $0.005 (GoPlus chain=42161)
4. GET /api/arb/wallet-risk/:address - $0.01 (Blockscout + on-chain)
5. GET /api/arb/whale-alerts - $0.01 (Blockscout transfers)
6. GET /api/arb/whale-heatmap - $0.01 (Blockscout)
7. GET /api/arb/smart-money/:address - $0.01 (Blockscout + DexScreener)
8. GET /api/arb/defi-yields - $0.005 (DeFiLlama)
9. GET /api/arb/protocol-stats - $0.005 (DeFiLlama)
10. GET /api/arb/market-movers - $0.005 (GeckoTerminal)
11. GET /api/arb/token-intelligence/:address - $0.02 (Aggregated)
12. GET /api/arb/wallet-intelligence/:address - $0.02 (Aggregated)

### Tier 2: Arbitrum-Unique Endpoints (12 NEW)
13. GET /api/arb/gmx/perps-stats - $0.01 (GMX API)
14. GET /api/arb/gmx/funding-rates - $0.01 (GMX API)
15. GET /api/arb/gmx/liquidations - $0.01 (GMX API + on-chain)
16. GET /api/arb/gmx/glp-yield - $0.005 (GMX API)
17. GET /api/arb/gmx/trader-leaderboard - $0.015 (GMX API)
18. GET /api/arb/arb-token/governance - $0.005 (On-chain)
19. GET /api/arb/arb-scanner - $0.01 (Multi-DEX on-chain)
20. GET /api/arb/trending-tokens - $0.005 (GeckoTerminal)
21. GET /api/arb/new-tokens - $0.005 (GeckoTerminal)
22. GET /api/arb/pool-heatmap - $0.01 (DeFiLlama + GeckoTerminal)
23. GET /api/arb/pendle-yields - $0.005 (Pendle API + DeFiLlama)
24. GET /api/arb/defi-dashboard/:address - $0.02 (Aggregated)

## 10. ARBITRUM KEY TOKENS

WETH: 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1 (18 decimals)
USDC: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (6 decimals, native)
USDC.e: 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 (6 decimals, bridged)
USDT: 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9 (6 decimals)
DAI: 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 (18 decimals)
ARB: 0x912CE59144191C1204E64559FE8253a0e49E6548 (18 decimals)
GMX: 0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a (18 decimals)
PENDLE: 0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8 (18 decimals)
wstETH: 0x5979D7b546E38E9Ab8097Bc10a59136E7Bc0B328 (18 decimals)
GNS: 0x18c11FD286C5EC11c3b683Caa813B77f5163A122 (18 decimals)

## 11. IMPLEMENTATION NOTES

### RPC (same as Base, swap URL)
const ARB_RPC = "https://arb1.arbitrum.io/rpc";

### Blockscout (same as Base, swap URL)
const BLOCKSCOUT = "https://arbitrum.blockscout.com/api/v2";

### GoPlus (same as Base, change chain ID)
const GOPLUS_CHAIN_ID = "42161";

### DeFiLlama (same as Base, change chain filter)
const CHAIN = "Arbitrum";

### GMX-Specific (NEW)
const GMX_API = "https://arbitrum-api.gmxinfra.io/";

### Pendle-Specific (NEW)
const PENDLE_API = "https://api-v2.pendle.finance/core/v1";

## 12. SUMMARY

Verified FREE data sources (no API keys):
- Official Arbitrum RPC, 1RPC, PublicNode, dRPC
- Blockscout Arbitrum (same API shape as Base)
- GoPlus Security (chain 42161)
- GeckoTerminal (Arbitrum network)
- DexScreener (Arbitrum support)
- DeFiLlama (full Arbitrum support)
- GMX API (Arbitrum-specific, free)
- Pendle API (Arbitrum support, free)

Needs API Key:
- Ankr RPC (now requires key)
- Etherscan V2 / Arbiscan (needs free key registration)

Total: 24 endpoints (12 port + 12 Arbitrum-unique)
Est. Dev Time: 2-3 days (most code copy+adapt from Base)
