/**
 * 本地测试网部署脚本
 * 用于快速部署和测试完整的 NFT 拍卖系统
 */
import hre from "hardhat";
const { ethers } = hre;

async function main() {
  console.log("🚀 开始部署 NFT 拍卖系统到本地网络...\n");

  // 获取部署账户
  const [deployer, seller, bidder1, bidder2] = await ethers.getSigners();

  console.log("部署账户:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("账户余额:", ethers.formatEther(balance), "ETH\n");

  // ========================================
  // 1. 部署 Mock Chainlink Aggregators
  // ========================================
  console.log("📊 部署 Mock Chainlink Aggregators...");
  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

  // ETH/USD 价格预言机 ($2800)
  const mockETHUSD = await MockV3Aggregator.deploy(8, 280000000000n);
  await mockETHUSD.waitForDeployment();
  console.log("   ✅ ETH/USD Aggregator:", await mockETHUSD.getAddress());
  console.log("   📈 ETH 价格设置为: $2800");

  // USDC/USD 价格预言机 ($0.9998)
  const mockUSDCUSD = await MockV3Aggregator.deploy(8, 99977674n);
  await mockUSDCUSD.waitForDeployment();
  console.log("   ✅ USDC/USD Aggregator:", await mockUSDCUSD.getAddress());
  console.log("   📈 USDC 价格设置为: $0.9998\n");

  // ========================================
  // 2. 部署 PriceOracleReader
  // ========================================
  console.log("💱 部署 PriceOracleReader...");
  const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
  const priceOracleReader = await PriceOracleReader.deploy();
  await priceOracleReader.waitForDeployment();
  console.log("   ✅ PriceOracleReader:", await priceOracleReader.getAddress());

  // 设置价格源
  await priceOracleReader.setEthPriceFeed(await mockETHUSD.getAddress());
  console.log("   ✅ ETH 价格源已设置\n");

  // ========================================
  // 3. 部署 NFTAuction（UUPS 代理模式）
  // ========================================
  console.log("🏛️  部署 NFTAuction（UUPS 代理模式）...");
  const NFTAuction = await ethers.getContractFactory("NFTAuction");
  const nftAuctionImpl = await NFTAuction.deploy();
  await nftAuctionImpl.waitForDeployment();
  console.log("   ✅ NFTAuction 实现合约:", await nftAuctionImpl.getAddress());

  // 部署代理
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const initData = nftAuctionImpl.interface.encodeFunctionData("initialize", []);
  const proxy = await ERC1967Proxy.deploy(await nftAuctionImpl.getAddress(), initData);
  await proxy.waitForDeployment();

  const nftAuction = await ethers.getContractAt("NFTAuction", await proxy.getAddress());
  console.log("   ✅ NFTAuction 代理合约:", await nftAuction.getAddress());
  console.log("   👤 管理员:", await nftAuction.admin(), "\n");

  // ========================================
  // 4. 部署 MockNFT
  // ========================================
  console.log("🎨 部署 MockNFT...");
  const MockNFT = await ethers.getContractFactory("MockNFT");
  const mockNFT = await MockNFT.deploy();
  await mockNFT.waitForDeployment();
  console.log("   ✅ MockNFT:", await mockNFT.getAddress());
  console.log("   📛 名称:", await mockNFT.name(), "(", await mockNFT.symbol(), ")\n");

  // ========================================
  // 5. 部署 MockERC20 (USDC)
  // ========================================
  console.log("💵 部署测试 ERC20 (USDC)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
  await mockUSDC.waitForDeployment();
  console.log("   ✅ MockUSDC:", await mockUSDC.getAddress());

  // 设置 USDC 价格源
  await priceOracleReader.setTokenPriceFeed(
    await mockUSDC.getAddress(),
    await mockUSDCUSD.getAddress()
  );
  console.log("   ✅ USDC 价格源已设置\n");

  // ========================================
  // 6. Mint 测试资产
  // ========================================
  console.log("🎁 Mint 测试资产...");

  // Mint NFT 给卖家
  await mockNFT.mint(seller.address);
  await mockNFT.mint(seller.address);
  console.log("   ✅ Minted NFT Token #0 to:", seller.address);
  console.log("   ✅ Minted NFT Token #1 to:", seller.address);

  // Mint USDC 给出价者
  const usdcAmount = ethers.parseUnits("10000", 6);
  await mockUSDC.mint(bidder1.address, usdcAmount);
  await mockUSDC.mint(bidder2.address, usdcAmount);
  console.log("   ✅ Minted 10,000 USDC to:", bidder1.address);
  console.log("   ✅ Minted 10,000 USDC to:", bidder2.address, "\n");

  // ========================================
  // 7. 创建示例拍卖
  // ========================================
  console.log("⚡ 创建示例 ETH 拍卖...");

  // 卖家授权 NFT
  await mockNFT.connect(seller).approve(await nftAuction.getAddress(), 0);

  // 创建拍卖
  const startPriceUSD = 1000n * 10n**8n; // $1000
  const duration = 3600; // 1 hour

  const createTx = await nftAuction.connect(seller).createAuction(
    await priceOracleReader.getAddress(),
    await mockNFT.getAddress(),
    0, // tokenId
    startPriceUSD,
    duration
  );
  await createTx.wait();

  console.log("   ✅ 拍卖已创建 (ID: 0)");
  console.log("   🏷️  NFT Token ID: 0");
  console.log("   💎 起拍价: $1000");
  console.log("   ⏰ 持续时间: 1 hour\n");

  // ========================================
  // 8. 模拟出价
  // ========================================
  console.log("🎯 模拟出价...");

  // Bidder1 用 ETH 出价
  const ethBid1 = ethers.parseEther("0.5"); // 0.5 ETH ≈ $1400
  await nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, {
    value: ethBid1
  });
  console.log("   ✅ Bidder1 出价: 0.5 ETH (~$1400)");

  // Bidder2 用 USDC 出价
  const usdcBid = ethers.parseUnits("1500", 6); // 1500 USDC
  await mockUSDC.connect(bidder2).approve(await nftAuction.getAddress(), usdcBid);
  await nftAuction.connect(bidder2).placeBid(0, await mockUSDC.getAddress(), usdcBid);
  console.log("   ✅ Bidder2 出价: 1500 USDC (~$1500)");

  // Bidder1 再次用 ETH 出价
  const ethBid2 = ethers.parseEther("0.6"); // 0.6 ETH ≈ $1680
  await nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, {
    value: ethBid2
  });
  console.log("   ✅ Bidder1 再次出价: 0.6 ETH (~$1680)\n");

  // ========================================
  // 9. 查询拍卖状态
  // ========================================
  console.log("📊 当前拍卖状态:");
  const auction = await nftAuction.auctions(0);
  console.log("   卖家:", auction.seller);
  console.log("   最高出价者:", auction.highestBidder);
  console.log("   最高出价:", ethers.formatEther(auction.highestBid), "ETH");
  console.log("   出价币种:", auction.tokenAddress === ethers.ZeroAddress ? "ETH" : "ERC20");
  console.log("   拍卖结束:", auction.ended ? "是" : "否");

  const remainingTime = await nftAuction.getRemainingTime(0);
  console.log("   剩余时间:", remainingTime.toString(), "秒\n");

  // ========================================
  // 10. 打印部署摘要
  // ========================================
  console.log("=".repeat(70));
  console.log("✨ 部署完成！\n");

  console.log("📝 合约地址汇总:");
  console.log("   ETH/USD Aggregator:    ", await mockETHUSD.getAddress());
  console.log("   USDC/USD Aggregator:   ", await mockUSDCUSD.getAddress());
  console.log("   PriceOracleReader:     ", await priceOracleReader.getAddress());
  console.log("   NFTAuction 实现:       ", await nftAuctionImpl.getAddress());
  console.log("   NFTAuction 代理:       ", await nftAuction.getAddress());
  console.log("   MockNFT:               ", await mockNFT.getAddress());
  console.log("   MockUSDC:              ", await mockUSDC.getAddress());

  console.log("\n🎮 测试账户:");
  console.log("   Deployer:              ", deployer.address);
  console.log("   Seller:                ", seller.address);
  console.log("   Bidder1:               ", bidder1.address);
  console.log("   Bidder2:               ", bidder2.address);

  console.log("\n📋 快速测试命令:");
  console.log("   # 查看拍卖信息");
  console.log(`   npx hardhat console --network localhost`);
  console.log(`   const auction = await ethers.getContractAt("NFTAuction", "${await nftAuction.getAddress()}")`);
  console.log(`   await auction.auctions(0)`);

  console.log("\n💡 提示:");
  console.log("   - 拍卖 #0 已创建，可以继续测试出价");
  console.log("   - NFT Token #1 仍然属于卖家，可创建第二个拍卖");
  console.log("   - 使用 getRemainingTime(0) 查看剩余时间");
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
