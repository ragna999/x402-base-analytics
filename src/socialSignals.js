// Social Signals — Multi-platform social intelligence for crypto tokens
// Sources: DexScreener, GeckoTerminal, Warpcast (Farcaster), GMGN CLI

const DEXSCREENER = "https://api.dexscreener.com";
const GECKOTERMINAL = "https://api.geckoterminal.com/api/v2";
const WARPCAST = "https://api.warpcast.com/v2";

// GeckoTerminal network slugs (same as chains.js)
const GECKO_NETWORKS = {
  base: "base",
  arbitrum: "arbitrum",
  polygon: "polygon_pos",
  avalanche: "avax",
  celo: "celo",
  solana: "solana",
};

// === HELPER: Safe fetch with timeout ===
async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 10000);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// === 1. TOKEN SOCIAL PRESENCE ===
// Aggregated social links for a token from DexScreener + GeckoTerminal
export async function getTokenSocial(chain, address) {
  const geckoNet = GECKO_NETWORKS[chain] || chain;

  // Fetch from both sources in parallel
  const [dexData, geckoData] = await Promise.all([
    // DexScreener: token pairs with social info
    safeFetch(`${DEXSCREENER}/latest/dex/tokens/${address}`),
    // GeckoTerminal: token info with social + trust score
    safeFetch(`${GECKOTERMINAL}/networks/${geckoNet}/tokens/${address}/info`),
  ]);

  // Extract DexScreener social data
  let dexSocial = { website: null, twitter: null, telegram: null, discord: null, other: [] };
  let dexPairs = [];
  if (dexData?.pairs?.length) {
    const pair = dexData.pairs[0]; // Most liquid pair
    dexPairs = dexData.pairs.slice(0, 5).map(p => ({
      dex: p.dexId,
      pairAddress: p.pairAddress,
      priceUsd: p.priceUsd,
      volume24h: p.volume?.h24,
      liquidity: p.liquidity?.usd,
      priceChange24h: p.priceChange?.h24,
    }));

    if (pair.info) {
      if (pair.info.websites?.length) dexSocial.website = pair.info.websites[0].url;
      if (pair.info.socials) {
        for (const s of pair.info.socials) {
          if (s.type === "twitter") dexSocial.twitter = s.url;
          else if (s.type === "telegram") dexSocial.telegram = s.url;
          else if (s.type === "discord") dexSocial.discord = s.url;
          else dexSocial.other.push({ type: s.type, url: s.url });
        }
      }
    }
  }

  // Extract GeckoTerminal social data
  let geckoSocial = { website: null, twitter: null, telegram: null, discord: null, gtScore: null };
  if (geckoData?.data?.attributes) {
    const attrs = geckoData.data.attributes;
    geckoSocial.website = attrs.websites?.[0] || null;
    geckoSocial.twitter = attrs.twitter || null;
    geckoSocial.telegram = attrs.telegram || null;
    geckoSocial.discord = attrs.discord_url || null;
    geckoSocial.gtScore = attrs.gt_score || null;
    geckoSocial.description = attrs.description || null;
    geckoSocial.categories = attrs.categories || [];
  }

  // Merge: prefer GeckoTerminal (more structured), fallback to DexScreener
  const merged = {
    chain,
    tokenAddress: address,
    social: {
      website: geckoSocial.website || dexSocial.website,
      twitter: geckoSocial.twitter || dexSocial.twitter,
      telegram: geckoSocial.telegram || dexSocial.telegram,
      discord: geckoSocial.discord || dexSocial.discord,
      other: dexSocial.other,
    },
    trustScore: geckoSocial.gtScore,
    description: geckoSocial.description,
    categories: geckoSocial.categories,
    marketData: dexPairs.length ? {
      topPair: dexPairs[0],
      allPairs: dexPairs,
    } : null,
    sources: ["dexscreener", "geckoterminal"],
    fetchedAt: new Date().toISOString(),
  };

  return merged;
}

