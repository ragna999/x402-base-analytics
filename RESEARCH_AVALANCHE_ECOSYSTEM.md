# Avalanche (AVAX) C-Chain Ecosystem Research Report
## For x402 Paid API Analytics Endpoints
Generated: 2026-06-09

## 1. FREE PUBLIC RPC ENDPOINTS (No API Key)

| Endpoint | Chain ID | Status |
|----------|----------|--------|
| https://api.avax.network/ext/bc/C/rpc | 43114 | TESTED WORKS |
| https://avalanche-c-chain-rpc.publicnode.com | 43114 | Known good |
| https://rpc.ankr.com/avalanche | 43114 | Known good |
| https://1rpc.io/avax/c | 43114 | Known good |

## 2. BLOCK EXPLORER APIs

### Snowtrace (snowtrace.io) - PRIMARY, TESTED
API Base: https://api.snowtrace.io/api
Rate Limits: 120 req/min, 10,000 req/day, NO API KEY

Modules:
- account/txlist - Transaction history
- account/tokentx - ERC-20 transfers
- account/balance - AVAX balance
- account/tokenbalance - ERC-20 balance
- account/balancemulti - Multi-address balance
- account/txlistinternal - Internal txs
- contract/getabi - Contract ABI
- stats/tokensupply - Token supply
- block/getblocknobytime - Block by timestamp

### Routescan - BACKUP
API: https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api
Same Etherscan-compatible modules

## 3. TOP DEXs ON AVALANCHE

| DEX | Type | Status |
|-----|------|--------|
| Pharaoh Exchange | V3/DLMM | Very active, #1 volume |
| Blackhole V3 | V3 | Very active |
| Uniswap V3 | V3 | Active |
| Uniswap V4 | V4 | Growing |
| Trader Joe V2.2 | LBAMM | Active |
| Trader Joe V2.1 | V2.1 | Active |
| Pangolin V3 | V3 | Active |
| Pangolin V2 | V2 | Legacy |
| SushiSwap | V2 | Minimal |

### GeckoTerminal API (FREE, NO KEY, TESTED):
GET /api/v2/networks/avax/trending_pools
GET /api/v2/networks/avax/pools?sort=h24_volume_usd_desc
GET /api/v2/networks/avax/pools/{address}
GET /api/v2/networks/avax/tokens/{address}
GET /api/v2/networks/avax/tokens/{address}/pools
GET /api/v2/networks/avax/new_pools
GET /api/v2/networks/avax/dexes
Rate: ~30 req/min

### DexScreener (FREE, NO KEY, TESTED):
GET /latest/dex/tokens/{address}
GET /latest/dex/search?q={query}
GET /latest/dex/pairs/avalanche/{pair_address}
Rate: ~300 req/min

## 4. MAJOR DeFi PROTOCOLS

Lending: Aave V3, Benqi, Silo V2
DEX: Trader Joe, Pangolin, Pharaoh, Uniswap V3/V4, Blackhole
Derivatives: GMX V2, Dexalot
Stableswap: Platypus Finance, Curve
Yield: Yield Yak, Vector Finance

DeFiLlama protocol data:
GET https://api.llama.fi/protocol/{slug}
GET https://api.llama.fi/v2/historicalChainTvl/Avalanche

## 5. TOKEN DATA APIs

GeckoTerminal: Full pool/token data, OHLCV, trending, new pools
DexScreener: Pair data with volume, price, txns, liquidity
CoinGecko: GET /simple/price?ids=avalanche-2&vs_currencies=usd (TESTED)

## 6. WHALE TRACKING

Via Snowtrace:
- txlist: Parse transactions, filter by value
- tokentx: Track large ERC-20 transfers
- tokenbalance: Monitor whale holdings
- No free DeBank API - reconstruct from tx history

## 7. DeFiLlama AVALANCHE SUPPORT

GET /v2/historicalChainTvl/Avalanche (TESTED: works)
GET /v2/chains (Avalanche TVL ~$469M)
GET /yields.llama.fi/pools (filter chain=Avalanche)
GET /stablecoins.llama.fi/stablecoincharts/Avalanche
GET /overview/dexs/Avalanche
GET /overview/fees/Avalanche

## 8. AVALANCHE-SPECIFIC UNIQUE DATA

### Glacier API (Official Avalanche Indexer, TESTED):
GET https://glacier-api.avax.network/v1/networks/mainnet/blockchains
GET https://glacier-api.avax.network/v1/networks/mainnet/subnets
GET https://glacier-api.avax.network/v1/networks/mainnet/validators

Unique Analytics:
1. Subnet/L1 Tracker - ecosystem growth
2. Validator Stats - staking, delegation, uptime
3. C-Chain Gas - real-time via eth_gasPrice
4. Cross-chain Activity - Avalanche Bridge

## ANALYTICS ENDPOINTS (25-30 total)

Tier 1: Wallet Portfolio, Tx History, Token Safety, Token Price, DEX Data
Tier 2: Whale Alerts, Smart Money, DeFi Yields, Protocol TVL, DEX Volume
Tier 3: Subnet Tracker, Validator Stats, Staking Metrics, Bridge Activity

All FREE, NO API KEYS required.

## KEY CONTRACTS

WAVAX: 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7
USDC: 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E
USDC.e: 0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664
USDT: 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7
WETH.e: 0x49D5c2BdFfac6CE2BFdB6640F4F80F226bc10bAB
BTC.b: 0x152b9d0FdC40C096757F570A51e494bd4b943E50

## RATE LIMITS

| API | Limit | Key | Tested |
|-----|-------|-----|--------|
| Snowtrace | 120/min, 10K/day | No | Yes |
| GeckoTerminal | ~30/min | No | Yes |
| DexScreener | ~300/min | No | Yes |
| DeFiLlama | Generous | No | Yes |
| CoinGecko | ~10-30/min | No | Yes |
| Glacier API | Generous | No | Yes |
| Public RPCs | 30+/min | No | Yes |
