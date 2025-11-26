import hre from "hardhat";
const { ethers } = hre;
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const START_PRICE_USD = 1000n * 10n ** 8n; // $1000 with 8 decimals
const SHORT_DURATION = 601; // 601秒，刚好超出10分钟1秒

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

async function deployPriceConverter() {
    const PriceConverter = await ethers.getContractFactory("PriceConverter");
    const converter = await PriceConverter.deploy();
    await converter.waitForDeployment();
    return converter;
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

        it("应该在创建拍卖时，拒绝零地址的 priceConverter", async function () {
            const nftAuction = await deployProxy();
            const nft = await deployMockNFT();
            await expect(
                nftAuction.createAuction(
                    ethers.ZeroAddress, // priceConverter
                    await nft.getAddress(),
                    0,
                    START_PRICE_USD,
                    SHORT_DURATION
                )
            ).to.be.revertedWith("Invalid price converter address");
        });

        it("应该在创建拍卖时，拒绝零地址的 NFT 合约", async function () {
            const nftAuction = await deployProxy();
            const priceConverter = await deployPriceConverter();
            await expect(
                nftAuction.createAuction(
                    await priceConverter.getAddress(),
                    ethers.ZeroAddress,
                    0,
                    START_PRICE_USD,
                    SHORT_DURATION
                )
            ).to.be.revertedWith("Invalid NFT contract address");
        });

        it("应该在创建拍卖时，拒绝持续时间小于 10 分钟的拍卖", async function () {
            const nftAuction = await deployProxy();
            const priceConverter = await deployPriceConverter();
            const nft = await deployMockNFT();
            await nft.mint(owner.address);
            await nft.approve(await nftAuction.getAddress(), 0);

            await expect(
                nftAuction.createAuction(
                    await priceConverter.getAddress(),
                    await nft.getAddress(),
                    0,
                    START_PRICE_USD,
                    600 // exactly 10 minutes
                )
            ).to.be.revertedWith("Duration must be at least 10 minutes");
        });
    });

    describe("出价防护", function () {
        let nftAuction;
        let priceConverter;
        let nft;
        let ethFeed;

        beforeEach(async function () {
            nftAuction = await deployProxy();
            priceConverter = await deployPriceConverter();
            nft = await deployMockNFT();
            await nft.mint(owner.address);
            await nft.approve(await nftAuction.getAddress(), 0);
            ethFeed = await deployPriceFeed(200000000000n); // $2000
            await priceConverter.setEthPriceFeed(await ethFeed.getAddress());
        });

        it("应该在拍卖不存在时回退", async function () {
            await expect(
                nftAuction.placeBid(999, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Auction does not exist");
        });

        it("应该在卖家竞拍自己的拍卖时回退", async function () {
            await nftAuction.createAuction(
                await priceConverter.getAddress(),
                await nft.getAddress(),
                0,
                START_PRICE_USD,
                SHORT_DURATION
            );

            await expect(
                nftAuction.placeBid(0, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Seller cannot bid on own auction");
        });

        it("应该在出价时，拒绝 ETH 金额小于等于零", async function () {
            await nftAuction.createAuction(
                await priceConverter.getAddress(),
                await nft.getAddress(),
                0,
                START_PRICE_USD,
                SHORT_DURATION
            );

            await expect(
                nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, { value: 0 })
            ).to.be.revertedWith("Must send ETH");
        });

        it("应该在出价时，拒绝 ERC20 金额小于等于零", async function () {
            const token = await deployMockERC20("Mock DAI", "DAI", 18);
            const tokenFeed = await deployPriceFeed(100000000n);
            await priceConverter.setTokenPriceFeed(await token.getAddress(), await tokenFeed.getAddress());

            await nftAuction.createAuction(
                await priceConverter.getAddress(),
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
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("应该在出价时，拒绝价格预言机未设置的 ERC20 代币", async function () {
            const token = await deployMockERC20("Mock Token", "MTK", 18);
            await nftAuction.createAuction(
                await priceConverter.getAddress(),
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
            const priceConverter2 = await deployPriceConverter(); // 没有设置 ETH Feed
            await nftAuction.createAuction(
                await priceConverter2.getAddress(),
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
                await priceConverter.getAddress(),
                await nft.getAddress(),
                0,
                START_PRICE_USD,
                SHORT_DURATION
            );

            await time.increase(SHORT_DURATION + 1);
            await nftAuction.endAuction(0);

            await expect(
                nftAuction.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Auction already ended");
        });
    });

    describe("价格预言机验证", function () {
        it("应该在预言机返回非正数价格时回退", async function () {
            const priceConverter = await deployPriceConverter();
            const zeroFeed = await deployPriceFeed(0); // answer == 0 triggers validation revert

            await expect(
                priceConverter.setEthPriceFeed(await zeroFeed.getAddress())
            ).to.not.be.reverted; // 设置不会失败，但在获取价格时会失败
            
            await expect(
                priceConverter.getEthPrice()
            ).to.be.revertedWithCustomError(priceConverter, "InvalidPrice");
        });

        it("应该在预言机调用 latestRoundData 时发生回退", async function () {
            const priceConverter = await deployPriceConverter();
            const MockFaultyAggregator = await ethers.getContractFactory("MockFaultyAggregator");
            const revertingFeed = await MockFaultyAggregator.deploy(8, 100000000n, true, false);
            await revertingFeed.waitForDeployment();

            await priceConverter.setEthPriceFeed(await revertingFeed.getAddress());

            await expect(
                priceConverter.getEthPrice()
            ).to.be.revertedWithCustomError(priceConverter, "InvalidPrice");
        });

        it("应该在价格数据过期时回退", async function () {
            const priceConverter = await deployPriceConverter();
            const MockFaultyAggregator = await ethers.getContractFactory("MockFaultyAggregator");
            const staleFeed = await MockFaultyAggregator.deploy(8, 100000000n, false, true);
            await staleFeed.waitForDeployment();

            await priceConverter.setEthPriceFeed(await staleFeed.getAddress());

            await expect(
                priceConverter.getEthPrice()
            ).to.be.revertedWithCustomError(priceConverter, "StalePriceData");
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
});
