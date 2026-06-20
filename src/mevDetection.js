// MEV Activity Detection — sandwich attacks, frontrunning, suspicious patterns
// Data sources: Blockscout API (free, no key)
// Supports: Base, Arbitrum, Polygon, Avalanche, Celo

import { CHAINS } from "./chains.js";

async function fetchJSON(url, timeout = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchWithFallback(url, timeout = 8000) {
  try {
    return await fetchJSON(url, timeout);
  } catch {
    return null;
  }
}

// Get recent token transfers
async function getTokenTransfers(chain, tokenAddress) {
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return [];

  const data = await fetchWithFallback(
    `${config.explorer}/tokens/${tokenAddress}/transfers`
  );
  if (!data || !data.items) return [];

  return data.items.map(t => ({
    txHash: t.tx_hash,
    from: t.from?.hash || null,
    to: t.to?.hash || null,
    value: t.total?.value || "0",
    decimals: parseInt(t.total?.decimals || "18"),
    timestamp: t.timestamp,
    blockNumber: t.block_number,
    type: t.type || "transfer",
  }));
}

// Get recent DEX swaps involving the token from Blockscout
async function getTokenTransactions(chain, tokenAddress) {
  const config = CHAINS[chain];
  if (!config || !config.blockscout) return [];

  // Get internal transactions for the token contract
  const data = await fetchWithFallback(
    `${config.explorer}/addresses/${tokenAddress}/transactions`
  );
  if (!data || !data.items) return [];

  return data.items.slice(0, 100).map(tx => ({
    hash: tx.hash,
    from: tx.from?.hash || null,
    to: tx.to?.hash || null,
    value: tx.value || "0",
    gasPrice: tx.gas_price || "0",
    gasUsed: tx.gas_used || "0",
    status: tx.status,
    method: tx.method || null,
    timestamp: tx.timestamp,
    blockNumber: tx.block,
    isError: tx.status === "error",
  }));
}

// Detect sandwich attack patterns
function detectSandwichAttacks(transfers, timeWindowMs = 30000) {
  const sandwiches = [];
  if (transfers.length < 3) return sandwiches;

  // Group transfers by time proximity
  for (let i = 0; i < transfers.length - 2; i++) {
    const t1 = transfers[i];
    const t2 = transfers[i + 1];
    const t3 = transfers[i + 2];

    const time1 = new Date(t1.timestamp).getTime();
    const time2 = new Date(t2.timestamp).getTime();
    const time3 = new Date(t3.timestamp).getTime();

    // Check if 3 transfers are within the time window
    if (time3 - time1 > timeWindowMs) continue;

    // Sandwich pattern: same address buys before and sells after victim
    // t1: attacker buys (from DEX, to attacker)
    // t2: victim buys (from DEX, to victim)
    // t3: attacker sells (from attacker, to DEX)

    const addr1From = t1.from?.toLowerCase();
    const addr1To = t1.to?.toLowerCase();
    const addr3From = t3.from?.toLowerCase();
    const addr3To = t3.to?.toLowerCase();

    // Check if same entity is on both sides
    if (addr1To === addr3From || addr1From === addr3To) {
      const val1 = parseFloat(t1.value) / Math.pow(10, t1.decimals);
      const val2 = parseFloat(t2.value) / Math.pow(10, t2.decimals);
      const val3 = parseFloat(t3.value) / Math.pow(10, t3.decimals);

      // Attacker typically buys small, victim buys larger, attacker sells
      if (val1 < val2 && val3 > 0) {
        sandwiches.push({
          type: "sandwich_attack",
          confidence: "medium",
          attacker: addr1To || addr3From,
          victim: t2.to || t2.from,
          frontrunTx: t1.txHash,
          victimTx: t2.txHash,
          backrunTx: t3.txHash,
          attackerBuyAmount: val1.toFixed(4),
          victimAmount: val2.toFixed(4),
          attackerSellAmount: val3.toFixed(4),
          profitEstimate: (val3 - val1).toFixed(4),
          timeBetweenMs: time3 - time1,
          timestamp: t1.timestamp,
        });
      }
    }
  }

  return sandwiches;
}

// Detect frontrunning patterns (high gas price txs before large trades)
function detectFrontrunning(transfers, transactions) {
  const frontrunning = [];

  // Find large transfers (>1% of recent volume)
  const values = transfers.map(t => parseFloat(t.value) / Math.pow(10, t.decimals));
  const avgValue = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const largeThreshold = avgValue * 5; // 5x average

  const largeTransfers = transfers.filter((t, i) => values[i] > largeThreshold);

  for (const large of largeTransfers) {
    const largeTime = new Date(large.timestamp).getTime();

    // Look for transactions with high gas within 5 seconds before
    const suspiciousTxs = transactions.filter(tx => {
      const txTime = new Date(tx.timestamp).getTime();
      const timeDiff = largeTime - txTime;
      if (timeDiff < 0 || timeDiff > 5000) return false;

      // Check if gas price is unusually high
      const gasPrice = parseFloat(tx.gasPrice || "0");
      return gasPrice > 0; // Has gas price (is a real tx)
    });

    if (suspiciousTxs.length > 0) {
      frontrunning.push({
        type: "potential_frontrun",
        confidence: "low",
        largeTransferTx: large.txHash,
        largeTransferValue: values[transfers.indexOf(large)].toFixed(4),
        suspiciousTxs: suspiciousTxs.map(tx => ({
          hash: tx.hash,
          from: tx.from,
          gasPrice: tx.gasPrice,
          method: tx.method,
        })),
        timestamp: large.timestamp,
      });
    }
  }

  return frontrunning;
}

// Detect wash trading patterns
function detectWashTrading(transfers) {
  const washTrades = [];

  // Look for circular transfers: A → B → A in quick succession
  for (let i = 0; i < transfers.length - 1; i++) {
    const t1 = transfers[i];
    const t2 = transfers[i + 1];

    const time1 = new Date(t1.timestamp).getTime();
    const time2 = new Date(t2.timestamp).getTime();

    // Within 60 seconds
    if (time2 - time1 > 60000) continue;

    const from1 = t1.from?.toLowerCase();
    const to1 = t1.to?.toLowerCase();
    const from2 = t2.from?.toLowerCase();
    const to2 = t2.to?.toLowerCase();

    // A → B then B → A
    if (from1 === to2 && to1 === from2) {
      const val1 = parseFloat(t1.value) / Math.pow(10, t1.decimals);
      const val2 = parseFloat(t2.value) / Math.pow(10, t2.decimals);

      // Similar amounts (within 10%)
      const diff = Math.abs(val1 - val2) / Math.max(val1, val2);
      if (diff < 0.1) {
        washTrades.push({
          type: "potential_wash_trade",
          confidence: "medium",
          address1: from1,
          address2: to1,
          tx1: t1.txHash,
          tx2: t2.txHash,
          amount1: val1.toFixed(4),
          amount2: val2.toFixed(4),
          timeBetweenMs: time2 - time1,
          timestamp: t1.timestamp,
        });
      }
    }
  }

  return washTrades;
}

// Calculate MEV risk score
function calculateMevRisk(sandwiches, frontrunning, washTrades) {
  let riskScore = 0;
  const flags = [];

  if (sandwiches.length > 0) {
    riskScore += Math.min(sandwiches.length * 15, 40);
    flags.push(`SANDWICH_ATTACKS_DETECTED: ${sandwiches.length}`);
  }

  if (frontrunning.length > 0) {
    riskScore += Math.min(frontrunning.length * 10, 30);
    flags.push(`FRONTRUNNING_SUSPECTED: ${frontrunning.length}`);
  }

  if (washTrades.length > 0) {
    riskScore += Math.min(washTrades.length * 15, 40);
    flags.push(`WASH_TRADING_SUSPECTED: ${washTrades.length}`);
  }

  riskScore = Math.min(riskScore, 100);

  let mevExposure;
  if (riskScore >= 60) mevExposure = "high";
  else if (riskScore >= 30) mevExposure = "moderate";
  else if (riskScore > 0) mevExposure = "low";
  else mevExposure = "none_detected";

  return { riskScore, flags, mevExposure };
}

// Main function
export async function analyzeMev(chain, tokenAddress) {
  const config = CHAINS[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  // Fetch data in parallel
  const [transfers, transactions] = await Promise.all([
    getTokenTransfers(chain, tokenAddress),
    getTokenTransactions(chain, tokenAddress),
  ]);

  // Run detection algorithms
  const sandwiches = detectSandwichAttacks(transfers);
  const frontrunning = detectFrontrunning(transfers, transactions);
  const washTrades = detectWashTrading(transfers);
  const risk = calculateMevRisk(sandwiches, frontrunning, washTrades);

  // Summary stats
  const recentTransfers = transfers.length;
  const uniqueAddresses = new Set([
    ...transfers.map(t => t.from?.toLowerCase()),
    ...transfers.map(t => t.to?.toLowerCase()),
  ]).size;

  return {
    chain,
    token: tokenAddress,
    summary: {
      recentTransfers,
      uniqueAddresses,
      analysisWindow: transfers.length > 0 ? {
        from: transfers[transfers.length - 1]?.timestamp,
        to: transfers[0]?.timestamp,
      } : null,
    },
    detections: {
      sandwichAttacks: sandwiches.slice(0, 10),
      frontrunning: frontrunning.slice(0, 10),
      washTrading: washTrades.slice(0, 10),
    },
    risk,
    analyzed_at: new Date().toISOString(),
  };
}
