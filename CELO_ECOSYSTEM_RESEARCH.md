# Celo Chain Ecosystem Research - x402 Paid API Analytics
## Date: 2026-06-09 | Chain ID: 42220 | Current TVL: ~$18.5M

---

## 1. FREE PUBLIC RPC ENDPOINTS

| Endpoint | Status | Notes |
|----------|--------|-------|
| https://forno.celo.org | WORKING | Official Celo RPC, no key needed |
| https://rpc.ankr.com/celo | WORKING | Ankr free tier, no key needed |
| https://celo-mainnet.public.blastapi.io | WORKING | Blast free tier |
| https://1rpc.io/celo | WORKING | 1RPC privacy-focused |

Rate Limits: forno.celo.org - no published limits, generous for reads
Ankr: 30 req/sec | Blast: 25 req/sec

---

## 2. BLOCK EXPLORER APIs

### A. Blockscout (celo.blockscout.com) - PRIMARY, NO API KEY

| Endpoint | Description |
|----------|-------------|
| /api/v2/stats | Chain stats (TVL, gas, addresses, txs) |
| /api/v2/transactions | Recent transactions |
| /api/v2/transactions/{hash} | Single tx detail with token transfers |
| /api/v2/addresses/{addr}/transactions | Address tx history |
| /api/v2/addresses/{addr}/token-transfers | Token transfer history |
| /api/v2/addresses/{addr}/tokens?type=ERC-20 | Token portfolio |
| /api/v2/addresses/{addr} | Address info + balance |
| /api/v2/tokens?type=ERC-20 | Token list with market cap, holders |
| /api/v2/tokens/{contract} | Token detail (supply, holders, price) |
| /api/v2/smart-contracts/{addr} | Contract source code + ABI |
| /api/v2/main-page/blocks | Recent blocks |

Rate Limits: No published limits, no API key needed. Very generous.

### B. Celoscan V1 - DEPRECATED
V1 API returns deprecation notice. Must use Etherscan V2 API.

### C. Etherscan V2 API for Celo
GET https://api.etherscan.io/v2/api?chainid=42220&module=account&action=balance&address={addr}&tag=latest
REQUIRES: &apikey=YOUR_KEY (free tier available)
Free tier: 5 calls/sec, 100K calls/day

RECOMMENDATION: Use Blockscout as PRIMARY (no key, no limits).

---

## 3. TOP DEXs ON CELO

### A. Uniswap V3 (on Celo) - Active, highest volume
Top Pool: USDT/WETH 0.01% (0xf55791afbb35ad42984f18d6fe3e1ff73d81900c)
Data: GeckoTerminal, DEXScreener, on-chain Uniswap V3 contracts

### B. Ubeswap V2 (AMM) + V3 (CLMM) - Active, Celo-native
UBE Token: 0x71e26d0E519D14591b9dE9a0fE9513A398101490
Data: GeckoTerminal, DEXScreener

### C. Mobius Money (StableSwap) - DEAD (historical data only)

### GeckoTerminal API (FREE, No Key, 30/min)
- GET /api/v2/networks/celo/trending_pools?page=1
- GET /api/v2/networks/celo/pools?sort=h24_volume_usd_desc
- GET /api/v2/networks/celo/tokens/{address}
- GET /api/v2/networks/celo/dexes/{dex_name}/pools

### DEXScreener API (FREE, No Key, ~60/min)
- GET /latest/dex/pairs/celo/{pair_address}
- GET /latest/dex/tokens/{token_address}

---

## 4. MAJOR DEFI PROTOCOLS

### A. Moola Market (Lending) - ACTIVE
Aave V2 fork, supports CELO/cUSD/cEUR
Contract: 0x17700282592D6917F6A73D0bF8AcCf4D578c131e
Data: DeFiLlama, Blockscout (verified ABI)

