// Token Approvals Scanner — check wallet approvals for security
// Uses native fetch + JSON-RPC (no ethers dependency)

const RPCS = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum-rpc.publicnode.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
};

const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

const KNOWN_SPENDERS = {
  "0x4752ba5dbC23f44D87826276BF6Fd6b1C372aD24": "Uniswap V3 Router",
  "0x2626664c2603336E57B271c5C0b26F421741e481": "Uniswap Universal Router",
  "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B": "Uniswap Universal Router V2",
  "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC": "Aerodrome Router",
  "0x827922686190790b37229fd06084e0d1624E206A": "Aerodrome SlipRouter",
  "0x88C63F5c89d82C2B0f0C5C5Ff95F9485dD1b8E87": "Morpho Blue",
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb": "Morpho Bundler",
  "0xFC71bf7b53C92742e8B5D0DE521a7F0E2b4eF5e5": "1inch Router",
  "0x1111111254EEB25477B68fb85Ed929f73A960582": "1inch V6 Router",
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D": "Uniswap V2 Router (ETH)",
  "0xE592427A0AEce92De3Edee1F18E0157C05861564": "Uniswap V3 Router",
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45": "Uniswap SwapRouter02",
  "0xDef1C0ded9bec7F1a1670819833240f027b25EfF": "0x Exchange Proxy",
};

const KNOWN_TOKENS = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { symbol: "USDC", decimals: 6 },
};

async function rpcCall(url, method, params = []) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function padAddress(addr) {
  return "0x" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function decodeUint256(hex) {
  if (!hex || hex === "0x") return "0";
  return BigInt(hex).toString();
}

function formatTokenAmount(raw, decimals) {
  const num = Number(raw) / Math.pow(10, decimals);
  return num.toFixed(Math.min(decimals, 6));
}

export async function scanApprovals(chain, walletAddress) {
  if (!RPCS[chain]) {
    throw new Error(`Unsupported chain: ${chain}. Use: ${Object.keys(RPCS).join(", ")}`);
  }

  const rpc = RPCS[chain];
  const wallet = walletAddress.toLowerCase();
  const paddedWallet = padAddress(wallet);

  const currentBlock = parseInt(await rpcCall(rpc, "eth_blockNumber"), 16);
  const fromBlock = "0x" + Math.max(0, currentBlock - 9000).toString(16);

  const logs = await rpcCall(rpc, "eth_getLogs", [{
    fromBlock,
    toBlock: "latest",
    topics: [APPROVAL_TOPIC, paddedWallet],
  }]);

  // Deduplicate by token+spender
  const approvalMap = new Map();
  for (const log of (logs || [])) {
    const tokenAddr = log.address.toLowerCase();
    const spender = "0x" + log.topics[2].slice(26).toLowerCase();
    const key = `${tokenAddr}-${spender}`;
    if (!approvalMap.has(key)) {
      approvalMap.set(key, { token: tokenAddr, spender, blockNumber: parseInt(log.blockNumber, 16) });
    }
  }

  // Check current allowance for each
  const ERC20_ALLOWANCE = "0xdd62ed3e"; // allowance(address,address)
  const ERC20_SYMBOL = "0x95d89b41"; // symbol()
  const ERC20_DECIMALS = "0x313ce567"; // decimals()

  const results = [];

  for (const [key, approval] of approvalMap) {
    try {
      // Build allowance call data: allowance(owner, spender)
      const allowanceData = ERC20_ALLOWANCE + paddedWallet + padAddress(approval.spender);

      const [allowanceHex, symbolHex, decimalsHex] = await Promise.all([
        rpcCall(rpc, "eth_call", [{ to: approval.token, data: allowanceData }, "latest"]),
        rpcCall(rpc, "eth_call", [{ to: approval.token, data: ERC20_SYMBOL }, "latest"]).catch(() => "0x"),
        rpcCall(rpc, "eth_call", [{ to: approval.token, data: ERC20_DECIMALS }, "latest"]).catch(() => "0x12"),
      ]);

      const allowanceRaw = decodeUint256(allowanceHex);
      if (allowanceRaw === "0") continue;

      const isUnlimited = allowanceRaw === MAX_UINT256 || allowanceRaw.length > 30;
      const decimals = parseInt(decimalsHex, 16) || 18;

      // Decode symbol from ABI-encoded string
      let symbol = KNOWN_TOKENS[approval.token]?.symbol || "UNKNOWN";
      try {
        if (symbolHex && symbolHex.length > 130) {
          const len = parseInt(symbolHex.slice(64, 128), 16);
          const hexStr = symbolHex.slice(128, 128 + len * 2);
          symbol = Buffer.from(hexStr, "hex").toString("utf8");
        }
      } catch {}

      const humanAmount = isUnlimited ? "UNLIMITED" : formatTokenAmount(allowanceRaw, decimals);
      const spenderLabel = KNOWN_SPENDERS[approval.spender] || "Unknown Contract";

      results.push({
        token: { address: approval.token, symbol, decimals },
        spender: { address: approval.spender, label: spenderLabel, isKnown: !!KNOWN_SPENDERS[approval.spender] },
        allowance: { raw: allowanceRaw, human: humanAmount, isUnlimited },
        risk: isUnlimited ? "HIGH" : "LOW",
        lastApprovalBlock: approval.blockNumber,
      });
    } catch (err) {
      // Skip failed tokens
    }
  }

  results.sort((a, b) => (a.risk === "HIGH" ? -1 : 1));
  const unlimitedCount = results.filter(r => r.allowance.isUnlimited).length;

  return {
    chain,
    wallet: walletAddress,
    summary: {
      totalApprovals: results.length,
      unlimitedApprovals: unlimitedCount,
      riskLevel: unlimitedCount > 3 ? "HIGH" : unlimitedCount > 0 ? "MEDIUM" : "LOW",
      recommendation: unlimitedCount > 0
        ? `Found ${unlimitedCount} unlimited approvals. Consider revoking via revoke.cash`
        : "No unlimited approvals found. Wallet looks clean.",
    },
    approvals: results,
    revokeUrl: `https://revoke.cash/address/${walletAddress}`,
    scannedBlocks: { from: parseInt(fromBlock, 16), to: currentBlock },
    timestamp: new Date().toISOString(),
  };
}
