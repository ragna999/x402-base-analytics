/**
 * Stablecoin Health Monitor
 * Data: CoinGecko (prices) + DeFiLlama (market caps, chain distribution)
 */

const COINGECKO = 'https://api.coingecko.com/api/v3';
const DEFILLAMA = 'https://stablecoins.llama.fi';

const STABLECOINS = {
  'tether': { symbol: 'USDT', peg: 1.0 },
  'usd-coin': { symbol: 'USDC', peg: 1.0 },
  'dai': { symbol: 'DAI', peg: 1.0 },
  'ethena-usde': { symbol: 'USDe', peg: 1.0 },
  'first-digital-usd': { symbol: 'FDUSD', peg: 1.0 },
  'true-usd': { symbol: 'TUSD', peg: 1.0 },
  'paxos-standard': { symbol: 'USDP', peg: 1.0 },
  'paypal-usd': { symbol: 'PYUSD', peg: 1.0 },
  'sky-dollar-usds': { symbol: 'USDS', peg: 1.0 },
};

const PEG_THRESHOLDS = {
  healthy: 0.002,   // within 0.2%
  warning: 0.005,   // within 0.5%
  danger: 0.01,     // within 1%
  critical: 0.02,   // within 2%
};

function classifyPeg(deviation) {
  const abs = Math.abs(deviation);
  if (abs <= PEG_THRESHOLDS.healthy) return 'HEALTHY';
  if (abs <= PEG_THRESHOLDS.warning) return 'WARNING';
  if (abs <= PEG_THRESHOLDS.danger) return 'DANGER';
  return 'CRITICAL';
}

function healthScore(deviation, mcapChange24h) {
  let score = 100;
  // Penalize deviation from peg
  score -= Math.abs(deviation) * 5000;
  // Penalize market cap decline
  if (mcapChange24h < 0) score += mcapChange24h * 2;
  // Bonus for perfect peg
  if (Math.abs(deviation) < 0.001) score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function fetchPrices() {
  const ids = Object.keys(STABLECOINS).join(',');
  const url = `${COINGECKO}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`CoinGecko error: ${resp.status}`);
  return resp.json();
}

async function fetchStablecoins() {
  const resp = await fetch(`${DEFILLAMA}/stablecoins?includePrices=true`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`DeFiLlama error: ${resp.status}`);
  return resp.json();
}

export async function getStablecoinHealth() {
  const [prices, llamaData] = await Promise.all([
    fetchPrices().catch(() => ({})),
    fetchStablecoins().catch(() => ({ peggedAssets: [] })),
  ]);

  const coins = [];

  for (const [id, info] of Object.entries(STABLECOINS)) {
    const priceData = prices[id];
    const llamaCoin = (llamaData.peggedAssets || []).find(
      a => a.symbol?.toUpperCase() === info.symbol || a.name?.toLowerCase().includes(info.symbol.toLowerCase())
    );

    const currentPrice = priceData?.usd ?? null;
    const deviation = currentPrice ? currentPrice - info.peg : null;
    const priceChange24h = priceData?.usd_24h_change ?? null;

    // Market cap from DeFiLlama
    const mcap = llamaCoin?.circulating?.peggedUSD ?? null;
    const mcapPrevDay = llamaCoin?.circulatingPrevDay?.peggedUSD ?? null;
    const mcapChange = (mcap && mcapPrevDay) ? ((mcap - mcapPrevDay) / mcapPrevDay) * 100 : null;

    // Chain distribution (top 5)
    const chains = llamaCoin?.chainCirculating
      ? Object.entries(llamaCoin.chainCirculating)
          .map(([chain, data]) => ({
            chain,
            amount: data.current?.peggedUSD ?? 0,
          }))
          .filter(c => c.amount > 0)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
      : [];

    const status = deviation !== null ? classifyPeg(deviation) : 'UNKNOWN';
    const score = (deviation !== null && mcapChange !== null)
      ? healthScore(deviation, mcapChange)
      : null;

    coins.push({
      id,
      symbol: info.symbol,
      peg: info.peg,
      currentPrice,
      deviation: deviation !== null ? +deviation.toFixed(6) : null,
      deviationPercent: deviation !== null ? +(deviation * 100).toFixed(4) : null,
      status,
      healthScore: score,
      priceChange24h: priceChange24h !== null ? +priceChange24h.toFixed(4) : null,
      marketCap: mcap ? Math.round(mcap) : null,
      marketCapChange24h: mcapChange !== null ? +mcapChange.toFixed(2) : null,
      chains,
    });
  }

  // Sort by health score (worst first — most interesting)
  coins.sort((a, b) => (a.healthScore ?? 100) - (b.healthScore ?? 100));

  const alerts = coins.filter(c => c.status === 'DANGER' || c.status === 'CRITICAL');

  return {
    timestamp: new Date().toISOString(),
    source: 'CoinGecko + DeFiLlama',
    totalStablecoins: coins.length,
    overallHealth: alerts.length === 0 ? 'STABLE' : 'ALERT',
    alerts: alerts.map(a => ({
      symbol: a.symbol,
      price: a.currentPrice,
      deviation: a.deviationPercent + '%',
      status: a.status,
    })),
    stablecoins: coins,
  };
}

export async function getStablecoinBySymbol(symbol) {
  const all = await getStablecoinHealth();
  const coin = all.stablecoins.find(
    c => c.symbol.toLowerCase() === symbol.toLowerCase()
  );
  if (!coin) return { error: `Stablecoin ${symbol} not found. Supported: ${Object.values(STABLECOINS).map(s => s.symbol).join(', ')}` };
  return {
    timestamp: all.timestamp,
    coin,
    context: {
      rank: all.stablecoins.indexOf(coin) + 1,
      totalTracked: all.totalStablecoins,
      overallHealth: all.overallHealth,
    },
  };
}

export async function getStablecoinAlerts() {
  const all = await getStablecoinHealth();
  return {
    timestamp: all.timestamp,
    overallHealth: all.overallHealth,
    alertCount: all.alerts.length,
    alerts: all.stablecoins.filter(c => c.status !== 'HEALTHY' && c.status !== 'UNKNOWN'),
  };
}
