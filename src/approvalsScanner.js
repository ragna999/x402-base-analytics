// Token Approvals Scanner — check wallet approvals for security
import { ethers } from "ethers";

const RPCS = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum-rpc.publicnode.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
};

// ERC-20 Approval event signature
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

// Known spender labels
const KNOWN_SPENDERS = {
  // Base
  "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24": "Base: Uniswap V3 Router",
  "0x2626664c2603336E57B271c5C0b26F421741e481": "Base: Uniswap Universal Router",
  "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B": "Base: Uniswap Universal Router V2",
  "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC": "Base: Aerodrome Router",
  "0x827922686190790b37229fd06084e0d1624E206A": "Base: Aerodrome SlipRouter",
  "0x88C63F5c89d82C2B0f0C5C5Ff95F9485dD1b8E87": "Base: Morpho Blue",
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb": "Base: Morpho Bundler",
  "0xFC71bf7b53C92742e8B5D0DE521a7F0E2b4eF5e5": "Base: 1inch Router",
  "0x1111111254EEB25477B68fb85Ed929f73A960582": "Base: 1inch AggregationRouter V6",
  // Ethereum
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D": "Ethereum: Uniswap V2 Router",
  "0xE592427A0AEce92De3Edee1F18E0157C05861564": "Ethereum: Uniswap V3 Router",
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45": "Ethereum: Uniswap SwapRouter02",
  "0x1111111254fb6c44bAC0beD2854e76F90643097d": "Ethereum: 1inch V4 Router",
  "0x1111111254EEB25477B68fb85Ed929f73A960582": "Ethereum: 1inch V6 Router",
  "0xDef1C0ded9bec7F1a1670819833240f027b25EfF": "Ethereum: 0x Exchange Proxy",
  // Arbitrum
  "0xE592427A0AEce92De3Edee1F18E0157C05861564": "Arbitrum: Uniswap V3 Router",
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45": "Arbitrum: Uniswap SwapRouter02",
};

// ERC-20 ABI for allowance check
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
];

export async function scanApprovals(chain, walletAddress) {
  if (!RPCS[chain]) {
    throw new Error(`Unsupported chain: ${chain}. Use: ${Object.keys(RPCS).join(", ")}`);
  }

  const provider = new ethers.JsonRpcProvider(RPCS[chain]);
  const wallet = ethers.getAddress(walletAddress);

  // Get Approval events FROM this wallet in recent blocks
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 9000; // ~1 day on Base, ~1.5 days on ETH

  const logs = await provider.getLogs({
    fromBlock,
    toBlock: currentBlock,
    topics: [APPROVAL_TOPIC, ethers.zeroPadValue(wallet, 32)],
  });

  // Deduplicate by token+spender
  const approvals = new Map();
  for (const log of logs) {
    const tokenAddr = log.address;
    const spender = ethers.getAddress("0x" + log.topics[2].slice(26));
    const key = `${tokenAddr}-${spender}`;
    
    if (!approvals.has(key)) {
      approvals.set(key, {
        token: tokenAddr,
        spender,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      });
    }
  }

  // Check current allowance for each unique approval
  const results = [];
  const checkPromises = Array.from(approvals.values()).map(async (approval) => {
    try {
      const contract = new ethers.Contract(approval.token, ERC20_ABI, provider);
      const [allowance, symbol, name, decimals] = await Promise.all([
        contract.allowance(wallet, approval.spender),
        contract.symbol().catch(() => "UNKNOWN"),
        contract.name().catch(() => "Unknown"),
        contract.decimals().catch(() => 18),
      ]);

      const allowanceStr = allowance.toString();
      const isUnlimited = allowanceStr === MAX_UINT256 || allowanceStr.length > 30;
      const humanAllowance = Number(ethers.formatUnits(allowance, decimals));
      const spenderLabel = KNOWN_SPENDERS[approval.spender] || "Unknown";

      return {
        token: {
          address: approval.token,
          symbol,
          name,
          decimals: Number(decimals),
        },
        spender: {
          address: approval.spender,
          label: spenderLabel,
          isKnown: !!KNOWN_SPENDERS[approval.spender],
        },
        allowance: {
          raw: allowanceStr,
          human: isUnlimited ? "UNLIMITED" : humanAllowance.toFixed(4),
          isUnlimited,
        },
        risk: isUnlimited ? "HIGH" : humanAllowance > 1000000 ? "MEDIUM" : "LOW",
        lastApprovalBlock: approval.blockNumber,
      };
    } catch (err) {
      return {
        token: { address: approval.token, symbol: "ERROR" },
        spender: { address: approval.spender },
        error: err.message,
      };
    }
  });

  const approvalResults = await Promise.all(checkPromises);
  
  // Filter out zero allowances and sort by risk
  const activeApprovals = approvalResults
    .filter(a => !a.error && a.allowance && a.allowance.raw !== "0")
    .sort((a, b) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (riskOrder[a.risk] || 3) - (riskOrder[b.risk] || 3);
    });

  const unlimitedCount = activeApprovals.filter(a => a.allowance?.isUnlimited).length;
  
  return {
    chain,
    wallet: wallet,
    summary: {
      totalApprovals: activeApprovals.length,
      unlimitedApprovals: unlimitedCount,
      riskLevel: unlimitedCount > 3 ? "HIGH" : unlimitedCount > 0 ? "MEDIUM" : "LOW",
      recommendation: unlimitedCount > 0 
        ? `Found ${unlimitedCount} unlimited approvals. Consider revoking via revoke.cash`
        : "No unlimited approvals found. Wallet looks clean.",
    },
    approvals: activeApprovals,
    revokeUrl: `https://revoke.cash/address/${wallet}`,
    scannedBlocks: { from: fromBlock, to: currentBlock },
    timestamp: new Date().toISOString(),
  };
}
