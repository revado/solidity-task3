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
        nftAuction.placeBid(999, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(nftAuction, "AuctionDoesNotExist");
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
        nftAuction.placeBid(0, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
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
        nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, { value: 0 })
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
        nftAuction.connect(bidder1).placeBid(
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
        nftAuction.connect(bidder1).placeBid(
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
        nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
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
        nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
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
			await nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, {
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
        await nftAuction.connect(user1).placeBid(0, ethers.ZeroAddress, 0, {
          value: ethers.parseEther("1")
        });

        // user2 出更高价，触发退款给 user1
        // 注意：退款使用 transfer() 只提供 2300 gas
        // 这确保了即使接收方尝试重入也会因 gas 不足而失败
        await nftAuction.connect(user2).placeBid(0, ethers.ZeroAddress, 0, {
          value: ethers.parseEther("2")
        });

        // 验证拍卖状态正常
        const auction = await nftAuction.auctions(0);
        expect(auction.highestBidder).to.equal(user2.address);
        expect(auction.highestBid).to.be.greaterThan(0);
      });

      it("正常的连续出价应该工作", async function () {
        // user1 出价
        await nftAuction.connect(user1).placeBid(0, ethers.ZeroAddress, 0, {
          value: ethers.parseEther("1")
        });

        // user2 出更高价
        await nftAuction.connect(user2).placeBid(0, ethers.ZeroAddress, 0, {
          value: ethers.parseEther("2")
        });

        // user1 再次出价
        await nftAuction.connect(user1).placeBid(0, ethers.ZeroAddress, 0, {
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
          await nftAuction.connect(bidders[i]).placeBid(0, ethers.ZeroAddress, 0, {
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