### B. Ubeswap V2 + V3 (DEX) - ACTIVE
AMM + CLMM, Data: GeckoTerminal, DEXScreener, DeFiLlama

### C. stCELO (Liquid Staking) - ACTIVE, TVL $1.23M
URL: https://stcelo.xyz/
Data: DeFiLlama /api/protocol/stCelo

### D. UpDown (Perpetuals) - ACTIVE
Perpetual exchange, up to 100x leverage
Data: DeFiLlama dimensions API

### E. Poof Cash (Lending/Privacy) - DEAD, $173K frozen TVL

### DeFiLlama Endpoints for Celo
- GET /api/protocols (filter chain=Celo)
- GET /api/protocol/{slug}
- GET /v2/chains (Celo TVL: $18.5M)
- GET /v2/historicalChainTvl/Celo (history since May 2020)
- GET yields.llama.fi/pools (68 Celo pools)
Rate Limits: Very generous, no key needed

---

## 5. TOKEN DATA APIs

### A. CoinGecko (FREE tier, 10-30/min without key)
- GET /api/v3/simple/price?ids=celo,celo-dollar,celo-euro&vs_currencies=usd
- GET /api/v3/coins/celo/market_chart?vs_currencies=usd&days=30

### B. GeckoTerminal (FREE, No Key, 30/min)
- GET /api/v2/networks/celo/tokens/{address}
- Data: Price, FDV, volume, pool info, price changes

### C. DEXScreener (FREE, No Key, ~60/min)
- GET /latest/dex/tokens/{address}
- Data: Real-time price, volume, liquidity, txns

### D. Blockscout Token API (FREE, No Key)
- GET /api/v2/tokens?type=ERC-20
- GET /api/v2/tokens/{contract}
- Data: Holders count, market cap, exchange rate, volume 24h

---

## 6. WHALE TRACKING / SMART MONEY

### Data Sources
1. Blockscout (Primary):
   - /api/v2/addresses/{addr}/token-transfers
   - /api/v2/addresses/{addr}/transactions
   - /api/v2/tokens?type=ERC-20 (top tokens)

2. GeckoTerminal (Volume/Whale detection):
   - Pool transaction counts per time window
   - transactions.m5/buys/sells/buyers/sellers per pool

3. On-chain via RPC (Custom):
   - eth_getLogs with Transfer event filtering
   - Track large transfers by value threshold

### Approach
- Poll Blockscout token-transfers for large value movements
- Track top holders via token holders endpoint
- Monitor cUSD/cEUR/USDT transfers > $10K threshold

---

## 7. DeFiLlama SUPPORT FOR CELO

### Confirmed Working
- yields.llama.fi/pools -> 68 yield pools
- api.llama.fi/protocols -> ~12 protocols (6 active)
- api.llama.fi/v2/historicalChainTvl/Celo -> TVL history since 2020
- stablecoins.llama.fi/stablecoins -> cUSD $15.5M, cEUR $2M, USDT $131M on Celo
- stablecoins.llama.fi/stablecoincharts/Celo -> Stablecoin history

### Active Celo Protocols on DeFiLlama
1. stCELO - Liquid Staking, TVL $1.23M
2. Moola Market - Lending, active
3. Ubeswap V2 - AMM DEX
4. Ubeswap V3 - CLMM DEX
5. UpDown - Perpetuals (new 2025)
6. Poof Cash - Lending (dead, $173K frozen)

---

## 8. CELO-SPECIFIC UNIQUE DATA

### A. Celo Native Tokens
### B. Staking & Validator Elections
### C. Gasless Transactions (Meta-transactions)
### D. MiniPay Data
### E. Phone Number Mapping (ODIS)
### F. Celo Network Stats (from Blockscout)
---

## 8. CELO-SPECIFIC UNIQUE DATA

### A. Celo Native Tokens
CELO: 0x471EcE3750Da237f93B8E339c536989b8978a438 (18 dec)
cUSD: 0x765DE816845861e75A25fCA122bb6898B8B1282a (18 dec)
cEUR: 0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73 (18 dec)
cREAL: 0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787 (18 dec)

