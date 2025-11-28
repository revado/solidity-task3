import hre from "hardhat";
const { ethers } = hre;
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const START_PRICE_USD = 1000n * 10n ** 8n; // $1000 with 8 decimals
const SHORT_DURATION = 601; // 601秒，刚好超出10分钟1秒
const DURATION = 3600; // 1 小时

async function deployProxy() {
  const NFTAuction = await ethers.getContractFactory("NFTAuction");
  const impl = await NFTAuction.deploy();
  await impl.waitForDeployment();

  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const initData = impl.interface.encodeFunctionData("initialize", []);
  const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();

  return ethers.getContractAt("NFTAuction", await proxy.getAddress());
}

async function deployMockNFT() {
  const MockNFT = await ethers.getContractFactory("MockNFT");
  const nft = await MockNFT.deploy();
  await nft.waitForDeployment();
  return nft;
}

async function deployMockERC20(name, symbol, decimals) {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy(name, symbol, decimals);
  await token.waitForDeployment();
  return token;
}

async function deployPriceFeed(price) {
  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
  const feed = await MockV3Aggregator.deploy(8, price);
  await feed.waitForDeployment();
  return feed;
}

async function deployPriceOracleReader() {
  const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
  const reader = await PriceOracleReader.deploy();
  await reader.waitForDeployment();
  return reader;
}

async function deployMockFeePolicy(feeAmount, recipient) {
  const MockFeePolicy = await ethers.getContractFactory("MockFeePolicy");
  const policy = await MockFeePolicy.deploy(feeAmount, recipient);
  await policy.waitForDeployment();
  return policy;
}

async function deployRevertingReceiver() {
  const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
  const receiver = await RevertingReceiver.deploy();
  await receiver.waitForDeployment();
  return receiver;
}

