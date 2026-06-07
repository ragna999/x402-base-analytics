# Base Analytics API — x402

All-in-one Base chain analytics API with x402 micropayments. Wallet analytics + DeFi yield optimizer in one endpoint.

## Endpoints

### Free
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/protocols` | List available services |

### Wallet Analytics
| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /api/portfolio/:address` | $0.005 | Token balances (ETH + ERC-20) |
| `GET /api/history/:address` | $0.01 | Recent transaction history |
| `GET /api/summary/:address` | $0.02 | Full wallet analytics + stats |

### DeFi Yields
| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /api/yields` | $0.02 | All yields across protocols, sorted by APY |
| `GET /api/yields/best/:asset` | $0.01 | Best yield for specific asset (USDC, ETH, etc.) |
| `GET /api/yields/risk` | $0.02 | Yields by risk level (low/medium/high) |
| `GET /api/yields/rebalance?protocol=X&apy=Y` | $0.05 | Rebalance recommendation |

## Data Sources

| Source | Type | Data |
|--------|------|------|
| Base RPC | On-chain | ETH/ERC-20 balances |
| Blockscout | API | Transaction history |
| Morpho | GraphQL | Vault APY, TVL |
| Moonwell | REST | Lending rates, rewards |
| Aerodrome | REST + Subgraph | LP APR, TVL |

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Deploy

```bash
gh repo create x402-base-analytics --public --source=. --push
# Import at vercel.com/new, set env vars, deploy
```

## License

MIT
