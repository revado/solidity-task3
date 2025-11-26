import { expect } from "chai";
import hre from "hardhat";
const { ethers, upgrades } = hre;

describe("NFTAuction 升级测试", function () {
	let nftAuction;
	let priceOracleReader;
	let admin;
	let user1;
	let user2;
	let mockNFT;
	let mockPriceFeed;

	// 部署一个 Mock NFT 合约用于测试
	async function deployMockNFT() {
		const MockNFT = await ethers.getContractFactory("MockNFT");
		const mockNFT = await MockNFT.deploy();
		await mockNFT.waitForDeployment();
		return mockNFT;
	}

	// 部署 Mock Price Feed
	async function deployMockPriceFeed(price) {
		const MockPriceFeed = await ethers.getContractFactory("MockV3Aggregator");
		const mockPriceFeed = await MockPriceFeed.deploy(8, price); // 8位小数
		await mockPriceFeed.waitForDeployment();
		return mockPriceFeed;
	}

	// 部署 PriceOracleReader
	async function deployPriceOracleReader() {
		const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
		const reader = await PriceOracleReader.deploy();
		await reader.waitForDeployment();
		return reader;
	}

	beforeEach(async function () {
		[admin, user1, user2] = await ethers.getSigners();

		// 部署 V1 版本
		const NFTAuction = await ethers.getContractFactory("NFTAuction");
		nftAuction = await upgrades.deployProxy(
			NFTAuction,
			[],
			{
				initializer: "initialize",
				kind: "uups"
			}
		);
		await nftAuction.waitForDeployment();

		// 部署 Mock NFT
		mockNFT = await deployMockNFT();

		// 部署 Mock Price Feed (ETH价格设为 $2000)
		mockPriceFeed = await deployMockPriceFeed(200000000000); // $2000 * 10^8

		// 部署 PriceOracleReader 并设置价格源
		priceOracleReader = await deployPriceOracleReader();
		await priceOracleReader.connect(admin).setEthPriceFeed(await mockPriceFeed.getAddress());
	});

	describe("1. 基本升级功能", function () {
		it("应该能够成功升级到 V2", async function () {
			// 创建一个 V2 版本的合约（这里用同一个合约模拟）
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");

			const upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			expect(await upgraded.getAddress()).to.equal(await nftAuction.getAddress());
			console.log("✅ 升级成功，合约地址保持不变");
		});

		it("升级后应该保持原有的状态变量", async function () {
			// 创建拍卖前的准备
			const startPrice = ethers.parseUnits("1000", 8); // $1000 (8位小数)
			const duration = 60 * 60; // 1小时

			// Mint NFT 给 user1 (mint 返回 tokenId)
			await mockNFT.mint(user1.address);
			const tokenId = 0; // 第一个 NFT 的 tokenId 是 0

			// 授权合约转移 NFT
			await mockNFT.connect(user1).approve(await nftAuction.getAddress(), tokenId);

			// 创建拍卖
			await nftAuction.connect(user1).createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				tokenId,
				startPrice,
				duration
			);

			// 记录升级前的状态
			const auctionBefore = await nftAuction.auctions(0);
			const nextAuctionIdBefore = await nftAuction.nextAuctionId();
			const adminBefore = await nftAuction.admin();

			// 升级合约
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");
			const upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			// 验证状态保持
			const auctionAfter = await upgraded.auctions(0);
			const nextAuctionIdAfter = await upgraded.nextAuctionId();
			const adminAfter = await upgraded.admin();

			expect(auctionAfter.seller).to.equal(auctionBefore.seller);
			expect(auctionAfter.startPrice).to.equal(auctionBefore.startPrice);
			expect(auctionAfter.tokenId).to.equal(auctionBefore.tokenId);
			expect(nextAuctionIdAfter).to.equal(nextAuctionIdBefore);
			expect(adminAfter).to.equal(adminBefore);
		});

		it("升级后原有功能应该继续工作", async function () {
			// 升级合约
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");
			const upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			// 测试创建拍卖功能
			const startPrice = ethers.parseUnits("1000", 8);
			const duration = 60 * 60;

			await mockNFT.mint(user1.address);
			const tokenId = 0;
			await mockNFT.connect(user1).approve(await upgraded.getAddress(), tokenId);

			await expect(
				upgraded.connect(user1).createAuction(
					await priceOracleReader.getAddress(),
					await mockNFT.getAddress(),
					tokenId,
					startPrice,
					duration
				)
			).to.emit(upgraded, "AuctionCreated");
		});
	});

	describe("2. 权限控制测试", function () {
		it("非 admin 不能升级合约", async function () {
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction", user1);

			await expect(
				upgrades.upgradeProxy(
					await nftAuction.getAddress(),
					NFTAuctionV2,
					{ kind: "uups" }
				)
			).to.be.reverted;
		});

		it("只有 admin 可以升级合约", async function () {
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction", admin);

			const upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			expect(await upgraded.admin()).to.equal(admin.address);
		});
	});

	describe("3. 升级后的拍卖流程测试", function () {
		it("升级后应该能够正常完成完整的拍卖流程", async function () {
			// 创建拍卖
			const startPrice = ethers.parseUnits("1000", 8); // $1000
			const duration = 60 * 60; // 1小时

			await mockNFT.mint(user1.address);
			const tokenId = 0;
			await mockNFT.connect(user1).approve(await nftAuction.getAddress(), tokenId);
			await nftAuction.connect(user1).createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				tokenId,
				startPrice,
				duration
			);

			// 进行竞价
			const bidValue = ethers.parseEther("1"); // 1 ETH
			await nftAuction.connect(user2).placeBid(0, ethers.ZeroAddress, 0, { value: bidValue });

			// 升级合约
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");
			const upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			// 快进时间到拍卖结束
			await ethers.provider.send("evm_increaseTime", [duration + 1]);
			await ethers.provider.send("evm_mine");

			// 结束拍卖
			await expect(
				upgraded.connect(user1).endAuction(0)
			).to.emit(upgraded, "AuctionEnded");

			// 验证 NFT 已转移给赢家
			expect(await mockNFT.ownerOf(tokenId)).to.equal(user2.address);

			console.log("✅ 升级后完整拍卖流程正常");
		});

		it("升级期间的活跃拍卖不受影响", async function () {
			// 创建多个拍卖
			for (let i = 0; i < 3; i++) {
				await mockNFT.mint(user1.address);
				await mockNFT.connect(user1).approve(await nftAuction.getAddress(), i);
				await nftAuction.connect(user1).createAuction(
					await priceOracleReader.getAddress(),
					await mockNFT.getAddress(),
					i,
					ethers.parseUnits("1000", 8),
					60 * 60
				);
			}

			// 对第一个拍卖进行竞价
			await nftAuction.connect(user2).placeBid(0, ethers.ZeroAddress, 0, {
				value: ethers.parseEther("1")
			});

			// 升级合约
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");
			const upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			// 升级后继续对其他拍卖竞价
			await expect(
				upgraded.connect(user2).placeBid(1, ethers.ZeroAddress, 0, {
					value: ethers.parseEther("1")
				})
			).to.emit(upgraded, "NewHighestBid");

			// 验证所有拍卖状态
			for (let i = 0; i < 3; i++) {
				const auction = await upgraded.auctions(i);
				expect(auction.seller).to.equal(user1.address);
			}
		});
	});

	describe("4. 多次升级测试", function () {
		it("应该能够进行多次升级", async function () {
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");

			// 第一次升级
			const upgraded1 = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);
			const address1 = await upgraded1.getAddress();

			// 第二次升级
			const upgraded2 = await upgrades.upgradeProxy(
				address1,
				NFTAuctionV2,
				{ kind: "uups" }
			);
			const address2 = await upgraded2.getAddress();

			// 第三次升级
			const upgraded3 = await upgrades.upgradeProxy(
				address2,
				NFTAuctionV2,
				{ kind: "uups" }
			);
			const address3 = await upgraded3.getAddress();

			// 验证地址始终不变
			expect(address1).to.equal(address2);
			expect(address2).to.equal(address3);
		});

		it("多次升级后状态应该累积保持", async function () {
			// 创建第一个拍卖
			await mockNFT.mint(user1.address);
			await mockNFT.connect(user1).approve(await nftAuction.getAddress(), 0);
			await nftAuction.connect(user1).createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				0,
				ethers.parseUnits("1000", 8),
				60 * 60
			);

			// 第一次升级
			const NFTAuctionV2 = await ethers.getContractFactory("NFTAuction");
			let upgraded = await upgrades.upgradeProxy(
				await nftAuction.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			// 创建第二个拍卖
			await mockNFT.mint(user1.address);
			await mockNFT.connect(user1).approve(await upgraded.getAddress(), 1);
			await upgraded.connect(user1).createAuction(
				await priceOracleReader.getAddress(),
				await mockNFT.getAddress(),
				1,
				ethers.parseUnits("2000", 8),
				60 * 60
			);

			// 第二次升级
			upgraded = await upgrades.upgradeProxy(
				await upgraded.getAddress(),
				NFTAuctionV2,
				{ kind: "uups" }
			);

			// 验证两个拍卖都存在
			const auction0 = await upgraded.auctions(0);
			const auction1 = await upgraded.auctions(1);

			expect(auction0.tokenId).to.equal(0);
			expect(auction1.tokenId).to.equal(1);
			expect(await upgraded.nextAuctionId()).to.equal(2);
		});
	});
});