// === 2. SOCIAL TRENDING ===
// Trending tokens with social data attached
export async function getSocialTrending(chain = "base", limit = 20) {
  const geckoNet = GECKO_NETWORKS[chain] || chain;

  // Get trending pools from GeckoTerminal
  const trendingData = await safeFetch(
    `${GECKOTERMINAL}/networks/${geckoNet}/trending_pools?page=1`
  );

  if (!trendingData?.data?.length) {
    return { chain, pools: [], error: "No trending data available" };
  }

  const pools = trendingData.data.slice(0, limit).map(pool => {
    const attrs = pool.attributes;
    return {
      name: attrs.name,
      address: pool.relationships?.base_token?.data?.id?.split("_").pop(),
      poolAddress: attrs.address,
      priceUsd: attrs.base_token_price_usd,
      volume24h: attrs.volume_usd?.h24,
      volume6h: attrs.volume_usd?.h6,
      volume1h: attrs.volume_usd?.h1,
      priceChange24h: attrs.price_change_percentage?.h24,
      priceChange6h: attrs.price_change_percentage?.h6,
      priceChange1h: attrs.price_change_percentage?.h1,
      txns24h: {
        buys: attrs.transactions?.h24?.buys,
        sells: attrs.transactions?.h24?.sells,
      },
      reserveUsd: attrs.reserve_in_usd,
      fdvUsd: attrs.fdv_usd,
    };
  });

  // Enrich top 10 with social data (batch DexScreener token-profiles)
  let enrichedPools = pools;
  try {
    const profilesRes = await safeFetch(`${DEXSCREENER}/token-profiles/latest/v1`);
    if (profilesRes?.length) {
      const profileMap = {};
      for (const p of profilesRes) {
        if (p.chainId === chain && p.tokenAddress) {
          profileMap[p.tokenAddress.toLowerCase()] = p;
        }
      }
      enrichedPools = pools.map(pool => {
        const addr = pool.address?.toLowerCase();
        const profile = addr ? profileMap[addr] : null;
        return {
          ...pool,
          social: profile ? {
            website: profile.links?.find(l => l.type === "website")?.url || null,
            twitter: profile.links?.find(l => l.type === "twitter")?.url || null,
            telegram: profile.links?.find(l => l.type === "telegram")?.url || null,
            discord: profile.links?.find(l => l.type === "discord")?.url || null,
          } : null,
        };
      });
    }
  } catch (e) {
    // Enrichment failed, return pools without social
  }

  return {
    chain,
    count: enrichedPools.length,
    pools: enrichedPools,
    source: "geckoterminal + dexscreener",
    fetchedAt: new Date().toISOString(),
  };
}

// === 3. FARCASTER CRYPTO SIGNALS ===
// Trending crypto discussions on Farcaster
export async function getFarcasterCrypto(limit = 20) {
  // Key crypto FIDs (Farcaster user IDs)
  const CRYPTO_FIDS = [
    { fid: 3, name: "Dan Romero", role: "Farcaster founder" },
    { fid: 56, name: "Vitalik Buterin", role: "Ethereum founder" },
    { fid: 12, name: "Varun Srinivasan", role: "Farcaster co-founder" },
    { fid: 2, name: "Neville", role: "Farcaster team" },
    { fid: 194, name: "Linda Xie", role: "Scalar Capital" },
    { fid: 22032, name: "hayden.eth", role: "Uniswap founder" },
  ];

  // Key crypto channels
  const CRYPTO_CHANNELS = ["ethereum", "farcaster", "zora", "op-stack", "builder", "e/acc", "crypto"];

  // Fetch casts from key FIDs in parallel
  const castPromises = CRYPTO_FIDS.map(async ({ fid, name, role }) => {
    const data = await safeFetch(`${WARPCAST}/casts?fid=${fid}&limit=5`);
    if (!data?.result?.casts) return [];
    return data.result.casts.map(cast => ({
      author: name,
      authorFid: fid,
      role,
      text: cast.text?.slice(0, 300),
      hash: cast.hash,
      timestamp: cast.timestamp,
      engagement: {
        replies: cast.replies?.count || 0,
        reactions: cast.reactions?.count || 0,
        recasts: cast.recasts?.count || 0,
        views: cast.views?.count || 0,
      },
      embeds: cast.embeds?.length || 0,
      channel: cast.parentSource?.url || null,
    }));
  });

  const allCasts = (await Promise.all(castPromises)).flat();

  // Sort by engagement (reactions + recasts)
  allCasts.sort((a, b) => {
    const engA = a.engagement.reactions + a.engagement.recasts;
    const engB = b.engagement.reactions + b.engagement.recasts;
    return engB - engA;
  });

  // Get channel info
  let channels = [];
  try {
    const channelsData = await safeFetch(`${WARPCAST}/all-channels`);
    if (channelsData?.result?.channels) {
      channels = channelsData.result.channels
        .filter(ch => CRYPTO_CHANNELS.includes(ch.id))
        .map(ch => ({
          id: ch.id,
          name: ch.name,
          description: ch.description?.slice(0, 100),
          followers: ch.followerCount,
          members: ch.memberCount,
        }));
    }
  } catch (e) {
    // Channel fetch failed
  }

  return {
    topCasts: allCasts.slice(0, limit),
    cryptoChannels: channels,
    trackedFids: CRYPTO_FIDS.length,
    source: "warpcast",
    fetchedAt: new Date().toISOString(),
  };
}

