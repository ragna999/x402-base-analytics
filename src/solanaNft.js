const ME_BASE = 'https://api-mainnet.magiceden.dev/v2';

async function meFetch(endpoint, params = {}) {
  const url = new URL(`${ME_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  
  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Magic Eden API error: ${res.status} - ${err}`);
  }
  
  return res.json();
}

// Get collection stats (floor price, volume, listed count)
export async function getSolanaCollectionStats(collectionSymbol) {
  const data = await meFetch(`/collections/${collectionSymbol}/stats`);
  
  return {
    collection: collectionSymbol,
    floorPrice: data.floorPrice ? data.floorPrice / 1e9 : null, // lamports to SOL
    floorPriceSOL: data.floorPrice ? (data.floorPrice / 1e9).toFixed(4) : null,
    listedCount: data.listedCount || 0,
    avgPrice24h: data.avgPrice24hr ? (data.avgPrice24hr / 1e9).toFixed(4) : null,
    volumeAll: data.volumeAll ? (data.volumeAll / 1e9).toFixed(2) : null,
  };
}

// Get NFTs owned by a wallet
export async function getSolanaNFTPortfolio(walletAddress, limit = 20, offset = 0) {
  const data = await meFetch(`/wallets/${walletAddress}/tokens`, {
    limit: Math.min(limit, 500),
    offset,
  });
  
  return {
    wallet: walletAddress,
    totalNFTs: data.length || 0,
    nfts: (data || []).map(nft => ({
      mint: nft.mintAddress,
      name: nft.name || 'Unknown',
      collection: nft.collection || null,
      collectionName: nft.collectionName || null,
      image: nft.image || null,
      price: nft.price ? nft.price.toFixed(4) : null, // already in SOL
      listStatus: nft.listStatus || 'unlisted',
      tokenAddress: nft.tokenAddress || null,
      attributes: (nft.attributes || []).slice(0, 10), // limit attributes
    })),
  };
}

// Get single token metadata
export async function getSolanaTokenMetadata(mintAddress) {
  const data = await meFetch(`/tokens/${mintAddress}`);
  
  return {
    mint: data.mintAddress,
    name: data.name || 'Unknown',
    collection: data.collection || null,
    collectionName: data.collectionName || null,
    owner: data.owner || null,
    image: data.image || null,
    animationUrl: data.animationUrl || null,
    description: data.description || null,
    attributes: data.attributes || [],
    price: data.price ? data.price.toFixed(4) : null,
    listStatus: data.listStatus || 'unlisted',
    sellerFee: data.sellerFeeBasisPoints ? (data.sellerFeeBasisPoints / 100).toFixed(2) + '%' : null,
    externalUrl: data.externalUrl || null,
  };
}

// Get collection activities (sales, bids, listings)
export async function getSolanaCollectionActivities(collectionSymbol, limit = 20, offset = 0) {
  const data = await meFetch(`/collections/${collectionSymbol}/activities`, {
    limit: Math.min(limit, 100),
    offset,
  });
  
  return {
    collection: collectionSymbol,
    activities: (data || []).map(act => ({
      type: act.type || 'unknown', // bid, list, sale, etc.
      signature: act.signature ? act.signature.substring(0, 20) + '...' : null,
      buyer: act.buyer || null,
      seller: act.seller || null,
      price: act.price ? act.price.toFixed(4) : null, // already in SOL
      tokenMint: act.tokenMint || null,
      image: act.image || null,
      source: act.source || null, // magiceden_v2, tensor, etc.
      blockTime: act.blockTime ? new Date(act.blockTime * 1000).toISOString() : null,
    })),
    total: (data || []).length,
  };
}
