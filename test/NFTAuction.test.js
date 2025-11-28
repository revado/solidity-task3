import hre from "hardhat";
const { ethers } = hre;
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("NFT 拍卖测试", function () {
  let nftAuction;
  let priceOracleReader;
  let mockNFT;
  let mockETHUSD;
  let mockUSDCUSD;
  let mockUSDC;
  let owner, bidder1, bidder2, bidder3;
  let nftAuctionAddress;

  // 价格常量（8位小数）
  const ETH_PRICE = 280000000000n; // $2800
  const USDC_PRICE = 99977674n;     // $0.99977674
  const USDC_DECIMALS = 6;
  const START_PRICE_USD = 1000n * 10n**8n; // $1000 USD

  beforeEach(async function () {
    [owner, bidder1, bidder2, bidder3] = await ethers.getSigners();

    // 1. 部署 Mock Chainlink 价格预言机
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

    // ETH/USD 价格源
    mockETHUSD = await MockV3Aggregator.deploy(8, ETH_PRICE);
    await mockETHUSD.waitForDeployment();

    // USDC/USD 价格源
    mockUSDCUSD = await MockV3Aggregator.deploy(8, USDC_PRICE);
    await mockUSDCUSD.waitForDeployment();

    // 2. 部署 PriceOracleReader
    const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
    priceOracleReader = await PriceOracleReader.deploy();
    await priceOracleReader.waitForDeployment();

    // 3. 设置价格源
    await priceOracleReader.setEthPriceFeed(await mockETHUSD.getAddress());

    // 4. 部署 Mock USDC 代币
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", USDC_DECIMALS);
    await mockUSDC.waitForDeployment();

    // 5. 设置 USDC 价格源
    await priceOracleReader.setTokenPriceFeed(
      await mockUSDC.getAddress(),
      await mockUSDCUSD.getAddress()
    );

    // 6. 部署 NFTAuction 合约（不使用 deployments.fixture）
    const NFTAuction = await ethers.getContractFactory("NFTAuction");
    const nftAuctionImpl = await NFTAuction.deploy();
    await nftAuctionImpl.waitForDeployment();

    // 7. 部署代理
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = nftAuctionImpl.interface.encodeFunctionData("initialize", []);
    const proxy = await ERC1967Proxy.deploy(await nftAuctionImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    nftAuctionAddress = await proxy.getAddress();
    nftAuction = await ethers.getContractAt("NFTAuction", nftAuctionAddress);

    // 8. 给测试账户铸造 USDC
    await mockUSDC.mint(bidder1.address, ethers.parseUnits("10000", USDC_DECIMALS));
    await mockUSDC.mint(bidder2.address, ethers.parseUnits("10000", USDC_DECIMALS));
    await mockUSDC.mint(bidder3.address, ethers.parseUnits("10000", USDC_DECIMALS));

    // 9. 部署 Mock NFT 并铸造
    const MockNFT = await ethers.getContractFactory("MockNFT");
    mockNFT = await MockNFT.deploy();
    await mockNFT.waitForDeployment();
    await mockNFT.mint(owner.address);
  });

  describe("价格源设置和验证", function () {
    it("应该正确设置 ETH 价格源", async function () {
      const price = await priceOracleReader.getEthPrice();
      expect(price).to.equal(ETH_PRICE);
    });

    it("应该正确设置 USDC 价格源", async function () {
      const price = await priceOracleReader.getTokenPrice(await mockUSDC.getAddress());
      expect(price).to.equal(USDC_PRICE);
    });

    it("非 owner 不能设置价格源", async function () {
      await expect(
        priceOracleReader.connect(bidder1).setEthPriceFeed(await mockETHUSD.getAddress())
      ).to.be.revertedWithCustomError(priceOracleReader, "OwnableUnauthorizedAccount");
    });

    it("不能设置零地址作为价格源", async function () {
      await expect(
        priceOracleReader.setEthPriceFeed(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(priceOracleReader, "InvalidEthPriceFeed");
    });

    it("查询未设置的代币价格源应该失败", async function () {
      const randomToken = "0x1234567890123456789012345678901234567890";
      await expect(
        priceOracleReader.getTokenPrice(randomToken)
      ).to.be.reverted;
    });
  });

  describe("创建拍卖", function () {
    it("应该成功创建拍卖", async function () {
      await mockNFT.approve(nftAuctionAddress, 0);

      await expect(
        nftAuction.createAuction(
          await priceOracleReader.getAddress(),
          await mockNFT.getAddress(),
          0,
          START_PRICE_USD,
          100000 // 100 seconds
        )
      ).to.emit(nftAuction, "AuctionCreated")
        .withArgs(0, owner.address, START_PRICE_USD);

      const auction = await nftAuction.auctions(0);
      expect(auction.seller).to.equal(owner.address);
      expect(auction.startPrice).to.equal(START_PRICE_USD);
    });

    it("非 NFT 所有者不能创建拍卖", async function () {
      await mockNFT.approve(nftAuctionAddress, 0);

      await expect(
        nftAuction.connect(bidder1).createAuction(
          await priceOracleReader.getAddress(),
          await mockNFT.getAddress(),
          0,
          START_PRICE_USD,
          100000
        )
      ).to.be.revertedWithCustomError(nftAuction, "OnlyNFTOwnerCanCreateAuction");
    });

    it("起始价格必须大于0", async function () {
      await mockNFT.approve(nftAuctionAddress, 0);

      await expect(
        nftAuction.createAuction(
          await priceOracleReader.getAddress(),
          await mockNFT.getAddress(),
          0,
          0, // 无效的起始价
          100000
        )
      ).to.be.revertedWithCustomError(nftAuction, "StartPriceMustBeGreaterThanZero");
    });
  });

  describe("ETH 竞价", function () {
    beforeEach(async function () {
      await mockNFT.approve(nftAuctionAddress, 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("应该接受有效的 ETH 竞价", async function () {
      // $1000 / $2800 per ETH = 0.357 ETH
      const bidAmount = ethers.parseEther("0.4"); // 略高于最低要求

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, {
          value: bidAmount
        })
      ).to.not.be.reverted;

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(bidAmount);
    });

    it("ETH 出价必须高于起始价", async function () {
      // 出价太低
      const lowBid = ethers.parseEther("0.1");

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, {
          value: lowBid
        })
      ).to.be.revertedWithCustomError(nftAuction, "BidMustBeAtLeastStartingPrice");
    });

    it("后续出价必须高于当前最高价", async function () {
      const firstBid = ethers.parseEther("0.5");
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: firstBid
      });

      // 出价相同或更低应该失败
      await expect(
        nftAuction.connect(bidder2).placeBidETH(0, {
          value: firstBid
        })
      ).to.be.revertedWithCustomError(nftAuction, "BidMustBeHigherThanCurrentHighestBid");
    });

    it("应该退还前一个出价者的资金", async function () {
      const firstBid = ethers.parseEther("0.5");
      const secondBid = ethers.parseEther("0.6");

      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: firstBid
      });

      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);

      await nftAuction.connect(bidder2).placeBidETH(0, {
        value: secondBid
      });

      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      expect(bidder1BalanceAfter).to.equal(bidder1BalanceBefore + firstBid);
    });

    it("拍卖结束后不能出价", async function () {
      await time.increase(100001); // 超过拍卖时间

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, {
          value: ethers.parseEther("1.0")
        })
      ).to.be.revertedWithCustomError(nftAuction, "AuctionExpired");
    });
  });

  describe("ERC20 (USDC) 竞价", function () {
    beforeEach(async function () {
      await mockNFT.approve(nftAuctionAddress, 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("应该接受有效的 USDC 竞价", async function () {
      // $1000 需要约 1001 USDC（因为 USDC ≈ $0.9998）
      const bidAmount = ethers.parseUnits("1100", USDC_DECIMALS);

      await mockUSDC.connect(bidder1).approve(nftAuctionAddress, bidAmount);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await mockUSDC.getAddress(),
          bidAmount
        )
      ).to.not.be.reverted;

      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.tokenAddress).to.equal(await mockUSDC.getAddress());
    });

    it("USDC 竞价需要先授权", async function () {
      const bidAmount = ethers.parseUnits("1100", USDC_DECIMALS);

      // 没有授权直接竞价
      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await mockUSDC.getAddress(),
          bidAmount
        )
      ).to.be.reverted; // ERC20 insufficient allowance
    });
  });

  describe("混合货币竞价 (ETH → USDC)", function () {
    beforeEach(async function () {
      await mockNFT.approve(nftAuctionAddress, 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("ETH 出价后可以用 USDC 覆盖", async function () {
      // 第一次出价：0.5 ETH ($1400)
      const ethBid = ethers.parseEther("0.5");
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: ethBid
      });

      // 第二次出价：1500 USDC ($1500)
      const usdcBid = ethers.parseUnits("1500", USDC_DECIMALS);
      await mockUSDC.connect(bidder2).approve(nftAuctionAddress, usdcBid);

      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);

      await nftAuction.connect(bidder2).placeBidToken(
        0,
        await mockUSDC.getAddress(),
        usdcBid
      );

      // 验证 ETH 已退还给 bidder1
      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      expect(bidder1BalanceAfter).to.equal(bidder1BalanceBefore + ethBid);

      // 验证新的最高出价
      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
      expect(auction.tokenAddress).to.equal(await mockUSDC.getAddress());
    });

    it("USDC 出价后可以用 ETH 覆盖", async function () {
      // 第一次出价：1200 USDC ($1200)
      const usdcBid = ethers.parseUnits("1200", USDC_DECIMALS);
      await mockUSDC.connect(bidder1).approve(nftAuctionAddress, usdcBid);
      await nftAuction.connect(bidder1).placeBidToken(
        0,
        await mockUSDC.getAddress(),
        usdcBid
      );

      // 第二次出价：0.5 ETH ($1400)
      const ethBid = ethers.parseEther("0.5");

      const bidder1USDCBefore = await mockUSDC.balanceOf(bidder1.address);

      await nftAuction.connect(bidder2).placeBidETH(0, {
        value: ethBid
      });

      // 验证 USDC 已退还给 bidder1
      const bidder1USDCAfter = await mockUSDC.balanceOf(bidder1.address);
      expect(bidder1USDCAfter).to.equal(bidder1USDCBefore + usdcBid);

      // 验证新的最高出价
      const auction = await nftAuction.auctions(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
      expect(auction.tokenAddress).to.equal(ethers.ZeroAddress);
    });
  });

  describe("拍卖结束", function () {
    beforeEach(async function () {
      await mockNFT.approve(nftAuctionAddress, 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("ETH 竞价成功后，卖家应该收到 ETH", async function () {
      const bidAmount = ethers.parseEther("0.5");
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: bidAmount
      });

      await time.increase(100001);

      const sellerBalanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await nftAuction.endAuction(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const sellerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore + bidAmount - gasUsed);
    });

    it("USDC 竞价成功后，卖家应该收到 USDC", async function () {
      const bidAmount = ethers.parseUnits("1200", USDC_DECIMALS);
      await mockUSDC.connect(bidder1).approve(nftAuctionAddress, bidAmount);
      await nftAuction.connect(bidder1).placeBidToken(
        0,
        await mockUSDC.getAddress(),
        bidAmount
      );

      await time.increase(100001);

      const sellerUSDCBefore = await mockUSDC.balanceOf(owner.address);

      await nftAuction.endAuction(0);

      const sellerUSDCAfter = await mockUSDC.balanceOf(owner.address);
      expect(sellerUSDCAfter).to.equal(sellerUSDCBefore + bidAmount);
    });

    it("拍卖成功后，NFT 应该转移给最高出价者", async function () {
      const bidAmount = ethers.parseEther("0.5");
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: bidAmount
      });

      await time.increase(100001);
      await nftAuction.endAuction(0);

      expect(await mockNFT.ownerOf(0)).to.equal(bidder1.address);
    });

    it("无人出价时，NFT 应该退还给卖家", async function () {
      await time.increase(100001);
      await nftAuction.endAuction(0);

      expect(await mockNFT.ownerOf(0)).to.equal(owner.address);
    });

    it("拍卖未结束不能调用 endAuction", async function () {
      await expect(
        nftAuction.endAuction(0)
      ).to.be.revertedWithCustomError(nftAuction, "AuctionHasNotEndedYet");
    });

    it("非卖家或管理员不能结束拍卖", async function () {
      await time.increase(100001);

      await expect(
        nftAuction.connect(bidder1).endAuction(0)
      ).to.be.revertedWithCustomError(nftAuction, "OnlySellerOrAdminCanEndAuction");
    });

    it("不能重复结束拍卖", async function () {
      await time.increase(100001);
      await nftAuction.endAuction(0);

      await expect(
        nftAuction.endAuction(0)
      ).to.be.revertedWithCustomError(nftAuction, "AuctionAlreadyEnded");
    });
  });

  describe("价格数据验证", function () {
    it("负价格应该被拒绝", async function () {
      await mockNFT.approve(nftAuctionAddress, 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );

      // 设置负价格
      await mockETHUSD.updateAnswer(-100);

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, {
          value: ethers.parseEther("0.5")
        })
      ).to.be.revertedWithCustomError(priceOracleReader, "InvalidPrice");
    });
  });

  describe("安全性测试", function () {
    beforeEach(async function () {
      await mockNFT.approve(nftAuctionAddress, 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        100000
      );
    });

    it("不能直接向合约发送 ETH", async function () {
      await expect(
        bidder1.sendTransaction({
          to: nftAuctionAddress,
          value: ethers.parseEther("1.0")
        })
      ).to.be.revertedWith("Please use placeBidETH() or placeBidToken() to participate in auction");
    });

    it("CEI 模式：状态先更新再退款", async function () {
      // 第一次出价
      await nftAuction.connect(bidder1).placeBidETH(0, {
        value: ethers.parseEther("0.5")
      });

      // 第二次出价应该成功（即使退款在后面）
      await expect(
        nftAuction.connect(bidder2).placeBidETH(0, {
          value: ethers.parseEther("0.6")
        })
      ).to.not.be.reverted;
    });
  });
});