// === 4. KOL ACTIVITY ===
// What KOLs are buying — uses GMGN CLI
export async function getKolActivity(chain = "sol", limit = 20) {
  // Use GMGN CLI to get KOL trades
  const { execSync } = await import("child_process");

  try {
    const raw = execSync(
      `gmgn-cli track kol --chain ${chain} --limit ${limit} --raw`,
      { timeout: 15000, encoding: "utf-8", env: { ...process.env, PATH: process.env.PATH } }
    );

    const data = JSON.parse(raw);
    const trades = (data.list || data || []).slice(0, limit);

    // Process trades
    const processed = trades.map(t => ({
      timestamp: t.timestamp ? new Date(t.timestamp * 1000).toISOString() : null,
      side: t.side,
      token: {
        symbol: t.base_token?.symbol || "UNKNOWN",
        address: t.base_address,
        launchpad: t.base_token?.launchpad || null,
      },
      amountUsd: t.amount_usd,
      priceUsd: t.price_usd,
      kol: {
        address: t.maker,
        twitter: t.maker_info?.twitter_username || null,
        tags: t.maker_info?.tags || [],
      },
      isFullPosition: t.is_open_or_close === 0, // 0 = opened for kol/smartmoney
      txHash: t.transaction_hash,
    }));

    // Cluster detection: find tokens with multiple KOLs
    const tokenCounts = {};
    for (const t of processed) {
      const addr = t.token.address;
      if (!tokenCounts[addr]) tokenCounts[addr] = { token: t.token, buyers: new Set(), totalUsd: 0, trades: [] };
      if (t.side === "buy") {
        tokenCounts[addr].buyers.add(t.kol.address);
        tokenCounts[addr].totalUsd += t.amountUsd || 0;
      }
      tokenCounts[addr].trades.push(t);
    }

    const clusters = Object.values(tokenCounts)
      .filter(c => c.buyers.size >= 2)
      .map(c => ({
        token: c.token,
        kolCount: c.buyers.size,
        totalVolumeUsd: Math.round(c.totalUsd),
        signalStrength: c.buyers.size >= 4 ? "VERY STRONG" : c.buyers.size >= 3 ? "STRONG" : "MEDIUM",
      }))
      .sort((a, b) => b.kolCount - a.kolCount);

    return {
      chain,
      trades: processed,
      clusters,
      totalTrades: processed.length,
      source: "gmgn",
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      chain,
      trades: [],
      clusters: [],
      error: `GMGN CLI error: ${e.message}`,
      source: "gmgn",
      fetchedAt: new Date().toISOString(),
    };
  }
}

