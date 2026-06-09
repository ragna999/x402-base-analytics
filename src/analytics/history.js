import { getChain, getBlockscoutTxHistory } from "../chains.js";

/**
 * Get recent transaction history from Blockscout (free, no API key)
 * Supports: Base, Arbitrum, Celo (all have Blockscout)
 * @param {string} chainSlug - Chain identifier
 * @param {string} address - Wallet address
 * @param {number} limit - Max transactions to return
 */
export async function getTxHistory(chainSlug, address, limit = 20) {
  const chain = getChain(chainSlug);
  
  if (!chain.blockscout) {
    throw new Error(`Chain ${chain.name} does not have Blockscout support. Use Base, Arbitrum, or Celo.`);
  }

  const items = await getBlockscoutTxHistory(chainSlug, address, limit);

  const transactions = items.map((tx) => ({
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
    network: chainSlug,
    chainName: chain.name,
    timestamp: new Date().toISOString(),
    count: transactions.length,
    transactions,
  };
}
