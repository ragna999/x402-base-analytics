import { getPortfolio } from "./portfolio.js";
import { getTxHistory } from "./history.js";
import { rpcCall } from "./base.js";

/**
 * Full wallet summary: portfolio + history + activity stats
 */
export async function getWalletSummary(address) {
  address = address.toLowerCase();

  // Fetch everything in parallel
  const [portfolio, history, txCountHex, blockNumberHex] = await Promise.all([
    getPortfolio(address),
    getTxHistory(address, 50),
    rpcCall("eth_getTransactionCount", [address, "latest"]),
    rpcCall("eth_blockNumber", []),
  ]);

  const txCount = parseInt(txCountHex, 16);
  const blockNumber = parseInt(blockNumberHex, 16);

  // Calculate activity stats from history
  const txs = history.transactions || [];
  const now = new Date();

  const firstTx = txs.length > 0 ? txs[txs.length - 1] : null;
  const lastTx = txs.length > 0 ? txs[0] : null;

  const successTxs = txs.filter((t) => t.status === "ok").length;
  const failedTxs = txs.filter((t) => t.status !== "ok").length;

  // Unique interacted addresses
  const uniqueAddresses = new Set();
  txs.forEach((t) => {
    if (t.from) uniqueAddresses.add(t.from.toLowerCase());
    if (t.to) uniqueAddresses.add(t.to.toLowerCase());
  });
  uniqueAddresses.delete(address);

  // Method breakdown
  const methods = {};
  txs.forEach((t) => {
    const m = t.method || "transfer";
    methods[m] = (methods[m] || 0) + 1;
  });

  return {
    address,
    network: "base",
    timestamp: now.toISOString(),
    blockNumber,
    summary: {
      lifetimeTxCount: txCount,
      recentTxCount: txs.length,
      successfulTxs: successTxs,
      failedTxs: failedTxs,
      uniqueCounterparties: uniqueAddresses.size,
      firstActivity: firstTx?.timestamp || null,
      lastActivity: lastTx?.timestamp || null,
      topMethods: Object.entries(methods)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([method, count]) => ({ method, count })),
    },
    portfolio: portfolio.portfolio,
    recentTransactions: txs.slice(0, 20),
  };
}
