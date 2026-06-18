// Block Checker — Latest block data across multiple chains
// All using free public RPCs, no API keys required

const CHAINS = {
  btc: {
    name: 'Bitcoin',
    type: 'btc',
    url: 'https://mempool.space/api/blocks/tip/height',
    hashUrl: 'https://mempool.space/api/blocks/tip/hash',
    blockUrl: 'https://mempool.space/api/block/',
  },
  eth: {
    name: 'Ethereum',
    type: 'evm',
    url: 'https://ethereum-rpc.publicnode.com',
  },
  bnb: {
    name: 'BNB Chain',
    type: 'evm',
    url: 'https://bsc-dataseed.bnbchain.org',
  },
  base: {
    name: 'Base',
    type: 'evm',
    url: 'https://mainnet.base.org',
  },
  arb: {
    name: 'Arbitrum',
    type: 'evm',
    url: 'https://arb1.arbitrum.io/rpc',
  },
  polygon: {
    name: 'Polygon',
    type: 'evm',
    url: 'https://polygon-bor-rpc.publicnode.com',
  },
  avax: {
    name: 'Avalanche',
    type: 'evm',
    url: 'https://api.avax.network/ext/bc/C/rpc',
  },
  sol: {
    name: 'Solana',
    type: 'sol',
    url: 'https://api.mainnet-beta.solana.com',
  },
};

function hexToDecimal(hex) {
  return parseInt(hex, 16);
}

async function fetchEvmBlock(rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const block = data.result;
  return {
    height: hexToDecimal(block.number),
    hash: block.hash,
    timestamp: hexToDecimal(block.timestamp),
    parentHash: block.parentHash,
    gasUsed: hexToDecimal(block.gasUsed),
    gasLimit: hexToDecimal(block.gasLimit),
    baseFeePerGas: block.baseFeePerGas ? hexToDecimal(block.baseFeePerGas) : null,
    txCount: block.transactions ? block.transactions.length : 0,
  };
}

async function fetchBtcBlock() {
  // Get latest block height
  const heightRes = await fetch('https://mempool.space/api/blocks/tip/height');
  const height = parseInt(await heightRes.text());

  // Get latest block hash
  const hashRes = await fetch('https://mempool.space/api/blocks/tip/hash');
  const hash = (await hashRes.text()).trim();

  // Get block details for timestamp and tx count
  const blockRes = await fetch(`https://mempool.space/api/block/${hash}`);
  const block = await blockRes.json();

  return {
    height,
    hash,
    timestamp: block.timestamp,
    parentHash: block.previousblockhash || null,
    txCount: block.tx_count,
    size: block.size,
    weight: block.weight,
    difficulty: block.difficulty,
  };
}

async function fetchSolBlock() {
  const res = await fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getSlot',
      params: [{ commitment: 'finalized' }],
      id: 1,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const slot = data.result;

  // Get block time
  const timeRes = await fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getBlockTime',
      params: [slot],
      id: 2,
    }),
  });
  const timeData = await timeRes.json();
  const timestamp = timeData.result || null;

  return {
    height: slot,
    hash: null, // Solana doesn't have block hashes in the same way
    timestamp,
    parentHash: null,
    txCount: null, // Would need another call
  };
}

async function getLatestBlock(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

  try {
    if (chain.type === 'evm') {
      return await fetchEvmBlock(chain.url);
    } else if (chain.type === 'btc') {
      return await fetchBtcBlock();
    } else if (chain.type === 'sol') {
      return await fetchSolBlock();
    }
  } catch (e) {
    return { error: e.message };
  }
}

async function getLatestBlocks(chains) {
  const chainList = chains ? chains.split(',').map(c => c.trim().toLowerCase()) : Object.keys(CHAINS);
  
  const results = await Promise.allSettled(
    chainList.map(async (chainId) => {
      const chain = CHAINS[chainId];
      if (!chain) return { chain: chainId, error: 'Unsupported chain' };
      
      const block = await getLatestBlock(chainId);
      return {
        chain: chainId,
        name: chain.name,
        ...block,
      };
    })
  );

  const blocks = {};
  results.forEach((result, index) => {
    const chainId = chainList[index];
    if (result.status === 'fulfilled') {
      blocks[chainId] = result.value;
    } else {
      blocks[chainId] = { chain: chainId, error: result.reason?.message || 'Unknown error' };
    }
  });

  return {
    timestamp: Math.floor(Date.now() / 1000),
    chains: blocks,
  };
}

export { getLatestBlocks, getLatestBlock, CHAINS };
