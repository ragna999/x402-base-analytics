const BLOCKSCOUT_BASE = "https://base.blockscout.com/api/v2";

/**
 * Get recent transaction history from Blockscout (free, no API key)
 */
export async function getTxHistory(address, limit = 20) {
  const url = `${BLOCKSCOUT_BASE}/addresses/${address}/transactions`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Blockscout API error: ${res.status}`);
  }

  const data = await res.json();

  const transactions = (data.items || []).slice(0, limit).map((tx) => ({
    hash: tx.hash,
    block: tx.block,
    timestamp: tx.timestamp,
    from: tx.from?.hash || null,
    to: tx.to?.hash || null,
    value: tx.value,
    valueEth: tx.value ? (Number(tx.value) / 1e18).toFixed(6) : "0",
    fee: tx.fee,
    status: tx.status,
    method: tx.method || "transfer",
    gasUsed: tx.gas_used,
    gasPrice: tx.gas_price,
  }));

  return {
    address,
    network: "base",
    timestamp: new Date().toISOString(),
    count: transactions.length,
    transactions,
  };
}
