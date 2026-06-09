# Polygon Chain Ecosystem Research - For x402 Paid API

Date: June 9, 2026
Chain ID: 137 (PoS) | 1101 (zkEVM)
Native Token: POL (formerly MATIC)
Price: ~$0.076
TVL: ~$1.05B | Yield Pools: 571 | Protocols: ~1,566

## 1. FREE PUBLIC RPC ENDPOINTS

### VERIFIED WORKING (No API Key)

PublicNode: https://polygon-bor-rpc.publicnode.com  (WebSocket: wss://polygon-bor-rpc.publicnode.com)
DRPC: https://polygon.drpc.org

### NEEDS FREE API KEY

Ankr: https://rpc.ankr.com/polygon (free key at ankr.com)
Alchemy: https://polygon-mainnet.g.alchemy.com/v2/KEY (free 300M CU/month)
Infura: https://polygon-mainnet.infura.io/v3/KEY (free 100K req/day)

### NO LONGER FREE

polygon-rpc.com - deprecated
Blast API - acquired by Alchemy
LlamaNodes - not resolving

## 2. POLYGONSCAN API

Base: https://api.polygonscan.com/api
Free tier: 5 calls/sec, 100K calls/day, free key registration

Key endpoints:
- ?module=account&action=txlist&address=ADDR&sort=desc
- ?module=account&action=tokentx&address=ADDR&sort=desc
- ?module=account&action=tokennfttx&address=ADDR
- ?module=account&action=balance&address=ADDR&tag=latest
- ?module=account&action=balancemulti&address=ADDR1,ADDR2&tag=latest
- ?module=account&action=tokenbalance&contractaddress=TOKEN&address=ADDR&tag=latest
- ?module=account&action=txlistinternal&address=ADDR
- ?module=contract&action=getabi&address=ADDR
- ?module=contract&action=getsourcecode&address=ADDR
- ?module=stats&action=tokensupply&contractaddress=TOKEN
- ?module=token&action=tokenholderlist&contractaddress=TOKEN&page=1&offset=100
- ?module=gastracker&action=gasoracle
- ?module=proxy&action=eth_blocknumber

zkEVM API: https://api-zkevm.polygonscan.com/api (same patterns)

## 3. TOP DEXs

### QuickSwap (V2+V3) - #1 DEX on Polygon
V2 Factory: 0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32
V2 Router: 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff
V3 Quoter: 0xf7d1543C6C4d93b652b9D00C59E67e6D1F6c4d7e

### Uniswap V3
Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984
Quoter: 0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6

### SushiSwap
Factory: 0xc35DADB65012eC5796536bD9864eD8773aBc74C4
Router: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

### Balancer V2
Vault: 0xBA12222222228d8Ba445958a75a0704d566BF2C8

### Curve Finance
API: https://api.curve.fi/v1/getPools/polygon/main

## 4. DeFi PROTOCOLS

### Aave V3
Pool: 0x794a61358D6845594F94dc1DB02A252b5b4814aD
PoolDataProvider: 0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654
UIDataProvider: 0x1dDAF91C17835dB24728C12F2DbD5f09c5f41f64
Query: getReserveData(), getUserReserveData() via eth_call

### Compound V3
USDC Comet: 0xF25212E676D1F7F89Cd72fFEe66158f5D3b5baa3

### Stargate
Router: 0x45A01E4e04F14f7A4a6702c74187c5F6222033cd

## 5. TOKEN DATA APIs

### GeckoTerminal - VERIFIED
Base: https://api.geckoterminal.com/api/v2
Network: polygon_pos (NOT "polygon")

GET /networks/polygon_pos/trending_pools
GET /networks/polygon_pos/new_pools
GET /networks/polygon_pos/pools/{addr}
GET /networks/polygon_pos/tokens/{addr}
GET /networks/polygon_pos/tokens/{addr}/pools
GET /networks/polygon_pos/pools/{addr}/ohlcv/minute?aggregate=5
GET /networks/polygon_pos/pools/{addr}/trades
Rate: 30/min (no key), 500/min (free key)

### DexScreener - VERIFIED
Base: https://api.dexscreener.com/latest/dex

GET /tokens/{address}            - Token pairs all chains
GET /pairs/polygon/{pairAddress} - Polygon pair data
GET /search?q={query}            - Search
Rate: 300/min (no key!)

