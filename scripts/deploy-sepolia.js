/**
 * Sepolia 测试网部署脚本
 *
 * 使用前请确保：
 * 1. 在 hardhat.config.cjs 中配置了 Sepolia 网络
 * 2. 在 .env 文件中配置了 SEPOLIA_RPC_URL 和 PRIVATE_KEY
 *    - PRIVATE_KEY: 用于签名交易，Hardhat 会从 .env 读取并配置到 networks.sepolia.accounts
 *    - 脚本通过 ethers.getSigners() 获取部署账户，该账户来自 hardhat.config.cjs 的 accounts 配置
 * 3. 部署账户有足够的 Sepolia ETH（可从 https://sepoliafaucet.com 获取）
 *
 * 工作流程：
 * .env (PRIVATE_KEY) → hardhat.config.cjs (networks.sepolia.accounts) → ethers.getSigners() → 部署账户
 */
import hre from "hardhat";
const { ethers } = hre;

// Sepolia 测试网的官方 Chainlink 价格源
const CHAINLINK_FEEDS = {
  ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",  // ETH/USD
  USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // USDC/USD
  USDT_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // USDT/USD (使用相同的)
};

async function main() {
  console.log("🚀 开始部署 NFT 拍卖系统到 Sepolia 测试网...\n");

  // 获取部署账户
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("账户余额:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.1")) {
    console.warn("⚠️  警告: 账户余额较低，建议至少有 0.1 ETH");
    console.warn("   获取测试 ETH: https://cloud.google.com/application/web3/faucet/ethereum/sepolia\n");
  } else {
    console.log("✅ 余额充足\n");
  }

  // ========================================
  // 1. 部署 PriceOracleReader
  // ========================================
  console.log("💱 部署 PriceOracleReader...");
  const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
  const priceOracleReader = await PriceOracleReader.deploy();
  await priceOracleReader.waitForDeployment();
  const priceOracleReaderAddress = await priceOracleReader.getAddress();
  console.log("   ✅ PriceOracleReader:", priceOracleReaderAddress);

  // 设置 ETH 价格源（使用 Chainlink 官方预言机）
  console.log("   📊 设置 ETH 价格源...");
  await priceOracleReader.setEthPriceFeed(CHAINLINK_FEEDS.ETH_USD);
  console.log("   ✅ ETH/USD 价格源已设置:", CHAINLINK_FEEDS.ETH_USD, "\n");

  // ========================================
  // 2. 部署 NFTAuction（UUPS 代理模式）
  // ========================================
  console.log("🏛️  部署 NFTAuction（UUPS 代理模式）...");
  const NFTAuction = await ethers.getContractFactory("NFTAuction");

  // 部署实现合约
  console.log("   📝 部署实现合约...");
  const nftAuctionImpl = await NFTAuction.deploy();
  await nftAuctionImpl.waitForDeployment();
  const nftAuctionImplAddress = await nftAuctionImpl.getAddress();
  console.log("   ✅ NFTAuction 实现合约:", nftAuctionImplAddress);

  // 部署代理合约
  console.log("   📝 部署代理合约...");
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const initData = nftAuctionImpl.interface.encodeFunctionData("initialize", []);
  const proxy = await ERC1967Proxy.deploy(nftAuctionImplAddress, initData);
  await proxy.waitForDeployment();

  const nftAuction = await ethers.getContractAt("NFTAuction", await proxy.getAddress());
  const nftAuctionAddress = await nftAuction.getAddress();
  console.log("   ✅ NFTAuction 代理合约:", nftAuctionAddress);
  console.log("   👤 管理员:", await nftAuction.admin(), "\n");

  // ========================================
  // 3. 部署 MockNFT（可选：用于测试）
  // ========================================
  console.log("🎨 部署 MockNFT（测试用）...");
  const MockNFT = await ethers.getContractFactory("MockNFT");
  const mockNFT = await MockNFT.deploy();
  await mockNFT.waitForDeployment();
  const mockNFTAddress = await mockNFT.getAddress();
  console.log("   ✅ MockNFT:", mockNFTAddress);
  console.log("   📛 名称:", await mockNFT.name(), "(", await mockNFT.symbol(), ")");
  console.log("   💡 提示: 这是测试 NFT，你可以用自己的 NFT 合约替代\n");

  // ========================================
  // 4. 部署测试 ERC20（可选）
  // ========================================
  console.log("💵 部署测试 ERC20（可选，用于测试 ERC20 出价）...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy("Test USDC", "USDC", 6);
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("   ✅ MockUSDC:", mockUSDCAddress);

  // 设置 USDC 价格源
  console.log("   📊 设置 USDC 价格源...");
  await priceOracleReader.setTokenPriceFeed(mockUSDCAddress, CHAINLINK_FEEDS.USDC_USD);
  console.log("   ✅ USDC/USD 价格源已设置:", CHAINLINK_FEEDS.USDC_USD, "\n");

  // ========================================
  // 5. 部署 MockFeePolicy（可选：用于测试手续费功能）
  // ========================================
  console.log("💰 部署 MockFeePolicy（测试手续费策略）...");
  const MockFeePolicy = await ethers.getContractFactory("MockFeePolicy");
  // 默认手续费：2.5% (0.025 ETH 对于 1 ETH 的成交额)
  const defaultFeeAmount = ethers.parseEther("0.025");
  const mockFeePolicy = await MockFeePolicy.deploy(defaultFeeAmount, deployer.address);
  await mockFeePolicy.waitForDeployment();
  const mockFeePolicyAddress = await mockFeePolicy.getAddress();
  console.log("   ✅ MockFeePolicy:", mockFeePolicyAddress);
  console.log("   💵 默认手续费: 2.5% (0.025 ETH per 1 ETH)");
  console.log("   👤 手续费归集地址:", deployer.address);

  // 设置手续费策略到 NFTAuction
  console.log("   📝 设置手续费策略到 NFTAuction...");
  await nftAuction.setFeePolicy(mockFeePolicyAddress);
  console.log("   ✅ 手续费策略已设置\n");

  // ========================================
  // 6. Mint 测试 NFT（可选）
  // ========================================
  console.log("🎁 Mint 测试 NFT...");
  await mockNFT.mint(deployer.address);
  console.log("   ✅ Minted NFT Token #0 to:", deployer.address);
  console.log("   💡 你现在可以用这个 NFT 创建拍卖\n");

  // ========================================
  // 7. 验证合约（可选）
  // ========================================
  console.log("📋 合约验证命令:");
  console.log("   # PriceOracleReader");
  console.log(`   npx hardhat verify --network sepolia ${priceOracleReaderAddress}`);
  console.log("\n   # NFTAuction 实现合约");
  console.log(`   npx hardhat verify --network sepolia ${nftAuctionImplAddress}`);
  console.log("\n   # NFTAuction 代理合约");
  console.log(`   npx hardhat verify --network sepolia ${nftAuctionAddress}`);
  console.log("\n   # MockNFT");
  console.log(`   npx hardhat verify --network sepolia ${mockNFTAddress}`);
  console.log("\n   # MockUSDC");
  console.log(`   npx hardhat verify --network sepolia ${mockUSDCAddress} "Test USDC" "USDC" 6`);
  console.log("\n   # MockFeePolicy");
  console.log(`   npx hardhat verify --network sepolia ${mockFeePolicyAddress} ${defaultFeeAmount} ${deployer.address}\n`);

  // ========================================
  // 8. 打印部署摘要
  // ========================================
  console.log("=".repeat(80));
  console.log("✨ 部署完成！\n");

  console.log("📝 合约地址汇总:");
  console.log("   PriceOracleReader:     ", priceOracleReaderAddress);
  console.log("   NFTAuction 实现:       ", nftAuctionImplAddress);
  console.log("   NFTAuction 代理:       ", nftAuctionAddress);
  console.log("   MockNFT (测试):        ", mockNFTAddress);
  console.log("   MockUSDC (测试):       ", mockUSDCAddress);
  console.log("   MockFeePolicy (测试):  ", mockFeePolicyAddress);

  console.log("\n🔗 Etherscan 链接:");
  console.log("   PriceOracleReader:     ", `https://sepolia.etherscan.io/address/${priceOracleReaderAddress}`);
  console.log("   NFTAuction 代理:       ", `https://sepolia.etherscan.io/address/${nftAuctionAddress}`);
  console.log("   MockNFT:               ", `https://sepolia.etherscan.io/address/${mockNFTAddress}`);
  console.log("   MockFeePolicy:         ", `https://sepolia.etherscan.io/address/${mockFeePolicyAddress}`);

  console.log("\n📊 Chainlink 价格源:");
  console.log("   ETH/USD:               ", `https://sepolia.etherscan.io/address/${CHAINLINK_FEEDS.ETH_USD}`);
  console.log("   USDC/USD:              ", `https://sepolia.etherscan.io/address/${CHAINLINK_FEEDS.USDC_USD}`);

  console.log("\n🎮 下一步操作:");
  console.log("   1. 在 Etherscan 上验证合约（使用上面的验证命令）");
  console.log("   2. 创建拍卖:");
  console.log(`      - 授权 NFT: mockNFT.approve("${nftAuctionAddress}", 0)`);
  console.log(`      - 创建拍卖: nftAuction.createAuction(`);
  console.log(`          "${priceOracleReaderAddress}",  // priceOracleReader`);
  console.log(`          "${mockNFTAddress}",             // nft contract`);
  console.log(`          0,                               // tokenId`);
  console.log(`          100000000000,                    // $1000 起拍价`);
  console.log(`          86400                            // 1 天`);
  console.log(`        )`);
  console.log("   3. 在 Sepolia 测试网上测试出价功能");

  console.log("\n💡 提示:");
  console.log("   - 保存好所有合约地址");
  console.log("   - 验证合约后可以在 Etherscan 上直接交互");
  console.log("   - MockNFT、MockUSDC 和 MockFeePolicy 仅用于测试，生产环境请使用真实合约");
  console.log("   - 手续费策略已自动设置到 NFTAuction，默认手续费为 2.5%");
  console.log("   - 可以通过 setFeePolicy(address(0)) 禁用手续费");
  console.log("=".repeat(80));

  // ========================================
  // 9. 保存部署信息到文件
  // ========================================
  const deploymentInfo = {
    network: "sepolia",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      priceOracleReader: priceOracleReaderAddress,
      nftAuctionImpl: nftAuctionImplAddress,
      nftAuctionProxy: nftAuctionAddress,
      mockNFT: mockNFTAddress,
      mockUSDC: mockUSDCAddress,
      mockFeePolicy: mockFeePolicyAddress,
    },
    feePolicy: {
      address: mockFeePolicyAddress,
      defaultFeeAmount: defaultFeeAmount.toString(),
      feeRecipient: deployer.address,
    },
    chainlink: CHAINLINK_FEEDS,
    etherscan: {
      priceOracleReader: `https://sepolia.etherscan.io/address/${priceOracleReaderAddress}`,
      nftAuction: `https://sepolia.etherscan.io/address/${nftAuctionAddress}`,
      mockNFT: `https://sepolia.etherscan.io/address/${mockNFTAddress}`,
      mockFeePolicy: `https://sepolia.etherscan.io/address/${mockFeePolicyAddress}`,
    }
  };

  const fs = await import('fs');
  fs.writeFileSync(
    'deployment-sepolia.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n💾 部署信息已保存到: deployment-sepolia.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