// === 5. SOCIAL SENTIMENT ===
// Multi-source sentiment for a keyword
export async function getSocialSentiment(keyword) {
  const results = {};

  // 1. Farcaster mentions — search casts by keyword
  const farcasterPromise = (async () => {
    // We'll check recent casts from crypto FIDs for keyword mentions
    const CRYPTO_FIDS = [3, 56, 12, 2, 194, 22032, 17441]; // broader set
    const casts = [];
    for (const fid of CRYPTO_FIDS) {
      const data = await safeFetch(`${WARPCAST}/casts?fid=${fid}&limit=20`);
      if (data?.result?.casts) {
        for (const cast of data.result.casts) {
          if (cast.text?.toLowerCase().includes(keyword.toLowerCase())) {
            casts.push({
              author: `fid:${fid}`,
              text: cast.text.slice(0, 200),
              engagement: cast.reactions?.count + cast.recasts?.count || 0,
              timestamp: cast.timestamp,
            });
          }
        }
      }
    }
    return casts.sort((a, b) => b.engagement - a.engagement).slice(0, 5);
  })();

  // 2. GeckoTerminal trending — check if keyword appears in trending pool names
  const geckoPromise = (async () => {
    const data = await safeFetch(`${GECKOTERMINAL}/networks/base/trending_pools?page=1`);
    if (!data?.data) return [];
    return data.data
      .filter(p => p.attributes?.name?.toLowerCase().includes(keyword.toLowerCase()))
      .map(p => ({
        name: p.attributes.name,
        address: p.relationships?.base_token?.data?.id?.split("_").pop(),
        volume24h: p.attributes.volume_usd?.h24,
        priceChange24h: p.attributes.price_change_percentage?.h24,
      }))
      .slice(0, 5);
  })();

  // 3. DexScreener search — find tokens matching keyword
  const dexPromise = (async () => {
    const data = await safeFetch(`${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(keyword)}`);
    if (!data?.pairs) return [];
    return data.pairs
      .filter(p => p.chainId === "base")
      .slice(0, 5)
      .map(p => ({
        token: p.baseToken?.symbol,
        address: p.baseToken?.address,
        priceUsd: p.priceUsd,
        volume24h: p.volume?.h24,
        priceChange24h: p.priceChange?.h24,
        liquidity: p.liquidity?.usd,
        hasSocial: !!(p.info?.socials?.length),
      }));
  })();

  const [farcaster, gecko, dex] = await Promise.all([farcasterPromise, geckoPromise, dexPromise]);

  // Calculate sentiment score
  let sentimentScore = 0;
  let sentimentLabel = "NEUTRAL";

  // Farcaster engagement = positive signal
  if (farcaster.length > 0) {
    const totalEng = farcaster.reduce((sum, c) => sum + c.engagement, 0);
    sentimentScore += Math.min(totalEng / 10, 30); // max 30 points
  }

  // Trending on GeckoTerminal = positive signal
  if (gecko.length > 0) {
    sentimentScore += 25;
    const avgChange = gecko.reduce((sum, p) => sum + (parseFloat(p.priceChange24h) || 0), 0) / gecko.length;
    if (avgChange > 10) sentimentScore += 15;
    else if (avgChange > 0) sentimentScore += 5;
    else if (avgChange < -10) sentimentScore -= 10;
  }

  // DexScreener presence + social profiles
  if (dex.length > 0) {
    sentimentScore += 15;
    const withSocial = dex.filter(d => d.hasSocial).length;
    sentimentScore += withSocial * 3;
  }

  if (sentimentScore >= 60) sentimentLabel = "BULLISH";
  else if (sentimentScore >= 40) sentimentLabel = "MODERATELY BULLISH";
  else if (sentimentScore >= 20) sentimentLabel = "NEUTRAL";
  else if (sentimentScore > 0) sentimentLabel = "MODERATELY BEARISH";
  else sentimentLabel = "BEARISH";

  return {
    keyword,
    sentiment: {
      score: Math.round(sentimentScore),
      label: sentimentLabel,
    },
    signals: {
      farcasterMentions: farcaster,
      trendingPools: gecko,
      dexTokens: dex,
    },
    dataPoints: farcaster.length + gecko.length + dex.length,
    sources: ["warpcast", "geckoterminal", "dexscreener"],
    fetchedAt: new Date().toISOString(),
  };
}
