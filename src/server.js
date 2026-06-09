1|import "dotenv/config";
2|import express from "express";
3|import cors from "cors";
4|import { fileURLToPath } from "url";
5|import { dirname, join } from "path";
6|import { paymentMiddleware, x402ResourceServer } from "@x402/express";
7|import { ExactEvmScheme } from "@x402/evm/exact/server";
8|import { HTTPFacilitatorClient } from "@x402/core/server";
9|import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
10|
11|// Wallet analytics
12|import { getPortfolio } from "./analytics/portfolio.js";
13|import { getTxHistory } from "./analytics/history.js";
14|import { getWalletSummary } from "./analytics/summary.js";
15|
16|// DeFi yields
17|import { getAllYields, getBestYieldsForAsset, getYieldsByRisk, getRebalanceRecommendation } from "./aggregator.js";
18|
19|// New: Token safety, wallet risk, protocol stats
20|import { analyzeTokenSafety } from "./tokenSafety.js";
21|import { analyzeWalletRisk } from "./walletRisk.js";
22|import { getBaseProtocolStats, getBaseTvlHistory, getBaseMovers } from "./protocolStats.js";
23|
24|// Sniper tracker
25|import { getTokenSnipers, getWalletSniperRecord, getTrendingSnipers } from "./sniper.js";
26|
27|// Smart money tracker
28|import { analyzeSmartMoneyWallet, analyzeTokenSmartMoney, getSmartMoneyActivity } from "./smartMoney.js";
29|
30|// Arbitrage scanner
31|import { scanAllPairs, scanSpecificPair, getSupportedTokens, getSupportedDexs } from "./arbScanner.js";
32|
33|// Whale alerts
34|import { getWhaleAlerts, getTokenWhaleActivity, getWhaleMovements, getWhaleHeatmap, getAccumulationSignals } from "./whaleAlerts.js";
35|
36|const app = express();
37|const PORT = process.env.PORT || 3000;
38|const PAY_TO = process.env.PAY_TO_ADDRESS;
39|const BUILDER_CODE = process.env.BUILDER_CODE || "bc_7isseb6n";
40|
41|if (!PAY_TO) {
42|  console.error("ERROR: PAY_TO_ADDRESS not set in .env");
43|  process.exit(1);
44|}
45|
46|async function createFacilitator() {
47|  const urls = [
48|    process.env.FACILITATOR_URL || "https://api.cdp.coinbase.com/platform/v2/x402",
49|    "https://facilitator.payai.network",
50|  ];
51|  for (const url of urls) {
52|    try {
53|      const client = new HTTPFacilitatorClient({ url });
54|      await client.getSupported();
55|      console.log(`Facilitator: ${url}`);
56|      return client;
57|    } catch (e) {
58|      console.warn(`Facilitator ${url} unavailable: ${e.message}`);
59|    }
60|  }
61|  return null;
62|}
63|
64|async function main() {
65|  const facilitatorClient = await createFacilitator();
66|  if (!facilitatorClient) {
67|    console.error("ERROR: No facilitator available.");
68|    process.exit(1);
69|  }
70|
71|  const resourceServer = new x402ResourceServer(facilitatorClient)
72|    .register("eip155:8453", new ExactEvmScheme());
73|
74|  const N = "eip155:8453";
75|  const discover = (input, inputSchema) => ({
76|    extensions: { ...declareDiscoveryExtension({ input, inputSchema }) },
77|  });
78|
79|  const paymentConfig = {
80|    // === FREE DAY — ALL ENDPOINTS FREE FOR 24 HOURS ===
81|    // Uncomment below to re-enable payments
82|
83|    // // === WALLET ANALYTICS ===
84|    // "GET /api/portfolio/:address": {
85|    //   accepts: [{ scheme: "exact", price: "$0.005", network: N, payTo: PAY_TO }],
86|    //   description: "Wallet token portfolio on Base (ETH + ERC-20 balances)",
87|    //   mimeType: "application/json",
88|    //   ...discover(
89|    //     { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
90|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
91|    //   ),
92|    // },
93|    // "GET /api/history/:address": {
94|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
95|    //   description: "Recent transaction history for a wallet on Base",
96|    //   mimeType: "application/json",
97|    //   ...discover(
98|    //     { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
99|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
100|    //   ),
101|    // },
102|    // "GET /api/summary/:address": {
103|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
104|    //   description: "Full wallet analytics: portfolio, history, activity stats on Base",
105|    //   mimeType: "application/json",
106|    //   ...discover(
107|    //     { address: { description: "EVM wallet address (0x...)", type: "string", required: true } },
108|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
109|    //   ),
110|    // },
111|    // "GET /api/yields": {
112|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
113|    //   description: "Real-time DeFi yields on Base — Morpho, Moonwell, Aerodrome. Sorted by APY.",
114|    //   mimeType: "application/json",
115|    //   ...discover({}, { type: "object", properties: {} }),
116|    // },
117|    // "GET /api/yields/best/:asset": {
118|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
119|    //   description: "Best yield for a specific asset (USDC, ETH, etc.) across all Base DeFi protocols",
120|    //   mimeType: "application/json",
121|    //   ...discover(
122|    //     { asset: { description: "Asset symbol (e.g. USDC, ETH)", type: "string", required: true } },
123|    //     { type: "object", properties: { asset: { type: "string" } }, required: ["asset"] }
124|    //   ),
125|    // },
126|    // "GET /api/yields/risk": {
127|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
128|    //   description: "DeFi yields categorized by risk level (low/medium/high)",
129|    //   mimeType: "application/json",
130|    //   ...discover({}, { type: "object", properties: {} }),
131|    // },
132|    // "GET /api/yields/rebalance": {
133|    //   accepts: [{ scheme: "exact", price: "$0.05", network: N, payTo: PAY_TO }],
134|    //   description: "Rebalance recommendation — compare your current yield vs best available",
135|    //   mimeType: "application/json",
136|    //   ...discover(
137|    //     { protocol: { description: "Current protocol", type: "string" }, apy: { description: "Current APY", type: "number" } },
138|    //     { type: "object", properties: { protocol: { type: "string" }, apy: { type: "number" } }, required: ["protocol", "apy"] }
139|    //   ),
140|    // },
141|    // "GET /api/sniper/token/:address": {
142|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
143|    //   description: "Early buyers (snipers) analysis for a token — find wallets that bought before the pump",
144|    //   mimeType: "application/json",
145|    //   ...discover(
146|    //     { address: { description: "Token contract address (0x...)", type: "string", required: true } },
147|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
148|    //   ),
149|    // },
150|    // "GET /api/sniper/wallet/:address": {
151|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
152|    //   description: "Sniper track record for a wallet — score, success rate, tokens traded",
153|    //   mimeType: "application/json",
154|    //   ...discover(
155|    //     { address: { description: "Wallet address (0x...)", type: "string", required: true } },
156|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
157|    //   ),
158|    // },
159|    // "GET /api/sniper/trending": {
160|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
161|    //   description: "Top snipers from trending tokens on Base — wallets that buy early on multiple tokens",
162|    //   mimeType: "application/json",
163|    //   ...discover({}, { type: "object", properties: {} }),
164|    // },
165|    // "GET /api/smart-money/wallet/:address": {
166|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
167|    //   description: "Smart money analysis for a wallet — score, classification, trading patterns, token activity",
168|    //   mimeType: "application/json",
169|    //   ...discover(
170|    //     { address: { description: "Wallet address (0x...)", type: "string", required: true } },
171|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
172|    //   ),
173|    // },
174|    // "GET /api/smart-money/token/:address": {
175|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
176|    //   description: "Find smart money buyers of a token — who's buying, are they still holding, smart money signal strength",
177|    //   mimeType: "application/json",
178|    //   ...discover(
179|    //     { address: { description: "Token contract address (0x...)", type: "string", required: true } },
180|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
181|    //   ),
182|    // },
183|    // "GET /api/smart-money/activity": {
184|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
185|    //   description: "What smart money wallets are buying right now on Base — scans trending tokens for multi-token early buyers",
186|    //   mimeType: "application/json",
187|    //   ...discover({}, { type: "object", properties: {} }),
188|    // },
189|    // "GET /api/token-safety/:address": {
190|    //   accepts: [{ scheme: "exact", price: "$0.02", network: N, payTo: PAY_TO }],
191|    //   description: "Token safety analysis — rug risk score, honeypot check, holder analysis, tax info. Uses GoPlus Security data.",
192|    //   mimeType: "application/json",
193|    //   ...discover(
194|    //     { address: { description: "Token contract address (0x...)", type: "string", required: true } },
195|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
196|    //   ),
197|    // },
198|    // "GET /api/wallet-risk/:address": {
199|    //   accepts: [{ scheme: "exact", price: "$0.03", network: N, payTo: PAY_TO }],
200|    //   description: "Wallet risk scoring — age, activity patterns, scam interaction, bot detection. On-chain behavior analysis.",
201|    //   mimeType: "application/json",
202|    //   ...discover(
203|    //     { address: { description: "Wallet address (0x...)", type: "string", required: true } },
204|    //     { type: "object", properties: { address: { type: "string" } }, required: ["address"] }
205|    //   ),
206|    // },
207|    // "GET /api/protocols/base": {
208|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
209|    //   description: "All Base protocol stats — TVL, categories, top protocols. Data from DeFiLlama.",
210|    //   mimeType: "application/json",
211|    //   ...discover({}, { type: "object", properties: {} }),
212|    // },
213|    // "GET /api/protocols/base/tvl": {
214|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
215|    //   description: "Base chain TVL history — 30 day trend, 7d/30d change. Data from DeFiLlama.",
216|    //   mimeType: "application/json",
217|    //   ...discover({}, { type: "object", properties: {} }),
218|    // },
219|    // "GET /api/protocols/base/movers": {
220|    //   accepts: [{ scheme: "exact", price: "$0.01", network: N, payTo: PAY_TO }],
221|    //   description: "Top gainers and losers on Base in 24h by TVL change",
222|    //   mimeType: "application/json",
223|    //   ...discover({}, { type: "object", properties: {} }),
224|    // },
225|  };
226|
227|  // --- Middleware ---
228|  app.use(cors());
229|  app.use(paymentMiddleware(paymentConfig, resourceServer));
230|
231|  // === FREE ROUTES ===
232|  const __filename = fileURLToPath(import.meta.url);
233|  const __dirname = dirname(__filename);
234|  app.use(express.static(join(__dirname, '..', 'public')));
235|
236|  app.get("/", (req, res) => {
237|    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
238|  });
239|
240|  app.get("/health", (req, res) => {
241|    res.json({ status: "ok", network: "base", payTo: PAY_TO, version: "7.0.0-paid", builderCode: BUILDER_CODE });
242|  });
243|
244|  // Builder Code info (ERC-8021)
245|  app.get("/builder-code", (req, res) => {
246|    res.json({
247|      builderCode: BUILDER_CODE,
248|      standard: "ERC-8021",
249|      network: "base",
250|      walletAddress: PAY_TO,
251|      registrationUrl: "https://base.dev",
252|      howToUse: "Append builder code suffix to transaction calldata for attribution. See https://docs.base.org/apps/builder-codes/agent-developers",
253|      hexSuffix: "0x0762617365617070" + Buffer.from(BUILDER_CODE).toString("hex") + "80218021802180218021802180218021",
254|    });
255|  });
256|
257|  app.get("/api/protocols", (req, res) => {
258|    res.json({
259|      wallet: ["portfolio", "history", "summary"],
260|      yields: ["morpho", "moonwell", "aerodrome"],
261|      safety: ["token-safety", "wallet-risk"],
262|      stats: ["protocols/base", "protocols/base/tvl", "protocols/base/movers"],
263|      sniper: ["token/:address", "wallet/:address", "trending"],
264|      smartMoney: ["wallet/:address", "token/:address", "activity"],
265|      whale: ["alerts", "alerts/:token", "movements", "heatmap", "accumulation"],
266|    });
267|  });
268|
269|  // === WALLET ANALYTICS ===
270|  app.get("/api/portfolio/:address", async (req, res) => {
271|    try { res.json(await getPortfolio(req.params.address)); }
272|    catch (err) { console.error("Portfolio error:", err.message); res.status(500).json({ error: "Failed" }); }
273|  });
274|
275|  app.get("/api/history/:address", async (req, res) => {
276|    try { res.json(await getTxHistory(req.params.address, Math.min(parseInt(req.query.limit) || 20, 100))); }
277|    catch (err) { console.error("History error:", err.message); res.status(500).json({ error: "Failed" }); }
278|  });
279|
280|  app.get("/api/summary/:address", async (req, res) => {
281|    try { res.json(await getWalletSummary(req.params.address)); }
282|    catch (err) { console.error("Summary error:", err.message); res.status(500).json({ error: "Failed" }); }
283|  });
284|
285|  // === DEFI YIELDS ===
286|  app.get("/api/yields", async (req, res) => {
287|    try { res.json(await getAllYields()); }
288|    catch (err) { console.error("Yields error:", err.message); res.status(500).json({ error: "Failed" }); }
289|  });
290|
291|  app.get("/api/yields/best/:asset", async (req, res) => {
292|    try { res.json(await getBestYieldsForAsset(req.params.asset)); }
293|    catch (err) { console.error("Best yield error:", err.message); res.status(500).json({ error: "Failed" }); }
294|  });
295|
296|  app.get("/api/yields/risk", async (req, res) => {
297|    try { res.json(await getYieldsByRisk()); }
298|    catch (err) { console.error("Risk yields error:", err.message); res.status(500).json({ error: "Failed" }); }
299|  });
300|
301|  app.get("/api/yields/rebalance", async (req, res) => {
302|    try {
303|      const { protocol, apy } = req.query;
304|      if (!protocol || !apy) return res.status(400).json({ error: "Missing: protocol, apy" });
305|      res.json(await getRebalanceRecommendation(protocol, apy));
306|    } catch (err) { console.error("Rebalance error:", err.message); res.status(500).json({ error: "Failed" }); }
307|  });
308|
309|  // === TOKEN SAFETY ===
310|  app.get("/api/token-safety/:address", async (req, res) => {
311|    try { res.json(await analyzeTokenSafety(req.params.address)); }
312|    catch (err) { console.error("Token safety error:", err.message); res.status(500).json({ error: "Failed" }); }
313|  });
314|
315|  // === WALLET RISK ===
316|  app.get("/api/wallet-risk/:address", async (req, res) => {
317|    try { res.json(await analyzeWalletRisk(req.params.address)); }
318|    catch (err) { console.error("Wallet risk error:", err.message); res.status(500).json({ error: "Failed" }); }
319|  });
320|
321|  // === BASE PROTOCOL STATS ===
322|  app.get("/api/protocols/base", async (req, res) => {
323|    try { res.json(await getBaseProtocolStats()); }
324|    catch (err) { console.error("Protocol stats error:", err.message); res.status(500).json({ error: "Failed" }); }
325|  });
326|
327|  app.get("/api/protocols/base/tvl", async (req, res) => {
328|    try { res.json(await getBaseTvlHistory()); }
329|    catch (err) { console.error("TVL error:", err.message); res.status(500).json({ error: "Failed" }); }
330|  });
331|
332|  app.get("/api/protocols/base/movers", async (req, res) => {
333|    try { res.json(await getBaseMovers()); }
334|    catch (err) { console.error("Movers error:", err.message); res.status(500).json({ error: "Failed" }); }
335|  });
336|
337|  // === SNIPER TRACKER (FREE - testing phase) ===
338|  app.get("/api/sniper/token/:address", async (req, res) => {
339|    try {
340|      const maxBuyers = Math.min(parseInt(req.query.limit) || 20, 50);
341|      res.json(await getTokenSnipers(req.params.address, { maxBuyers }));
342|    } catch (err) { console.error("Sniper token error:", err.message); res.status(500).json({ error: "Failed" }); }
343|  });
344|
345|  app.get("/api/sniper/wallet/:address", async (req, res) => {
346|    try { res.json(await getWalletSniperRecord(req.params.address)); }
347|    catch (err) { console.error("Sniper wallet error:", err.message); res.status(500).json({ error: "Failed" }); }
348|  });
349|
350|  app.get("/api/sniper/trending", async (req, res) => {
351|    try { res.json(await getTrendingSnipers()); }
352|    catch (err) { console.error("Sniper trending error:", err.message); res.status(500).json({ error: "Failed" }); }
353|  });
354|
355|  // === SMART MONEY TRACKER ===
356|  app.get("/api/smart-money/wallet/:address", async (req, res) => {
357|    try { res.json(await analyzeSmartMoneyWallet(req.params.address)); }
358|    catch (err) { console.error("Smart money wallet error:", err.message); res.status(500).json({ error: "Failed" }); }
359|  });
360|
361|  app.get("/api/smart-money/token/:address", async (req, res) => {
362|    try {
363|      const maxBuyers = Math.min(parseInt(req.query.limit) || 30, 50);
364|      res.json(await analyzeTokenSmartMoney(req.params.address, { maxBuyers }));
365|    } catch (err) { console.error("Smart money token error:", err.message); res.status(500).json({ error: "Failed" }); }
366|  });
367|
368|  app.get("/api/smart-money/activity", async (req, res) => {
369|    try { res.json(await getSmartMoneyActivity()); }
370|    catch (err) { console.error("Smart money activity error:", err.message); res.status(500).json({ error: "Failed" }); }
371|  });
372|
373|  // === WHALE ALERTS ===
374|  app.get("/api/whale/alerts", async (req, res) => {
375|    try {
376|      const minAmount = parseInt(req.query.min_amount) || 10000;
377|      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
378|      res.json(await getWhaleAlerts({ minAmount, limit }));
379|    } catch (err) { console.error("Whale alerts error:", err.message); res.status(500).json({ error: "Failed" }); }
380|  });
381|
382|  app.get("/api/whale/alerts/:token", async (req, res) => {
383|    try {
384|      const limit = Math.min(parseInt(req.query.limit) || 30, 50);
385|      res.json(await getTokenWhaleActivity(req.params.token, { limit }));
386|    } catch (err) { console.error("Whale token error:", err.message); res.status(500).json({ error: "Failed" }); }
387|  });
388|
389|  app.get("/api/whale/movements", async (req, res) => {
390|    try {
391|      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
392|      res.json(await getWhaleMovements({ limit }));
393|    } catch (err) { console.error("Whale movements error:", err.message); res.status(500).json({ error: "Failed" }); }
394|  });
395|
396|  app.get("/api/whale/heatmap", async (req, res) => {
397|    try {
398|      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
399|      res.json(await getWhaleHeatmap({ limit }));
400|    } catch (err) { console.error("Whale heatmap error:", err.message); res.status(500).json({ error: "Failed" }); }
401|  });
402|
403|  app.get("/api/whale/accumulation", async (req, res) => {
404|    try {
405|      const limit = Math.min(parseInt(req.query.limit) || 10, 30);
406|      res.json(await getAccumulationSignals({ limit }));
407|    } catch (err) { console.error("Whale accumulation error:", err.message); res.status(500).json({ error: "Failed" }); }
408|  });
409|
410|  // === ARBITRAGE SCANNER (internal tool — free) ===
411|  app.get("/api/arb/scan", async (req, res) => {
412|    try {
413|      const amount = parseInt(req.query.amount) || 1000;
414|      res.json(await scanAllPairs(amount));
415|    } catch (err) { console.error("Arb scan error:", err.message); res.status(500).json({ error: "Failed" }); }
416|  });
417|
418|  app.get("/api/arb/pair/:from/:to", async (req, res) => {
419|    try {
420|      const amount = parseInt(req.query.amount) || 1000;
421|      const result = await scanSpecificPair(req.params.from.toUpperCase(), req.params.to.toUpperCase(), amount);
422|      res.json(result);
423|    } catch (err) { console.error("Arb pair error:", err.message); res.status(500).json({ error: "Failed", details: err.message }); }
424|  });
425|
426|  app.get("/api/arb/tokens", (req, res) => {
427|    res.json({ tokens: getSupportedTokens(), dexs: getSupportedDexs() });
428|  });
429|
430|  // --- Start ---
431|  app.listen(PORT, () => {
432|    console.log(`
433|Base Analytics API v3.0 running on port ${PORT}
434|Payments -> ${PAY_TO}
435|
436|FREE:
437|  GET /health
438|  GET /api/protocols
439|
440|WALLET ($0.005-$0.02):
441|  GET /api/portfolio/:address
442|  GET /api/history/:address
443|  GET /api/summary/:address
444|
445|YIELDS ($0.01-$0.05):
446|  GET /api/yields
447|  GET /api/yields/best/:asset
448|  GET /api/yields/risk
449|  GET /api/yields/rebalance
450|
451|SAFETY ($0.02-$0.03):  [NEW]
452|  GET /api/token-safety/:address
453|  GET /api/wallet-risk/:address
454|
455|STATS ($0.01):  [NEW]
456|  GET /api/protocols/base
457|  GET /api/protocols/base/tvl
458|  GET /api/protocols/base/movers
459|
460|SNIPER TRACKER ($0.01):
461|  GET /api/sniper/token/:address
462|  GET /api/sniper/wallet/:address
463|  GET /api/sniper/trending
464|
465|SMART MONEY ($0.02):
466|  GET /api/smart-money/wallet/:address
467|  GET /api/smart-money/token/:address
468|  GET /api/smart-money/activity
469|
470|WHALE ALERTS ($0.01-$0.02):  [NEW]
471|  GET /api/whale/alerts
472|  GET /api/whale/alerts/:token
473|  GET /api/whale/movements
474|  GET /api/whale/heatmap
475|  GET /api/whale/accumulation
476|
477|Total: 25 endpoints | Bazaar discovery: ENABLED
478|`);
479|  });
480|}
481|
482|main();
483|