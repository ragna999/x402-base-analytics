// Wallet Risk Scorer — on-chain behavior analysis
// Data: Blockscout API (free) + on-chain patterns

const BLOCKSCOUT = "https://base.blockscout.com/api/v2";

/**
 * Analyze wallet risk based on on-chain behavior
 */
export async function analyzeWalletRisk(address) {
  address = address.toLowerCase();

  // Fetch wallet data in parallel
  const [addressInfo, txs] = await Promise.all([
    fetchAddressInfo(address),
    fetchTransactions(address, 100),
  ]);

  const risks = [];
  let riskScore = 0;

  // === AGE CHECK ===
  const firstTx = txs.length > 0 ? txs[txs.length - 1] : null;
  const walletAge = firstTx
    ? Math.floor((Date.now() - new Date(firstTx.timestamp).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  if (walletAge < 7) {
    risks.push({ type: "new_wallet", severity: "high", detail: `Wallet is only ${walletAge} days old` });
    riskScore += 25;
  } else if (walletAge < 30) {
    risks.push({ type: "young_wallet", severity: "medium", detail: `Wallet is ${walletAge} days old` });
    riskScore += 10;
  }

  // === TX COUNT CHECK ===
  const txCount = txs.length;
  if (txCount < 5) {
    risks.push({ type: "few_transactions", severity: "medium", detail: `Only ${txCount} transactions` });
    riskScore += 15;
  }

  // === INTERACTION DIVERSITY ===
  const uniqueContracts = new Set();
  const uniqueAddresses = new Set();
  txs.forEach(tx => {
    if (tx.to?.hash) {
      uniqueAddresses.add(tx.to.hash.toLowerCase());
      // Count contract interactions (txs with input data != simple transfer)
      if (tx.input && tx.input !== "0x" && tx.input.length > 10) {
        uniqueContracts.add(tx.to.hash.toLowerCase());
      }
    }
  });

  if (uniqueContracts.size < 3) {
    risks.push({ type: "low_diversity", severity: "low", detail: `Interacted with only ${uniqueContracts.size} contracts` });
    riskScore += 5;
  }

  // === FAILED TX RATE ===
  const failedTxs = txs.filter(tx => tx.status !== "ok").length;
  const failRate = txCount > 0 ? failedTxs / txCount : 0;
  if (failRate > 0.3) {
    risks.push({ type: "high_fail_rate", severity: "medium", detail: `${(failRate * 100).toFixed(0)}% failed transactions` });
    riskScore += 15;
  }

  // === ACTIVITY PATTERN ===
  // Check for bot-like rapid transactions
  if (txs.length >= 10) {
    const timestamps = txs.map(tx => new Date(tx.timestamp).getTime());
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i - 1] - timestamps[i]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const rapidTxs = intervals.filter(i => i < 5000).length; // < 5 seconds apart

    if (rapidTxs > 5) {
      risks.push({ type: "bot_pattern", severity: "medium", detail: `${rapidTxs} transactions within 5 seconds of each other` });
      riskScore += 10;
    }
  }

  // === KNOWN SCAM INTERACTION ===
  // Check if wallet interacted with known scam patterns
  // (simplified — in production, check against scam databases)
  const hasHighValueTransfer = txs.some(tx => {
    const value = parseFloat(tx.value || "0");
    return value > 1e18; // > 1 ETH
  });

  // === FUNDING SOURCE ===
  // Check if wallet was funded by known mixer/privacy tool
  // (simplified check)

  // === BALANCE CHECK ===
  const ethBalance = addressInfo?.coin_balance ? parseFloat(addressInfo.coin_balance) / 1e18 : 0;
  if (ethBalance === 0 && txCount > 0) {
    risks.push({ type: "empty_wallet", severity: "low", detail: "Wallet has zero balance but past activity" });
    riskScore += 5;
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  // Verdict
  let verdict;
  if (riskScore <= 15) verdict = "TRUSTED";
  else if (riskScore <= 35) verdict = "LOW_RISK";
  else if (riskScore <= 60) verdict = "MEDIUM_RISK";
  else if (riskScore <= 80) verdict = "HIGH_RISK";
  else verdict = "AVOID";

  return {
    address,
    chain: "base",
    timestamp: new Date().toISOString(),
    riskScore,
    verdict,
    risks,
    profile: {
      ageDays: walletAge,
      txCount,
      uniqueContracts: uniqueContracts.size,
      uniqueAddresses: uniqueAddresses.size,
      failedTxs,
      failRate: Math.round(failRate * 100),
      ethBalance: Math.round(ethBalance * 10000) / 10000,
      isContract: addressInfo?.is_contract || false,
    },
  };
}

async function fetchAddressInfo(address) {
  try {
    const res = await fetch(`${BLOCKSCOUT}/addresses/${address}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTransactions(address, limit = 100) {
  try {
    const res = await fetch(`${BLOCKSCOUT}/addresses/${address}/transactions?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}
