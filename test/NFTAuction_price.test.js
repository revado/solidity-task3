import hre from "hardhat";
const { ethers } = hre;
import { expect } from "chai";

describe("NFTAuction - 不同精度代币测试", function () {
  let nftAuction;
  let priceOracleReader;
  let mockNFT;
  let mockETHUSD;
  let mockDAI;
  let mockWBTC;
  let mockDAIUSD;
  let mockWBTCUSD;
  let owner, bidder1, bidder2;

  // 价格常量（8位小数）
  const ETH_PRICE = 280000000000n; // $2800
  const DAI_PRICE = 100000000n;     // $1.00
  const WBTC_PRICE = 4000000000000n; // $40,000
  const START_PRICE_USD = 100000000000n; // $1000 USD

  beforeEach(async function () {
    [owner, bidder1, bidder2] = await ethers.getSigners();

    // 部署 Mock 价格预言机
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

    mockETHUSD = await MockV3Aggregator.deploy(8, ETH_PRICE);
    await mockETHUSD.waitForDeployment();

    mockDAIUSD = await MockV3Aggregator.deploy(8, DAI_PRICE);
    await mockDAIUSD.waitForDeployment();

    mockWBTCUSD = await MockV3Aggregator.deploy(8, WBTC_PRICE);
    await mockWBTCUSD.waitForDeployment();

    // 部署 PriceOracleReader
    const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
    priceOracleReader = await PriceOracleReader.deploy();
    await priceOracleReader.waitForDeployment();

    // 设置价格源
    await priceOracleReader.setEthPriceFeed(await mockETHUSD.getAddress());

    // 部署 DAI (18 位小数)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockDAI = await MockERC20.deploy("Mock DAI", "DAI", 18);
    await mockDAI.waitForDeployment();
    await priceOracleReader.setTokenPriceFeed(await mockDAI.getAddress(), await mockDAIUSD.getAddress());

    // 部署 WBTC (8 位小数)
    mockWBTC = await MockERC20.deploy("Mock WBTC", "WBTC", 8);
    await mockWBTC.waitForDeployment();
    await priceOracleReader.setTokenPriceFeed(await mockWBTC.getAddress(), await mockWBTCUSD.getAddress());

    // 部署 NFTAuction
    const NFTAuction = await ethers.getContractFactory("NFTAuction");
    const nftAuctionImpl = await NFTAuction.deploy();
    await nftAuctionImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = nftAuctionImpl.interface.encodeFunctionData("initialize", []);
    const proxy = await ERC1967Proxy.deploy(await nftAuctionImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    nftAuction = await ethers.getContractAt("NFTAuction", await proxy.getAddress());

    // 给测试账户铸造代币
    await mockDAI.mint(bidder1.address, ethers.parseUnits("10000", 18));
    await mockDAI.mint(bidder2.address, ethers.parseUnits("10000", 18));
    await mockWBTC.mint(bidder1.address, ethers.parseUnits("10", 8));
    await mockWBTC.mint(bidder2.address, ethers.parseUnits("10", 8));

    // 部署 Mock NFT
    const MockNFT = await ethers.getContractFactory("MockNFT");
    mockNFT = await MockNFT.deploy();
    await mockNFT.waitForDeployment();
    await mockNFT.mint(owner.address);
  });

  describe("18位小数代币 (DAI)", function () {
    beforeEach(async function () {
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("应该正确计算 DAI 的 USD 价值", async function () {
      // 1000 DAI = $1000
      const bidAmount = ethers.parseUnits("1000", 18);

      await mockDAI.connect(bidder1).approve(await nftAuction.getAddress(), bidAmount);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await mockDAI.getAddress(),
          bidAmount
        )
      ).to.not.be.reverted;

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(bidAmount);
    });

    it("DAI 出价应该能与 ETH 出价正确比较", async function () {
      // 第一次出价：0.4 ETH ($1120)
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: ethers.parseEther("0.4")
      });

      // 第二次出价：1200 DAI ($1200) 应该能超越
      const daiAmount = ethers.parseUnits("1200", 18);
      await mockDAI.connect(bidder2).approve(await nftAuction.getAddress(), daiAmount);

      await expect(
        nftAuction.connect(bidder2).placeBidToken(
          0,
          await mockDAI.getAddress(),
          daiAmount
        )
      ).to.not.be.reverted;

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
    });
  });

  describe("8位小数代币 (WBTC)", function () {
    beforeEach(async function () {
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("应该正确计算 WBTC 的 USD 价值", async function () {
      // 0.05 WBTC = $2000
      const bidAmount = ethers.parseUnits("0.05", 8);

      await mockWBTC.connect(bidder1).approve(await nftAuction.getAddress(), bidAmount);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await mockWBTC.getAddress(),
          bidAmount
        )
      ).to.not.be.reverted;

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(bidAmount);
    });

    it("WBTC 出价应该能与 ETH 出价正确比较", async function () {
      // 第一次出价：0.5 ETH ($1400)
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: ethers.parseEther("0.5")
      });

      // 第二次出价：0.04 WBTC ($1600) 应该能超越
      const wbtcAmount = ethers.parseUnits("0.04", 8);
      await mockWBTC.connect(bidder2).approve(await nftAuction.getAddress(), wbtcAmount);

      await expect(
        nftAuction.connect(bidder2).placeBidToken(
          0,
          await mockWBTC.getAddress(),
          wbtcAmount
        )
      ).to.not.be.reverted;

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
    });
  });

  describe("混合精度竞价", function () {
    beforeEach(async function () {
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("DAI (18位) → WBTC (8位) 切换", async function () {
      // 第一次：1200 DAI ($1200)
      const daiAmount = ethers.parseUnits("1200", 18);
      await mockDAI.connect(bidder1).approve(await nftAuction.getAddress(), daiAmount);
      await nftAuction.connect(bidder1).placeBidToken(
        0,
        await mockDAI.getAddress(),
        daiAmount
      );

      // 验证 DAI 余额减少
      expect(await mockDAI.balanceOf(bidder1.address)).to.equal(
        ethers.parseUnits("8800", 18)
      );

      // 第二次：0.035 WBTC ($1400) 超越
      const wbtcAmount = ethers.parseUnits("0.035", 8);
      await mockWBTC.connect(bidder2).approve(await nftAuction.getAddress(), wbtcAmount);

      await nftAuction.connect(bidder2).placeBidToken(
        0,
        await mockWBTC.getAddress(),
        wbtcAmount
      );

      // 验证 DAI 已退还给 bidder1
      expect(await mockDAI.balanceOf(bidder1.address)).to.equal(
        ethers.parseUnits("10000", 18)
      );

      // 验证 WBTC 余额减少
      expect(await mockWBTC.balanceOf(bidder2.address)).to.equal(
        ethers.parseUnits("9.965", 8)
      );

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
      expect(auction.tokenAddress).to.equal(await mockWBTC.getAddress());
    });

    it("WBTC (8位) → DAI (18位) → ETH (18位) 多次切换", async function () {
      // 第一次：0.03 WBTC ($1200)
      const wbtcAmount = ethers.parseUnits("0.03", 8);
      await mockWBTC.connect(bidder1).approve(await nftAuction.getAddress(), wbtcAmount);
      await nftAuction.connect(bidder1).placeBidToken(
        0,
        await mockWBTC.getAddress(),
        wbtcAmount
      );

      // 第二次：1500 DAI ($1500)
      const daiAmount = ethers.parseUnits("1500", 18);
      await mockDAI.connect(bidder2).approve(await nftAuction.getAddress(), daiAmount);
      await nftAuction.connect(bidder2).placeBidToken(
        0,
        await mockDAI.getAddress(),
        daiAmount
      );

      // 验证 WBTC 已退还
      expect(await mockWBTC.balanceOf(bidder1.address)).to.equal(
        ethers.parseUnits("10", 8)
      );

      // 第三次：0.6 ETH ($1680)
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: ethers.parseEther("0.6")
      });

      // 验证 DAI 已退还
      expect(await mockDAI.balanceOf(bidder2.address)).to.equal(
        ethers.parseUnits("10000", 18)
      );

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.tokenAddress).to.equal(ethers.ZeroAddress);
      expect(auction.highestBid).to.equal(ethers.parseEther("0.6"));
    });
  });

  describe("精度边界测试", function () {
    beforeEach(async function () {
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("极小金额的 WBTC 出价应该被正确计算", async function () {
      // 0.025 WBTC = $1000 (刚好达到起始价)
      const wbtcAmount = ethers.parseUnits("0.025", 8);

      await mockWBTC.connect(bidder1).approve(await nftAuction.getAddress(), wbtcAmount);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await mockWBTC.getAddress(),
          wbtcAmount
        )
      ).to.not.be.reverted;
    });

    it("低于起始价的 DAI 出价应该被拒绝", async function () {
      // 999 DAI = $999 (低于 $1000)
      const daiAmount = ethers.parseUnits("999", 18);

      await mockDAI.connect(bidder1).approve(await nftAuction.getAddress(), daiAmount);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await mockDAI.getAddress(),
          daiAmount
        )
      ).to.be.revertedWithCustomError(nftAuction, "BidMustBeAtLeastStartingPrice");
    });
  });
});