### CoinGecko - VERIFIED
Base: https://api.coingecko.com/api/v3
Platform: polygon-pos

GET /simple/token_price/polygon-pos?contract_addresses=ADDR&vs_currencies=usd
GET /coins/{id}/contract/{contract_address}
Rate: 10-30/min free (no key)

### Moralis
Base: https://deep-index.moralis.io/api/v2.2
Free: 40K CU/day, needs free key

## 6. WHALE TRACKING

### DIY via RPC (BEST FREE)
Monitor ERC-20 Transfer events via eth_getLogs with value thresholds

### DeBank
API: https://api.debank.com (chain=matic)
Status: Heavy rate limiting (429s)

### Whale Alert
API: https://api.whale-alert.io
Free: 100 calls/month (too limited)

### Nansen / Arkham
Paid only

## 7. DeFiLlama - VERIFIED EXCELLENT

571 yield pools on Polygon

### Yields
GET https://yields.llama.fi/pools (filter chain=Polygon)
GET https://yields.llama.fi/chart/{pool_id}
GET https://yields.llama.fi/pool/{pool_id}

### TVL
GET https://api.llama.fi/v2/historicalChainTvl/Polygon (VERIFIED)
GET https://api.llama.fi/protocols (~1566 on Polygon)
GET https://api.llama.fi/protocol/{name}

### DEX Volume
GET https://api.llama.fi/overview/dexs/polygon (VERIFIED)
GET https://api.llama.fi/overview/dexs/polygon/historical

Rate: Free, no key, generous

## 8. POLYGON-SPECIFIC

### zkEVM (Chain ID 1101)
RPC: https://zkevm-rpc.com (VERIFIED)
Explorer: https://zkevm.polygonscan.com

### PoS Bridge
RootChainManager: 0xA0c68C638235ee32657e8f720a23ceC1bFc77C77

### POL Token
Native gas token, EIP-1559, price ~$0.076

## RECOMMENDED x402 ENDPOINTS (19 total)

### Tier 1: Core Data
1. Wallet Portfolio (RPC eth_call balanceOf)
2. Transaction History (Polygonscan/RPC)
3. Token Transfers (Polygonscan tokentx)
4. Token Prices (GeckoTerminal/DexScreener/CoinGecko)
5. Pool Data (GeckoTerminal pools + OHLCV)

### Tier 2: DeFi
6. DeFi Yields (DeFiLlama 571 pools)
7. Aave V3 Positions (on-chain PoolDataProvider)
8. Protocol TVL (DeFiLlama)
9. DEX Volume (DeFiLlama)
10. Lending Rates (Aave+Compound on-chain)

### Tier 3: Advanced
11. Whale Alerts (eth_getLogs transfers)
12. Smart Money Tracker (whale wallet monitor)
13. New Token Scanner (GeckoTerminal new_pools)
14. Token Safety Score (holders+liquidity+verify)
15. Gas Price Tracker (RPC/Polygonscan)

### Tier 4: Polygon-Specific
16. zkEVM Stats (separate chain)
17. Bridge Flow Monitor (bridge contract events)
18. Staking Data (validator/delegation)
19. POL Economics (price+supply+gas)

## DATA SOURCE MATRIX

Endpoint          | Primary           | Fallback       | Key?
Wallet Portfolio  | PublicNode RPC    | DRPC           | No
Tx History        | Polygonscan API   | RPC eth_getLogs| Free
Token Prices      | GeckoTerminal     | DexScreener    | No
DeFi Yields       | DeFiLlama         | -              | No
DEX Volume        | DeFiLlama         | -              | No
Pool Data         | GeckoTerminal     | DexScreener    | No
Whale Alerts      | RPC eth_getLogs   | -              | No
Aave Data         | On-chain RPC      | Polygonscan    | No
TVL               | DeFiLlama         | -              | No
Gas Prices        | RPC eth_gasPrice  | Polygonscan    | No

## KEY PARAMETERS

Chain ID: 137
RPC Primary: https://polygon-bor-rpc.publicnode.com
RPC Fallback: https://polygon.drpc.org
Explorer API: https://api.polygonscan.com/api
GeckoTerminal: polygon_pos
CoinGecko: polygon-pos
DeFiLlama: Polygon
Block Time: ~2 seconds
Gas: ~30-100 gwei
