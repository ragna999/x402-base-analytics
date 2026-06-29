// NVIDIA NIM Client for RagRadar AI endpoints
// Free OpenAI-compatible API — no API key cost
// Models: llama-3.3-70b-instruct (default), deepseek-v4-flash (fast)

const NIM_BASE = "https://integrate.api.nvidia.com/v1";

// Prefer NIM, fall back to MiMo if NIM key unavailable
const PROVIDERS = {
  nim: {
    base: NIM_BASE,
    model: "meta/llama-3.3-70b-instruct",
    envKey: "NIM_API_KEY",
    maxTokens: 1024,
  },
  "nim-fast": {
    base: NIM_BASE,
    model: "deepseek-ai/deepseek-v4-flash",
    envKey: "NIM_API_KEY",
    maxTokens: 1024,
  },
  mimo: {
    base: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.5",
    envKey: "MIMO_API_KEY",
    maxTokens: 500,
  },
};

/**
 * Get the best available provider config
 */
function getProvider(preferFast = false) {
  const nimKey = process.env.NIM_API_KEY;
  const mimoKey = process.env.MIMO_API_KEY;

  if (nimKey) {
    return { ...PROVIDERS[preferFast ? "nim-fast" : "nim"], apiKey: nimKey };
  }
  if (mimoKey) {
    return { ...PROVIDERS.mimo, apiKey: mimoKey };
  }
  return null;
}

/**
 * Generate AI analysis for a token
 */
export async function analyzeTokenWithAI(tokenData) {
  const provider = getProvider();
  if (!provider) {
    return {
      analysis: "AI analysis unavailable — no API key configured (NIM_API_KEY or MIMO_API_KEY)",
      provider: null,
    };
  }

  const systemPrompt = `You are RagRadar, an expert on-chain crypto analyst. You analyze token data and provide actionable intelligence.

ANALYSIS FRAMEWORK:
1. SAFETY SCORE (0-100): Based on contract verification, holder distribution, liquidity lock status, honeypot detection
2. SMART MONEY SIGNAL: Are profitable wallets buying or selling? What's the conviction level?
3. LIQUIDITY HEALTH: Is liquidity locked? What's the volume/liquidity ratio? Slippage risk?
4. SOCIAL MOMENTUM: Community activity, KOL mentions, organic vs paid growth
5. RED FLAGS: Specific risks — whale concentration, mint functions, proxy contracts, low liquidity
6. VERDICT: ONE of [STRONG_BUY / BUY / HOLD / AVOID / SCAM]
7. CONFIDENCE: 1-10 scale based on data completeness

RULES:
- Be direct. No fluff. No "this is not financial advice."
- If data is missing, say so — don't hallucinate.
- Focus on what the DATA shows, not speculation.
- Use specific numbers from the data.
- Max 300 words.`;

  const userPrompt = `Analyze this token and provide a structured assessment:

TOKEN DATA:
${JSON.stringify(tokenData, null, 2)}

Respond with:
- safety_score: number 0-100
- verdict: one of STRONG_BUY / BUY / HOLD / AVOID / SCAM
- confidence: number 1-10
- summary: 2-3 sentence executive summary
- red_flags: array of specific risks
- bull_case: strongest argument for buying
- bear_case: strongest argument against buying
- smart_money_read: what the wallet data suggests`;

  try {
    const res = await fetch(`${provider.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: provider.maxTokens,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from AI provider");
    }

    // Try to parse as JSON (structured response)
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If not JSON, wrap as raw text
      parsed = { summary: content };
    }

    return {
      analysis: parsed,
      provider: provider.model,
      raw: content,
    };
  } catch (err) {
    return {
      analysis: `AI analysis error: ${err.message}`,
      provider: provider.model,
      error: err.message,
    };
  }
}

/**
 * Generate a quick AI insight (lighter, faster)
 */
export async function quickInsight(prompt) {
  const provider = getProvider(true); // prefer fast model
  if (!provider) return "AI unavailable";

  try {
    const res = await fetch(`${provider.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "No insight generated";
  } catch (err) {
    return `AI error: ${err.message}`;
  }
}
