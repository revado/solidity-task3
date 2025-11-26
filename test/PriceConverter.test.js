import hre from "hardhat";
const { ethers } = hre;
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PriceConverter 合约测试", function () {
	let priceConverter;
	let mockETHUSD;
	let mockUSDCUSD;
	let mockDAIUSD;
	let mockERC20;
	let owner, user1, user2;

	// 价格常量（8位小数）
	const ETH_PRICE = 280000000000n; // $2800
	const USDC_PRICE = 99977674n;     // $0.99977674
	const DAI_PRICE = 100000000n;     // $1.00
	const USDC_DECIMALS = 6;
	const DAI_DECIMALS = 18;

	beforeEach(async function () {
		[owner, user1, user2] = await ethers.getSigners();

		// 1. 部署 Mock Chainlink 价格预言机
		const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

		// ETH/USD 价格源
		mockETHUSD = await MockV3Aggregator.deploy(8, ETH_PRICE);
		await mockETHUSD.waitForDeployment();

		// USDC/USD 价格源
		mockUSDCUSD = await MockV3Aggregator.deploy(8, USDC_PRICE);
		await mockUSDCUSD.waitForDeployment();

		// DAI/USD 价格源
		mockDAIUSD = await MockV3Aggregator.deploy(8, DAI_PRICE);
		await mockDAIUSD.waitForDeployment();

		// 2. 部署 Mock ERC20 代币
		const MockERC20 = await ethers.getContractFactory("MockERC20");
		mockERC20 = await MockERC20.deploy("Mock USDC", "USDC", USDC_DECIMALS);
		await mockERC20.waitForDeployment();

		// 3. 部署 PriceConverter 合约
		const PriceConverter = await ethers.getContractFactory("PriceConverter");
		priceConverter = await PriceConverter.deploy();
		await priceConverter.waitForDeployment();
	});

	describe("部署和初始化", function () {
		it("应该正确设置 owner", async function () {
			expect(await priceConverter.owner()).to.equal(owner.address);
		});

		it("价格时效性限制应该为 1 小时", async function () {
			expect(await priceConverter.PRICE_STALE_LIMIT()).to.equal(3600);
		});

		it("初始 ETH 价格 Feed 应该为零地址", async function () {
			expect(await priceConverter.ethPriceFeed()).to.equal(ethers.ZeroAddress);
		});
	});

	describe("setEthPriceFeed - 设置 ETH 价格 Feed", function () {
		it("owner 应该能够设置 ETH 价格 Feed", async function () {
			await expect(priceConverter.setEthPriceFeed(await mockETHUSD.getAddress()))
				.to.emit(priceConverter, "PriceFeedUpdated")
				.withArgs(ethers.ZeroAddress, await mockETHUSD.getAddress());

			expect(await priceConverter.ethPriceFeed()).to.equal(await mockETHUSD.getAddress());
		});

		it("非 owner 不能设置 ETH 价格 Feed", async function () {
			await expect(
				priceConverter.connect(user1).setEthPriceFeed(await mockETHUSD.getAddress())
			).to.be.revertedWithCustomError(priceConverter, "OwnableUnauthorizedAccount");
		});

		it("不能设置零地址作为 ETH 价格 Feed", async function () {
			await expect(
				priceConverter.setEthPriceFeed(ethers.ZeroAddress)
			).to.be.revertedWithCustomError(priceConverter, "InvalidEthPriceFeed");
		});
	});

	describe("setTokenPriceFeed - 设置代币价格 Feed", function () {
		it("owner 应该能够设置代币价格 Feed", async function () {
			const tokenAddress = await mockERC20.getAddress();
			const feedAddress = await mockUSDCUSD.getAddress();

			await expect(priceConverter.setTokenPriceFeed(tokenAddress, feedAddress))
				.to.emit(priceConverter, "PriceFeedUpdated")
				.withArgs(ethers.ZeroAddress, feedAddress);

			expect(await priceConverter.priceFeeds(tokenAddress)).to.equal(feedAddress);
		});

		it("非 owner 不能设置代币价格 Feed", async function () {
			await expect(
				priceConverter.connect(user1).setTokenPriceFeed(
					await mockERC20.getAddress(),
					await mockUSDCUSD.getAddress()
				)
			).to.be.revertedWithCustomError(priceConverter, "OwnableUnauthorizedAccount");
		});

		it("不能设置零地址作为代币地址", async function () {
			await expect(
				priceConverter.setTokenPriceFeed(ethers.ZeroAddress, await mockUSDCUSD.getAddress())
			).to.be.revertedWithCustomError(priceConverter, "InvalidTokenAddress");
		});

		it("不能设置零地址作为价格 Feed", async function () {
			await expect(
				priceConverter.setTokenPriceFeed(await mockERC20.getAddress(), ethers.ZeroAddress)
			).to.be.revertedWithCustomError(priceConverter, "InvalidTokenPriceFeed");
		});
	});

	describe("getEthPrice - 获取 ETH 价格", function () {
		beforeEach(async function () {
			await priceConverter.setEthPriceFeed(await mockETHUSD.getAddress());
		});

		it("应该正确返回 ETH 价格", async function () {
			const price = await priceConverter.getEthPrice();
			expect(price).to.equal(ETH_PRICE);
		});

		it("价格为负数时应该 revert", async function () {
			await mockETHUSD.updateAnswer(-1);
			await expect(priceConverter.getEthPrice())
				.to.be.revertedWithCustomError(priceConverter, "InvalidPrice");
		});

		it("价格为零时应该 revert", async function () {
			await mockETHUSD.updateAnswer(0);
			await expect(priceConverter.getEthPrice())
				.to.be.revertedWithCustomError(priceConverter, "InvalidPrice");
		});

		it("answeredInRound 与 roundId 不匹配时应该 revert", async function () {
			// 更新答案，但强制 answeredInRound 不匹配
			// 使用完整的函数签名来避免歧义
			await mockETHUSD["updateRoundData(uint80,int256,uint256,uint256,uint80)"](
				99, // roundId
				ETH_PRICE,
				await time.latest(),
				await time.latest(),
				98 // answeredInRound 不匹配
			);

			await expect(priceConverter.getEthPrice())
				.to.be.revertedWithCustomError(priceConverter, "StalePriceData");
		});

		it("价格数据过期时应该 revert", async function () {
			// 先更新一次价格
			await mockETHUSD.updateAnswer(ETH_PRICE);

			// 时间快进超过 1 小时
			await time.increase(3601);

			await expect(priceConverter.getEthPrice())
				.to.be.revertedWithCustomError(priceConverter, "StalePriceData");
		});
	});

	describe("getTokenPrice - 获取代币价格", function () {
		beforeEach(async function () {
			await priceConverter.setTokenPriceFeed(
				await mockERC20.getAddress(),
				await mockUSDCUSD.getAddress()
			);
		});

		it("应该正确返回代币价格", async function () {
			const price = await priceConverter.getTokenPrice(await mockERC20.getAddress());
			expect(price).to.equal(USDC_PRICE);
		});

		it("价格为负数时应该 revert", async function () {
			await mockUSDCUSD.updateAnswer(-100);
			await expect(priceConverter.getTokenPrice(await mockERC20.getAddress()))
				.to.be.revertedWithCustomError(priceConverter, "InvalidPrice");
		});

		it("价格数据过期时应该 revert", async function () {
			await mockUSDCUSD.updateAnswer(USDC_PRICE);
			await time.increase(3601);

			await expect(priceConverter.getTokenPrice(await mockERC20.getAddress()))
				.to.be.revertedWithCustomError(priceConverter, "StalePriceData");
		});
	});

	describe("getEthValueInUSD - 获取 ETH 的 USD 价值", function () {
		beforeEach(async function () {
			await priceConverter.setEthPriceFeed(await mockETHUSD.getAddress());
		});

		it("应该正确计算 1 ETH 的 USD 价值", async function () {
			const ethAmount = ethers.parseEther("1"); // 1 ETH
			const usdValue = await priceConverter.getEthValueInUSD(ethAmount);

			// 1 ETH * 2800 USD/ETH = 2800 USD (8位小数)
			expect(usdValue).to.equal(ETH_PRICE);
		});

		it("应该正确计算 0.5 ETH 的 USD 价值", async function () {
			const ethAmount = ethers.parseEther("0.5"); // 0.5 ETH
			const usdValue = await priceConverter.getEthValueInUSD(ethAmount);

			// 0.5 ETH * 2800 USD/ETH = 1400 USD
			const expectedValue = ETH_PRICE / 2n;
			expect(usdValue).to.equal(expectedValue);
		});

		it("应该正确计算小额 ETH 的 USD 价值", async function () {
			const ethAmount = ethers.parseEther("0.001"); // 0.001 ETH
			const usdValue = await priceConverter.getEthValueInUSD(ethAmount);

			// 0.001 ETH * 2800 USD/ETH = 2.8 USD
			const expectedValue = (ETH_PRICE * ethAmount) / ethers.parseEther("1");
			expect(usdValue).to.equal(expectedValue);
		});

		it("零数量应该返回零", async function () {
			const usdValue = await priceConverter.getEthValueInUSD(0);
			expect(usdValue).to.equal(0);
		});
	});

	describe("getTokenValueInUSD - 获取代币的 USD 价值", function () {
		beforeEach(async function () {
			await priceConverter.setTokenPriceFeed(
				await mockERC20.getAddress(),
				await mockUSDCUSD.getAddress()
			);
		});

		it("应该正确计算 USDC 的 USD 价值", async function () {
			const usdcAmount = 1000n * 10n**BigInt(USDC_DECIMALS); // 1000 USDC
			const usdValue = await priceConverter.getTokenValueInUSD(
				await mockERC20.getAddress(),
				usdcAmount
			);

			// 1000 USDC * ~0.9998 USD/USDC ≈ 999.77674 USD
			const expectedValue = (usdcAmount * USDC_PRICE) / (10n**BigInt(USDC_DECIMALS));
			expect(usdValue).to.equal(expectedValue);
		});

		it("应该正确处理不同精度的代币", async function () {
			// 部署 18 位精度的 DAI
			const MockERC20 = await ethers.getContractFactory("MockERC20");
			const mockDAI = await MockERC20.deploy("Mock DAI", "DAI", DAI_DECIMALS);
			await mockDAI.waitForDeployment();

			// 设置 DAI 价格 Feed
			await priceConverter.setTokenPriceFeed(
				await mockDAI.getAddress(),
				await mockDAIUSD.getAddress()
			);

			const daiAmount = ethers.parseEther("500"); // 500 DAI
			const usdValue = await priceConverter.getTokenValueInUSD(
				await mockDAI.getAddress(),
				daiAmount
			);

			// 500 DAI * 1 USD/DAI = 500 USD
			const expectedValue = (daiAmount * DAI_PRICE) / ethers.parseEther("1");
			expect(usdValue).to.equal(expectedValue);
		});

		it("零数量应该返回零", async function () {
			const usdValue = await priceConverter.getTokenValueInUSD(
				await mockERC20.getAddress(),
				0
			);
			expect(usdValue).to.equal(0);
		});

		it("小数量应该正确计算", async function () {
			const usdcAmount = 1n * 10n**BigInt(USDC_DECIMALS); // 1 USDC
			const usdValue = await priceConverter.getTokenValueInUSD(
				await mockERC20.getAddress(),
				usdcAmount
			);

			// 1 USDC * ~0.9998 USD/USDC
			const expectedValue = (usdcAmount * USDC_PRICE) / (10n**BigInt(USDC_DECIMALS));
			expect(usdValue).to.equal(expectedValue);
		});
	});

	describe("isPriceFeedSet - 检查价格 Feed 是否设置", function () {
		it("ETH 价格 Feed 未设置时应该返回 false", async function () {
			expect(await priceConverter.isPriceFeedSet(ethers.ZeroAddress)).to.be.false;
		});

		it("ETH 价格 Feed 设置后应该返回 true", async function () {
			await priceConverter.setEthPriceFeed(await mockETHUSD.getAddress());
			expect(await priceConverter.isPriceFeedSet(ethers.ZeroAddress)).to.be.true;
		});

		it("代币价格 Feed 未设置时应该返回 false", async function () {
			expect(await priceConverter.isPriceFeedSet(await mockERC20.getAddress())).to.be.false;
		});

		it("代币价格 Feed 设置后应该返回 true", async function () {
			await priceConverter.setTokenPriceFeed(
				await mockERC20.getAddress(),
				await mockUSDCUSD.getAddress()
			);
			expect(await priceConverter.isPriceFeedSet(await mockERC20.getAddress())).to.be.true;
		});
	});

	describe("边界条件和异常情况", function () {
		it("获取价格时如果 Feed 地址为零应该 revert", async function () {
			// ETH Feed 未设置
			await expect(priceConverter.getEthPrice()).to.be.reverted;
		});

		it("获取代币价格时如果 Feed 地址为零应该 revert", async function () {
			await expect(priceConverter.getTokenPrice(await mockERC20.getAddress()))
				.to.be.reverted;
		});

		it("应该正确处理极大的 ETH 数量", async function () {
			await priceConverter.setEthPriceFeed(await mockETHUSD.getAddress());

			const largeAmount = ethers.parseEther("1000000"); // 100万 ETH
			const usdValue = await priceConverter.getEthValueInUSD(largeAmount);

			const expectedValue = (largeAmount * ETH_PRICE) / ethers.parseEther("1");
			expect(usdValue).to.equal(expectedValue);
		});

		it("应该正确处理极大的代币数量", async function () {
			await priceConverter.setTokenPriceFeed(
				await mockERC20.getAddress(),
				await mockUSDCUSD.getAddress()
			);

			const largeAmount = 1000000000n * 10n**BigInt(USDC_DECIMALS); // 10亿 USDC
			const usdValue = await priceConverter.getTokenValueInUSD(
				await mockERC20.getAddress(),
				largeAmount
			);

			const expectedValue = (largeAmount * USDC_PRICE) / (10n**BigInt(USDC_DECIMALS));
			expect(usdValue).to.equal(expectedValue);
		});
	});

	describe("价格更新和时效性", function () {
		beforeEach(async function () {
			await priceConverter.setEthPriceFeed(await mockETHUSD.getAddress());
		});

		it("更新价格后应该返回新价格", async function () {
			const newPrice = 300000000000n; // $3000
			await mockETHUSD.updateAnswer(newPrice);

			const price = await priceConverter.getEthPrice();
			expect(price).to.equal(newPrice);
		});

		it("在时效性限制内的价格应该有效", async function () {
			await mockETHUSD.updateAnswer(ETH_PRICE);

			// 时间快进 59 分钟（在 1 小时限制内）
			await time.increase(3540);

			const price = await priceConverter.getEthPrice();
			expect(price).to.equal(ETH_PRICE);
		});

		it("恰好 1 小时的价格应该有效", async function () {
			await mockETHUSD.updateAnswer(ETH_PRICE);

			// 恰好 1 小时
			await time.increase(3600);

			const price = await priceConverter.getEthPrice();
			expect(price).to.equal(ETH_PRICE);
		});

		it("超过 1 小时的价格应该 revert", async function () {
			await mockETHUSD.updateAnswer(ETH_PRICE);

			// 超过 1 小时
			await time.increase(3601);

			await expect(priceConverter.getEthPrice())
				.to.be.revertedWithCustomError(priceConverter, "StalePriceData");
		});
	});

	describe("多个代币的价格 Feed", function () {
		let mockToken1, mockToken2;
		let mockFeed1, mockFeed2;

		beforeEach(async function () {
			const MockERC20 = await ethers.getContractFactory("MockERC20");
			mockToken1 = await MockERC20.deploy("Token1", "TK1", 18);
			mockToken2 = await MockERC20.deploy("Token2", "TK2", 6);
			await mockToken1.waitForDeployment();
			await mockToken2.waitForDeployment();

			const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
			mockFeed1 = await MockV3Aggregator.deploy(8, 500000000n); // $5
			mockFeed2 = await MockV3Aggregator.deploy(8, 1000000000n); // $10
			await mockFeed1.waitForDeployment();
			await mockFeed2.waitForDeployment();
		});

		it("应该能够为多个代币设置不同的价格 Feed", async function () {
			await priceConverter.setTokenPriceFeed(
				await mockToken1.getAddress(),
				await mockFeed1.getAddress()
			);
			await priceConverter.setTokenPriceFeed(
				await mockToken2.getAddress(),
				await mockFeed2.getAddress()
			);

			const price1 = await priceConverter.getTokenPrice(await mockToken1.getAddress());
			const price2 = await priceConverter.getTokenPrice(await mockToken2.getAddress());

			expect(price1).to.equal(500000000n);
			expect(price2).to.equal(1000000000n);
		});

		it("应该能够独立查询每个代币是否设置了 Feed", async function () {
			await priceConverter.setTokenPriceFeed(
				await mockToken1.getAddress(),
				await mockFeed1.getAddress()
			);

			expect(await priceConverter.isPriceFeedSet(await mockToken1.getAddress())).to.be.true;
			expect(await priceConverter.isPriceFeedSet(await mockToken2.getAddress())).to.be.false;
		});
	});

	describe("权限控制", function () {
		it("owner 可以转移所有权", async function () {
			await priceConverter.transferOwnership(user1.address);
			expect(await priceConverter.owner()).to.equal(user1.address);
		});

		it("新 owner 可以设置价格 Feed", async function () {
			await priceConverter.transferOwnership(user1.address);

			await expect(
				priceConverter.connect(user1).setEthPriceFeed(await mockETHUSD.getAddress())
			).to.emit(priceConverter, "PriceFeedUpdated");
		});

		it("旧 owner 不能再设置价格 Feed", async function () {
			await priceConverter.transferOwnership(user1.address);

			await expect(
				priceConverter.setEthPriceFeed(await mockETHUSD.getAddress())
			).to.be.revertedWithCustomError(priceConverter, "OwnableUnauthorizedAccount");
		});
	});
});
