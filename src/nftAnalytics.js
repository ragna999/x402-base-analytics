import dotenv from 'dotenv';
dotenv.config();

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const BASE_URL = 'https://base-mainnet.g.alchemy.com/nft/v3';
const ETH_URL = 'https://eth-mainnet.g.alchemy.com/nft/v3';

async function alchemyFetch(baseUrl, endpoint, params = {}) {
  const url = new URL(`${baseUrl}/${ALCHEMY_KEY}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  
  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Alchemy API error: ${res.status} - ${err}`);
  }
  
  return res.json();
}

// Get NFT holdings for a wallet address
export async function getNFTPortfolio(address, chain = 'base', limit = 50, pageKey) {
  const baseUrl = chain === 'eth' ? ETH_URL : BASE_URL;
  const params = {
    owner: address,
    withMetadata: 'true',
    pageSize: Math.min(limit, 100),
  };
  if (pageKey) params.pageKey = pageKey;
  
  const data = await alchemyFetch(baseUrl, 'getNFTsForOwner', params);
  
  return {
    address,
    chain,
    totalNFTs: data.totalCount || 0,
    nfts: (data.ownedNfts || []).map(nft => ({
      contract: nft.contract?.address,
      name: nft.name || `${nft.contract?.name || 'Unknown'} #${nft.tokenId}`,
      collection: nft.contract?.name || 'Unknown',
      symbol: nft.contract?.symbol,
      tokenType: nft.contract?.tokenType,
      tokenId: nft.tokenId,
      image: nft.image?.cachedUrl || nft.image?.pngUrl || null,
      thumbnail: nft.image?.thumbnailUrl || null,
      description: nft.description?.substring(0, 200) || null,
      floorPrice: nft.contract?.openSeaMetadata?.floorPrice || null,
      spam: nft.contract?.isSpam || false,
    })),
    pageKey: data.pageKey || null,
  };
}

// Get collection metadata + floor price
export async function getCollectionInfo(contractAddress, chain = 'base') {
  const baseUrl = chain === 'eth' ? ETH_URL : BASE_URL;
  const data = await alchemyFetch(baseUrl, 'getContractMetadata', {
    contractAddress,
  });
  
  return {
    address: data.address,
    name: data.name || 'Unknown',
    symbol: data.symbol || null,
    tokenType: data.tokenType || null,
    totalSupply: data.totalSupply || null,
    deployer: data.contractDeployer || null,
    deployedBlock: data.deployedBlockNumber || null,
    spam: data.isSpam || false,
    openSea: data.openSeaMetadata ? {
      floorPrice: data.openSeaMetadata.floorPrice || null,
      collectionName: data.openSeaMetadata.collectionName || null,
      collectionSlug: data.openSeaMetadata.collectionSlug || null,
      safelistStatus: data.openSeaMetadata.safelistRequestStatus || null,
      imageUrl: data.openSeaMetadata.imageUrl || null,
      description: data.openSeaMetadata.description?.substring(0, 300) || null,
      twitter: data.openSeaMetadata.twitterUsername || null,
      discord: data.openSeaMetadata.discordUrl || null,
      website: data.openSeaMetadata.externalUrl || null,
      bannerImage: data.openSeaMetadata.bannerImageUrl || null,
    } : null,
  };
}

// Get floor price from OpenSea
export async function getFloorPrice(contractAddress, chain = 'base') {
  const baseUrl = chain === 'eth' ? ETH_URL : BASE_URL;
  const data = await alchemyFetch(baseUrl, 'getFloorPrice', {
    contractAddress,
  });
  
  return {
    contract: contractAddress,
    chain,
    openSea: data.openSea ? {
      floorPrice: data.openSea.floorPrice || null,
      currency: data.openSea.priceCurrency || 'ETH',
      url: data.openSea.collectionUrl || null,
      retrievedAt: data.openSea.retrievedAt || null,
      error: data.openSea.error || null,
    } : null,
    looksRare: data.looksRare ? {
      floorPrice: data.looksRare.floorPrice || null,
      currency: data.looksRare.priceCurrency || 'ETH',
      error: data.looksRare.error || null,
    } : null,
  };
}

// Get recent sales for a collection
export async function getNFTSales(contractAddress, chain = 'base', limit = 20, fromBlock, toBlock) {
  const baseUrl = chain === 'eth' ? ETH_URL : BASE_URL;
  const params = {
    contractAddress,
    limit: Math.min(limit, 100),
  };
  if (fromBlock) params.fromBlock = fromBlock;
  if (toBlock) params.toBlock = toBlock;
  
  const data = await alchemyFetch(baseUrl, 'getNFTSales', params);
  
  return {
    contract: contractAddress,
    chain,
    sales: (data.nftSales || []).map(sale => ({
      marketplace: sale.marketplace || 'unknown',
      tokenId: sale.tokenId,
      buyer: sale.buyerAddress,
      seller: sale.sellerAddress,
      price: sale.sellerFee?.amount ? 
        (parseInt(sale.sellerFee.amount) / Math.pow(10, sale.sellerFee.decimals || 18)).toFixed(4) : null,
      currency: sale.sellerFee?.symbol || 'ETH',
      blockNumber: sale.blockNumber,
      txHash: sale.transactionHash,
    })),
    validAt: data.validAt || null,
    pageKey: data.pageKey || null,
  };
}

// Get owners of a specific NFT
export async function getNFTOwners(contractAddress, tokenId, chain = 'base') {
  const baseUrl = chain === 'eth' ? ETH_URL : BASE_URL;
  const data = await alchemyFetch(baseUrl, 'getOwnersForNFT', {
    contractAddress,
    tokenId,
  });
  
  return {
    contract: contractAddress,
    tokenId,
    chain,
    owners: (data.owners || []).map(owner => ({
      address: owner,
    })),
    totalOwners: (data.owners || []).length,
  };
}