### B. Staking and Validator Elections
Epoch system: Current epoch #2222
Block time: ~1 second
Validator elections: On-chain via Election contract
stCELO: Liquid staking at stcelo.xyz

### C. Gasless Transactions (Meta-transactions)
Celo supports fee abstraction: pay gas in cUSD/cEUR/CELO
Transaction type 0x7b (123) = Celo native fee currency tx
Detect via feeCurrency field in transaction

### D. MiniPay Data
MiniPay is Celo mobile-first wallet (Opera partnership)
No public MiniPay-specific API
Can identify by known contract interactions

### E. Phone Number Mapping (ODIS)
ODIS: Phone number to address mapping
NOT publicly queryable (privacy-preserving)

### F. Celo Network Stats (from Blockscout)
Total Addresses: 232,749,043
Total Transactions: 1,348,697,747
Total Blocks: 69,141,892
Transactions Today: 1,009,163
CELO Price: $0.059
CELO Market Cap: $35.6M
CELO Holders: 38,495,232

---

## ANALYTICS ENDPOINTS WE CAN BUILD

### Tier 1 - Easy (Blockscout + free APIs)
1. Wallet Portfolio: Blockscout /addresses/{addr}/tokens
2. Transaction History: Blockscout /addresses/{addr}/transactions
3. Token Transfer History: Blockscout /addresses/{addr}/token-transfers
4. Chain Stats: Blockscout /stats
5. Token Info: Blockscout /tokens/{contract}
6. Top Tokens: Blockscout /tokens?type=ERC-20

### Tier 2 - Medium (Combine sources)
7. DeFi Yields: DeFiLlama yields (68 Celo pools)
8. DEX Pool Data: GeckoTerminal trending/top pools
9. Token Prices: CoinGecko + GeckoTerminal + DEXScreener
10. Stablecoin Stats: DeFiLlama stablecoins
11. Protocol TVL Rankings: DeFiLlama protocols
12. Whale Alerts: Blockscout token-transfers + value filtering

### Tier 3 - Advanced (Custom indexing)
13. Smart Money Tracking: Track known addresses + large movements
14. CELO Staking Analytics: Epoch info, validator data from contracts
15. Gasless Tx Analysis: Filter type-123 transactions
16. MiniPay Activity: Track known MiniPay contracts
17. Cross-chain Stablecoin Flows: cUSD/cEUR minting/burning
18. DeFi Position Tracking: Moola lending positions via contract calls

---

## RATE LIMITS SUMMARY

Source: forno.celo.org | Rate: Unlimited (est) | Key: No | Best For: RPC calls
Source: celo.blockscout.com | Rate: Unlimited (est) | Key: No | Best For: Tx, addresses, tokens
Source: GeckoTerminal | Rate: 30/min | Key: No | Best For: DEX pools, token prices
Source: DEXScreener | Rate: ~60/min | Key: No | Best For: Real-time DEX data
Source: CoinGecko | Rate: 10-30/min | Key: No | Best For: Token prices, market data
Source: DeFiLlama | Rate: Unlimited (est) | Key: No | Best For: TVL, yields, stablecoins
Source: Etherscan V2 | Rate: 5/sec, 100K/day | Key: Yes (free) | Best For: Backup explorer

---

## RECOMMENDED STACK FOR CELO x402 ENDPOINTS

1. Primary Explorer: Blockscout (no key, generous limits)
2. DEX Data: GeckoTerminal (pools) + DEXScreener (prices)
3. DeFi/Yields: DeFiLlama
4. Token Prices: CoinGecko (free key) + GeckoTerminal
5. Stablecoins: DeFiLlama stablecoins API
6. RPC: forno.celo.org
7. Whale Tracking: Blockscout token-transfers with custom filtering
