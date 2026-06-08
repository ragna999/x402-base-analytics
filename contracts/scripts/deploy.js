// scripts/deploy.js — Deploy FlashLoanArb contract to Base
const hre = require("hardhat");

// Aave V3 PoolAddressesProvider on Base Mainnet
const AAVE_PROVIDER = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";

async function main() {
  console.log("Deploying FlashLoanArb to Base Mainnet...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  if (balance < hre.ethers.parseEther("0.001")) {
    console.error("ERROR: Not enough ETH for deployment. Need at least 0.001 ETH");
    process.exit(1);
  }
  
  const FlashLoanArb = await hre.ethers.getContractFactory("FlashLoanArb");
  const arb = await FlashLoanArb.deploy(AAVE_PROVIDER);
  
  await arb.waitForDeployment();
  const address = await arb.getAddress();
  
  console.log("FlashLoanArb deployed to:", address);
  console.log("Owner:", deployer.address);
  console.log("");
  console.log("Next steps:");
  console.log("1. Fund contract with small ETH for gas (optional)");
  console.log("2. Run: node bot.js");
  console.log("3. Contract will borrow via flash loan, arb, and keep profit");
  
  // Save deployment info
  const fs = require("fs");
  const deployment = {
    network: "base",
    chainId: 8453,
    contract: address,
    deployer: deployer.address,
    aaveProvider: AAVE_PROVIDER,
    deployedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(deployment, null, 2)
  );
  console.log("\nDeployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