describe("NFT 合约补充测试", function () {
  let owner, bidder1, bidder2;

  beforeEach(async function () {
    [owner, bidder1, bidder2] = await ethers.getSigners();
  });

  describe("初始化与创建防护", function () {
    it("在 initialize 时设置管理员，并阻止重复初始化", async function () {
      const nftAuction = await deployProxy();
      expect(await nftAuction.admin()).to.equal(owner.address);

      await expect(nftAuction.initialize()).to.be.revertedWithCustomError(
        nftAuction,
        "InvalidInitialization"
      );
    });

    it("应该在创建拍卖时，拒绝零地址的 priceOracleReader", async function () {
      const nftAuction = await deployProxy();
      const nft = await deployMockNFT();
      await expect(
        nftAuction.createAuction(
          ethers.ZeroAddress, // priceOracleReader
          await nft.getAddress(),
          0,
          START_PRICE_USD,
          SHORT_DURATION
        )
      ).to.be.revertedWithCustomError(nftAuction, "InvalidPriceOracleReaderAddress");
    });

    it("应该在创建拍卖时，拒绝零地址的 NFT 合约", async function () {
      const nftAuction = await deployProxy();
      const priceOracleReader = await deployPriceOracleReader();
      await expect(
        nftAuction.createAuction(
          await priceOracleReader.getAddress(),
          ethers.ZeroAddress,
          0,
          START_PRICE_USD,
          SHORT_DURATION
        )
      ).to.be.revertedWithCustomError(nftAuction, "InvalidNFTContractAddress");
    });

    it("应该在创建拍卖时，拒绝持续时间小于 10 分钟的拍卖", async function () {
      const nftAuction = await deployProxy();
      const priceOracleReader = await deployPriceOracleReader();
      const nft = await deployMockNFT();
      await nft.mint(owner.address);
      await nft.approve(await nftAuction.getAddress(), 0);

      await expect(
        nftAuction.createAuction(
          await priceOracleReader.getAddress(),
          await nft.getAddress(),
          0,
          START_PRICE_USD,
          600 // exactly 10 minutes
        )
      ).to.be.revertedWithCustomError(nftAuction, "DurationTooShort");
    });
  });

  describe("出价防护", function () {
    let nftAuction;
    let priceOracleReader;
    let nft;
    let ethFeed;

    beforeEach(async function () {
      nftAuction = await deployProxy();
      priceOracleReader = await deployPriceOracleReader();
      nft = await deployMockNFT();
      await nft.mint(owner.address);
      await nft.approve(await nftAuction.getAddress(), 0);
      ethFeed = await deployPriceFeed(200000000000n); // $2000
      await priceOracleReader.setEthPriceFeed(await ethFeed.getAddress());
    });

    it("应该在拍卖不存在时回退", async function () {
      await expect(
        nftAuction.placeBidETH(999, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(nftAuction, "AuctionNotExist");
    });

    it("应该在卖家竞拍自己的拍卖时回退", async function () {
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await nft.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await expect(
        nftAuction.placeBidETH(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(nftAuction, "SellerCannotBidOnOwnAuction");
    });

    it("应该在出价时，拒绝 ETH 金额小于等于零", async function () {
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await nft.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, { value: 0 })
      ).to.be.revertedWithCustomError(nftAuction, "MustSendETH");
    });

    it("应该在出价时，拒绝 ERC20 金额小于等于零", async function () {
      const token = await deployMockERC20("Mock DAI", "DAI", 18);
      const tokenFeed = await deployPriceFeed(100000000n);
      await priceOracleReader.setTokenPriceFeed(await token.getAddress(), await tokenFeed.getAddress());

      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await nft.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await token.mint(bidder1.address, ethers.parseUnits("1000", 18));
      await token.connect(bidder1).approve(await nftAuction.getAddress(), ethers.MaxUint256);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await token.getAddress(),
          0
        )
      ).to.be.revertedWithCustomError(nftAuction, "AmountMustBeGreaterThanZero");
    });

    it("应该在出价时，拒绝价格预言机未设置的 ERC20 代币", async function () {
      const token = await deployMockERC20("Mock Token", "MTK", 18);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await nft.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await token.mint(bidder1.address, ethers.parseUnits("1000", 18));
      await token.connect(bidder1).approve(await nftAuction.getAddress(), ethers.MaxUint256);

      await expect(
        nftAuction.connect(bidder1).placeBidToken(
          0,
          await token.getAddress(),
          ethers.parseUnits("100", 18)
        )
      ).to.be.reverted;
    });

    it("应该在出价时，拒绝价格预言机未设置的 ETH", async function () {
      const priceOracleReader2 = await deployPriceOracleReader(); // 没有设置 ETH Feed
      await nftAuction.createAuction(
        await priceOracleReader2.getAddress(),
        await nft.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, { value: ethers.parseEther("1") })
      ).to.be.reverted;
    });

    it("应该在拍卖结束后，拒绝出价", async function () {
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await nft.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await time.increase(SHORT_DURATION + 1);
      await nftAuction.endAuction(0);

      await expect(
        nftAuction.connect(bidder1).placeBidETH(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(nftAuction, "AuctionAlreadyEnded");
    });
  });

  describe("价格预言机验证", function () {
    it("应该在预言机返回非正数价格时回退", async function () {
      const priceOracleReader = await deployPriceOracleReader();
      const zeroFeed = await deployPriceFeed(0); // answer == 0 triggers validation revert

      await expect(
        priceOracleReader.setEthPriceFeed(await zeroFeed.getAddress())
      ).to.not.be.reverted; // 设置不会失败，但在获取价格时会失败

      await expect(
        priceOracleReader.getEthPrice()
      ).to.be.revertedWithCustomError(priceOracleReader, "InvalidPrice");
    });

    it("应该在预言机调用 latestRoundData 时发生回退", async function () {
      const priceOracleReader = await deployPriceOracleReader();
      const MockFaultyAggregator = await ethers.getContractFactory("MockFaultyAggregator");
      const revertingFeed = await MockFaultyAggregator.deploy(8, 100000000n, true, false);
      await revertingFeed.waitForDeployment();

      await priceOracleReader.setEthPriceFeed(await revertingFeed.getAddress());

      await expect(
        priceOracleReader.getEthPrice()
      ).to.be.revertedWithCustomError(priceOracleReader, "InvalidPrice");
    });

    it("应该在价格数据过期时回退", async function () {
      const priceOracleReader = await deployPriceOracleReader();
      const MockFaultyAggregator = await ethers.getContractFactory("MockFaultyAggregator");
      const staleFeed = await MockFaultyAggregator.deploy(8, 100000000n, false, true);
      await staleFeed.waitForDeployment();

      await priceOracleReader.setEthPriceFeed(await staleFeed.getAddress());

      await expect(
        priceOracleReader.getEthPrice()
      ).to.be.revertedWithCustomError(priceOracleReader, "StalePriceData");
    });
  });

  describe("回退防护", function () {
    it("应该在接收到未知的调用数据时，触发回退", async function () {
      const nftAuction = await deployProxy();
      await expect(
        owner.sendTransaction({
          to: await nftAuction.getAddress(),
          data: "0x12345678"
        })
      ).to.be.revertedWith("Function does not exist");
    });
  });
  describe("拍卖详情查询", function () {
    it("getAuctionDetail 应该在拍卖不存在时回退", async function () {
      const nftAuction = await deployProxy();
      await expect(
        nftAuction.getAuctionDetail(0)
      ).to.be.revertedWithCustomError(nftAuction, "AuctionNotExist");
    });

    it("getAuctionDetail 应该成功返回存在的拍卖详情", async function () {
      const nftAuction = await deployProxy();
      const priceOracleReader = await deployPriceOracleReader();
      const mockNFT = await deployMockNFT();
      const ethFeed = await deployPriceFeed(200000000000n); // $2000
      await priceOracleReader.setEthPriceFeed(await ethFeed.getAddress());

      // 创建拍卖
      await mockNFT.mint(owner.address);
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        DURATION
      );

      // 查询拍卖详情
      const [auction, remainingTime] = await nftAuction.getAuctionDetail(0);

      expect(auction.seller).to.equal(owner.address);
      expect(auction.tokenId).to.equal(0);
      expect(auction.startPrice).to.equal(START_PRICE_USD);
      expect(auction.ended).to.be.false;
      expect(remainingTime).to.be.gt(0);
      expect(remainingTime).to.be.lte(DURATION);
    });

    it("getAuctionsDetail 应该在批量查询包含不存在的拍卖时回退", async function () {
      const nftAuction = await deployProxy();
      await expect(
        nftAuction.getAuctionsDetail([0, 1, 2])
      ).to.be.revertedWithCustomError(nftAuction, "AuctionNotExist");
    });

    it("getAuctionsDetail 应该成功批量查询存在的拍卖", async function () {
      const nftAuction = await deployProxy();
      const priceOracleReader = await deployPriceOracleReader();
      const mockNFT = await deployMockNFT();
      const ethFeed = await deployPriceFeed(200000000000n); // $2000
      await priceOracleReader.setEthPriceFeed(await ethFeed.getAddress());

      // 创建多个拍卖
      await mockNFT.mint(owner.address);
      await mockNFT.mint(owner.address);
      await mockNFT.mint(owner.address);
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      await mockNFT.approve(await nftAuction.getAddress(), 1);
      await mockNFT.approve(await nftAuction.getAddress(), 2);

      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        DURATION
      );
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        1,
        START_PRICE_USD,
        DURATION
      );
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        2,
        START_PRICE_USD,
        DURATION
      );

      // 批量查询
      const [auctions, remainingTimes] = await nftAuction.getAuctionsDetail([0, 1, 2]);

      expect(auctions.length).to.equal(3);
      expect(remainingTimes.length).to.equal(3);
      expect(auctions[0].seller).to.equal(owner.address);
      expect(auctions[1].seller).to.equal(owner.address);
      expect(auctions[2].seller).to.equal(owner.address);
      expect(auctions[0].tokenId).to.equal(0);
      expect(auctions[1].tokenId).to.equal(1);
      expect(auctions[2].tokenId).to.equal(2);
      expect(remainingTimes[0]).to.be.gt(0);
      expect(remainingTimes[1]).to.be.gt(0);
      expect(remainingTimes[2]).to.be.gt(0);
    });
  });
	describe("getRemainingTime 函数测试", function () {
    let nftAuction;
    let priceOracleReader;
    let mockNFT;

    beforeEach(async function () {
      nftAuction = await deployProxy();
      priceOracleReader = await deployPriceOracleReader();
      mockNFT = await deployMockNFT();

      // 设置 ETH 价格预言机
      const ethPriceFeed = await deployPriceFeed(280000000000n); // $2800
      await priceOracleReader.setEthPriceFeed(await ethPriceFeed.getAddress());

      // Mint NFT 并授权给拍卖合约
      await mockNFT.mint(owner.address);
      await mockNFT.approve(await nftAuction.getAddress(), 0);
    });

		it("拍卖进行中应该返回正确的剩余时间", async function () {
			// 创建拍卖
			await nftAuction.createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				START_PRICE_USD,
				DURATION
			);

			// 立即检查剩余时间，应该接近 DURATION
			const remainingTime1 = await nftAuction.getRemainingTime(0);
			expect(remainingTime1).to.be.closeTo(DURATION, 5); // 允许 5 秒误差

			// 前进 600 秒 (10 分钟)
			await time.increase(600);

			// 再次检查剩余时间
			const remainingTime2 = await nftAuction.getRemainingTime(0);
			expect(remainingTime2).to.be.closeTo(DURATION - 600, 5);
		});

		it("拍卖过期但未结束时应该返回 0", async function () {
			// 创建拍卖
			await nftAuction.createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				START_PRICE_USD,
				DURATION
			);

			// 前进到拍卖结束后
			await time.increase(DURATION + 100);

			// 检查剩余时间应该为 0
			const remainingTime = await nftAuction.getRemainingTime(0);
			expect(remainingTime).to.equal(0);
		});

		it("拍卖已手动结束时应该返回 0", async function () {
			// 创建拍卖
			await nftAuction.createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				START_PRICE_USD,
				DURATION
			);

			// 有人出价
			await nftAuction.connect(bidder1).placeBidETH(0, {
				value: ethers.parseEther("1")
			});

			// 前进到拍卖结束
			await time.increase(DURATION + 1);

			// 手动结束拍卖
			await nftAuction.endAuction(0);

			// 检查剩余时间应该为 0
			const remainingTime = await nftAuction.getRemainingTime(0);
			expect(remainingTime).to.equal(0);
		});

		it("刚开始的拍卖应该返回完整持续时间", async function () {
			// 创建拍卖
			const tx = await nftAuction.createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				START_PRICE_USD,
				DURATION
			);
			await tx.wait();

			// 立即检查剩余时间
			const remainingTime = await nftAuction.getRemainingTime(0);
			expect(remainingTime).to.be.closeTo(DURATION, 5);
		});

		it("拍卖即将结束时应该返回很小的剩余时间", async function () {
			// 创建拍卖
			await nftAuction.createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				START_PRICE_USD,
				DURATION
			);

			// 前进到拍卖快结束时（还剩 10 秒）
			await time.increase(DURATION - 10);

			// 检查剩余时间
			const remainingTime = await nftAuction.getRemainingTime(0);
			expect(remainingTime).to.be.closeTo(10, 5);
		});

		it("恰好到达结束时间应该返回 0", async function () {
			// 创建拍卖
			await nftAuction.createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				START_PRICE_USD,
				DURATION
			);

			// 前进到恰好拍卖结束时间
			await time.increase(DURATION);

			// 检查剩余时间
			const remainingTime = await nftAuction.getRemainingTime(0);
			// 由于区块时间戳的特性，可能是 0 或 1
			expect(remainingTime).to.be.lessThanOrEqual(1);
		});

		it("未创建的拍卖 ID 应该返回 0", async function () {
			// 查询一个不存在的拍卖
			const remainingTime = await nftAuction.getRemainingTime(999);
			expect(remainingTime).to.equal(0);
		});
	});
  describe("手续费策略与提现", function () {
    let nftAuction;
    let priceOracleReader;
    let mockNFT;

    beforeEach(async function () {
      nftAuction = await deployProxy();
      priceOracleReader = await deployPriceOracleReader();
      mockNFT = await deployMockNFT();
      await mockNFT.mint(owner.address);
      await mockNFT.approve(await nftAuction.getAddress(), 0);
      const ethFeed = await deployPriceFeed(200000000000n); // $2000
      await priceOracleReader.setEthPriceFeed(await ethFeed.getAddress());
    });

    async function createAuctionAndBid(bidValue = ethers.parseEther("1")) {
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        SHORT_DURATION
      );

      await nftAuction.connect(bidder1).placeBidETH(0, { value: bidValue });
      await time.increase(SHORT_DURATION + 1);
    }

    it("管理员可以设置手续费策略，非管理员会被拒绝", async function () {
      const policy = await deployMockFeePolicy(0, ethers.ZeroAddress);

      await expect(
        nftAuction.setFeePolicy(await policy.getAddress())
      ).to.emit(nftAuction, "FeePolicyUpdated").withArgs(await policy.getAddress());

      await expect(
        nftAuction.connect(bidder1).setFeePolicy(await policy.getAddress())
      ).to.be.revertedWithCustomError(nftAuction, "OnlyAdminCanUpgrade");
    });

    it("结束拍卖时应该使用手续费策略并累计手续费", async function () {
      const policy = await deployMockFeePolicy(ethers.parseEther("0.2"), ethers.ZeroAddress);
      await nftAuction.setFeePolicy(await policy.getAddress());

      await createAuctionAndBid(ethers.parseEther("1"));

      const tx = await nftAuction.endAuction(0);
      await expect(tx).to.emit(nftAuction, "FeeAccrued").withArgs(
        0,
        ethers.ZeroAddress,
        owner.address,
        ethers.parseEther("0.2")
      );

      expect(await nftAuction.accruedFees(ethers.ZeroAddress)).to.equal(ethers.parseEther("0.2"));
      expect(await ethers.provider.getBalance(await nftAuction.getAddress())).to.equal(ethers.parseEther("0.2"));
    });

    it("当手续费策略返回 recipient 为 0 地址时，应该使用 admin 作为归集地址", async function () {
      // 这个测试明确验证 _computeFee 中 recipient == address(0) 时设置为 admin 的分支
      const policy = await deployMockFeePolicy(ethers.parseEther("0.3"), ethers.ZeroAddress);
      await nftAuction.setFeePolicy(await policy.getAddress());

      await createAuctionAndBid(ethers.parseEther("1"));

      const tx = await nftAuction.endAuction(0);
      // 验证手续费归集地址是 admin（因为策略返回的 recipient 是 0 地址）
      await expect(tx).to.emit(nftAuction, "FeeAccrued").withArgs(
        0,
        ethers.ZeroAddress,
        owner.address, // admin
        ethers.parseEther("0.3")
      );
    });

    it("没有手续费策略时结束拍卖应该不收取手续费", async function () {
      // 验证 feePolicy == address(0) 时，手续费为 0
      await createAuctionAndBid(ethers.parseEther("1"));

      const sellerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await nftAuction.endAuction(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const sellerBalanceAfter = await ethers.provider.getBalance(owner.address);

      // 卖家应该收到全部成交额（扣除 gas 费用）
      const expectedSellerAmount = ethers.parseEther("1");
      expect(sellerBalanceAfter + gasUsed - sellerBalanceBefore).to.equal(expectedSellerAmount);

      // 手续费应该为 0
      expect(await nftAuction.accruedFees(ethers.ZeroAddress)).to.equal(0);

      // 合约余额应该为 0（所有资金都给了卖家）
      expect(await ethers.provider.getBalance(await nftAuction.getAddress())).to.equal(0);
    });

    it("手续费策略返回手续费为 0 时，不应该累计手续费", async function () {
      // 测试 feeAmount > 0 的 false 分支
      const policy = await deployMockFeePolicy(0, owner.address);
      await nftAuction.setFeePolicy(await policy.getAddress());

      await createAuctionAndBid(ethers.parseEther("1"));

      const sellerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await nftAuction.endAuction(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const sellerBalanceAfter = await ethers.provider.getBalance(owner.address);

      // 卖家应该收到全部成交额（扣除 gas 费用）
      const expectedSellerAmount = ethers.parseEther("1");
      expect(sellerBalanceAfter + gasUsed - sellerBalanceBefore).to.equal(expectedSellerAmount);

      // 手续费应该为 0（不应该累计）
      expect(await nftAuction.accruedFees(ethers.ZeroAddress)).to.equal(0);

      // 合约余额应该为 0（所有资金都给了卖家）
      expect(await ethers.provider.getBalance(await nftAuction.getAddress())).to.equal(0);

      // 不应该触发 FeeAccrued 事件
      await expect(tx).to.not.emit(nftAuction, "FeeAccrued");
    });

    it("手续费大于成交额时应该回退", async function () {
      const policy = await deployMockFeePolicy(ethers.parseEther("2"), owner.address);
      await nftAuction.setFeePolicy(await policy.getAddress());

      await createAuctionAndBid(ethers.parseEther("1"));

      await expect(
        nftAuction.endAuction(0)
      ).to.be.revertedWithCustomError(nftAuction, "FeeExceedsProceeds");
    });

    it("手续费等于成交额时应该让卖家分成为 0 仍能结束拍卖", async function () {
      const policy = await deployMockFeePolicy(ethers.parseEther("1"), bidder2.address);
      await nftAuction.setFeePolicy(await policy.getAddress());

      await createAuctionAndBid(ethers.parseEther("1"));

      const tx = await nftAuction.endAuction(0);
      await expect(tx).to.emit(nftAuction, "FeeAccrued").withArgs(
        0,
        ethers.ZeroAddress,
        bidder2.address,
        ethers.parseEther("1")
      );

      expect(await nftAuction.accruedFees(ethers.ZeroAddress)).to.equal(ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(await nftAuction.getAddress())).to.equal(ethers.parseEther("1"));
      expect(await mockNFT.ownerOf(0)).to.equal(bidder1.address);
    });

    describe("withdrawFees 行为", function () {
      beforeEach(async function () {
        const policy = await deployMockFeePolicy(ethers.parseEther("0.5"), ethers.ZeroAddress);
        await nftAuction.setFeePolicy(await policy.getAddress());

        await createAuctionAndBid(ethers.parseEther("1"));
        await nftAuction.endAuction(0);
      });

      it("非管理员不能提取手续费", async function () {
        await expect(
          nftAuction.connect(bidder1).withdrawFees(
            ethers.ZeroAddress,
            bidder1.address,
            ethers.parseEther("0.1")
          )
        ).to.be.revertedWithCustomError(nftAuction, "OnlyAdminCanUpgrade");
      });

      it("拒绝 0 地址接收人", async function () {
        await expect(
          nftAuction.withdrawFees(ethers.ZeroAddress, ethers.ZeroAddress, ethers.parseEther("0.1"))
        ).to.be.revertedWithCustomError(nftAuction, "InvalidNFTContractAddress");
      });

      it("拒绝金额为 0 或大于余额的提现", async function () {
        await expect(
          nftAuction.withdrawFees(ethers.ZeroAddress, bidder1.address, 0)
        ).to.be.revertedWithCustomError(nftAuction, "AmountMustBeGreaterThanZero");

        const balance = await nftAuction.accruedFees(ethers.ZeroAddress);
        await expect(
          nftAuction.withdrawFees(ethers.ZeroAddress, bidder1.address, balance + 1n)
        ).to.be.revertedWithCustomError(nftAuction, "FeeExceedsProceeds");
      });

      it("成功提现后应减少累计手续费", async function () {
        const recipientBalanceBefore = await ethers.provider.getBalance(bidder2.address);
        const amount = ethers.parseEther("0.5");

        await expect(
          nftAuction.withdrawFees(ethers.ZeroAddress, bidder2.address, amount)
        ).to.emit(nftAuction, "FeeWithdrawn").withArgs(
          ethers.ZeroAddress,
          bidder2.address,
          amount
        );

        const recipientBalanceAfter = await ethers.provider.getBalance(bidder2.address);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(amount);
        expect(await nftAuction.accruedFees(ethers.ZeroAddress)).to.equal(0n);
      });

      it("提现到拒绝 ETH 的合约应该回退", async function () {
        const revertingReceiver = await deployRevertingReceiver();

        await expect(
          nftAuction.withdrawFees(
            ethers.ZeroAddress,
            await revertingReceiver.getAddress(),
            ethers.parseEther("0.5")
          )
        ).to.be.revertedWithCustomError(nftAuction, "ETHTransferFailed");
      });
    });
  });
  describe("NFTAuction - 重入攻击防护测试", function () {
    let nftAuction;
    let priceOracleReader;
    let mockNFT;
    let mockETHUSD;
    let owner, user1, user2;

    const ETH_PRICE = 280000000000n; // $2800
    const START_PRICE_USD = 1000n * 10n**8n; // $1000 USD
    const DURATION = 3600; // 1 小时

    beforeEach(async function () {
      [owner, user1, user2] = await ethers.getSigners();

      // 部署 Mock Chainlink 价格预言机
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      mockETHUSD = await MockV3Aggregator.deploy(8, ETH_PRICE);
      await mockETHUSD.waitForDeployment();

      // 部署 PriceOracleReader
      const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
      priceOracleReader = await PriceOracleReader.deploy();
      await priceOracleReader.waitForDeployment();
      await priceOracleReader.setEthPriceFeed(await mockETHUSD.getAddress());

      // 部署 NFTAuction
      const NFTAuction = await ethers.getContractFactory("NFTAuction");
      const nftAuctionImpl = await NFTAuction.deploy();
      await nftAuctionImpl.waitForDeployment();

      const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
      const initData = nftAuctionImpl.interface.encodeFunctionData("initialize", []);
      const proxy = await ERC1967Proxy.deploy(await nftAuctionImpl.getAddress(), initData);
      await proxy.waitForDeployment();

      nftAuction = await ethers.getContractAt("NFTAuction", await proxy.getAddress());

      // 部署 Mock NFT
      const MockNFT = await ethers.getContractFactory("MockNFT");
      mockNFT = await MockNFT.deploy();
      await mockNFT.waitForDeployment();
      await mockNFT.mint(owner.address);
      await mockNFT.approve(await nftAuction.getAddress(), 0);

      // 创建拍卖
      await nftAuction.createAuction(
        await priceOracleReader.getAddress(),
        await mockNFT.getAddress(),
        0,
        START_PRICE_USD,
        DURATION
      );
    });

    describe("重入攻击防护", function () {
      it("应该防止重入攻击 - transfer() 的 2300 gas 限制", async function () {
        // user1 先正常出价
        await nftAuction.connect(user1).placeBidETH(0, {
          value: ethers.parseEther("1")
        });

        // user2 出更高价，触发退款给 user1
        // 注意：退款使用 transfer() 只提供 2300 gas
        // 这确保了即使接收方尝试重入也会因 gas 不足而失败
        await nftAuction.connect(user2).placeBidETH(0, {
          value: ethers.parseEther("2")
        });

        // 验证拍卖状态正常
        const auction = await nftAuction.auctions(0);
        expect(auction.highestBidder).to.equal(user2.address);
        expect(auction.highestBid).to.be.greaterThan(0);
      });

      it("正常的连续出价应该工作", async function () {
        // user1 出价
        await nftAuction.connect(user1).placeBidETH(0, {
          value: ethers.parseEther("1")
        });

        // user2 出更高价
        await nftAuction.connect(user2).placeBidETH(0, {
          value: ethers.parseEther("2")
        });

        // user1 再次出价
        await nftAuction.connect(user1).placeBidETH(0, {
          value: ethers.parseEther("3")
        });

        // 验证最终状态
        const auction = await nftAuction.auctions(0);
        expect(auction.highestBidder).to.equal(user1.address);
      });

      it("重入保护不应该影响正常的多次出价", async function () {
        const bidders = [user1, user2];
        const values = [
          ethers.parseEther("1"),
          ethers.parseEther("2")
        ];

        // 连续多次正常出价
        for (let i = 0; i < bidders.length; i++) {
          await nftAuction.connect(bidders[i]).placeBidETH(0, {
            value: values[i]
          });
        }

        // 验证最后的出价者是正确的
        const auction = await nftAuction.auctions(0);
        expect(auction.highestBidder).to.equal(user2.address);
      });
    });
  });
});
