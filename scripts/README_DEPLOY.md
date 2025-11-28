# 🚀 NFT 拍卖系统部署脚本说明

## 📋 脚本对比分析

### 原 TypeScript 脚本 (`deploy-local.ts`)
- **技术栈**: Viem + TypeScript
- **架构**: NftAuctionFactory 工厂模式
- **合约**: PriceConverter, ERC721Collectible, Factory
- **适用**: 旧版项目架构

### 新 JavaScript 脚本 (`deploy-local.js`)
- **技术栈**: Ethers.js v6 + JavaScript (ES Module)
- **架构**: UUPS 代理模式
- **合约**: PriceOracleReader, NFTAuction, ERC1967Proxy
- **适用**: 当前项目架构

## 📦 部署流程

### 1️⃣ **部署价格预言机** (Mock Chainlink Aggregators)
```javascript
// ETH/USD: $2800
mockETHUSD = await MockV3Aggregator.deploy(8, 280000000000n);

// USDC/USD: $0.9998
mockUSDCUSD = await MockV3Aggregator.deploy(8, 99977674n);
```

### 2️⃣ **部署价格预言机读取器** (PriceOracleReader)
```javascript
priceOracleReader = await PriceOracleReader.deploy();
await priceOracleReader.setEthPriceFeed(mockETHUSD);
```

### 3️⃣ **部署 NFTAuction（UUPS 代理模式）**
```javascript
// 部署实现合约
nftAuctionImpl = await NFTAuction.deploy();

// 部署代理
proxy = await ERC1967Proxy.deploy(nftAuctionImpl, initData);

// 获取代理实例
nftAuction = await ethers.getContractAt("NFTAuction", proxy);
```

### 4️⃣ **部署测试资产**
```javascript
// NFT 合约
mockNFT = await MockNFT.deploy();

// USDC 代币
mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
```

### 5️⃣ **配置价格源**
```javascript
await priceOracleReader.setTokenPriceFeed(mockUSDC, mockUSDCUSD);
```

### 6️⃣ **准备测试资产**
```javascript
// Mint NFT 给卖家
await mockNFT.mint(seller.address);  // Token #0
await mockNFT.mint(seller.address);  // Token #1

// Mint USDC 给出价者
await mockUSDC.mint(bidder1.address, 10000 USDC);
await mockUSDC.mint(bidder2.address, 10000 USDC);
```

### 7️⃣ **创建示例拍卖**
```javascript
await mockNFT.connect(seller).approve(nftAuction, 0);
await nftAuction.connect(seller).createAuction(
  priceOracleReader,
  mockNFT,
  0,              // tokenId
  1000 * 10**8,   // $1000 起拍价
  3600            // 1 小时
);
```

### 8️⃣ **模拟出价**
```javascript
// Bidder1: 0.5 ETH (~$1400)
await nftAuction.connect(bidder1).placeBid(0, ZeroAddress, 0, {
  value: parseEther("0.5")
});

// Bidder2: 1500 USDC (~$1500)
await mockUSDC.connect(bidder2).approve(nftAuction, 1500 USDC);
await nftAuction.connect(bidder2).placeBid(0, mockUSDC, 1500 USDC);

// Bidder1: 0.6 ETH (~$1680)
await nftAuction.connect(bidder1).placeBid(0, ZeroAddress, 0, {
  value: parseEther("0.6")
});
```

## 🎯 使用方法

### 方式 1: 运行在 Hardhat 临时网络
```bash
npx hardhat run scripts/deploy-local.js --network hardhat
```
- ✅ 快速测试
- ✅ 每次运行创建新的网络
- ❌ 部署后合约状态不保留

### 方式 2: 运行在本地持久化节点
```bash
# 终端 1: 启动 Hardhat 节点
npx hardhat node

# 终端 2: 部署到本地节点
npx hardhat run scripts/deploy-local.js --network localhost
```
- ✅ 合约状态持久化
- ✅ 可以继续交互测试
- ✅ 查看实时交易日志

## 📊 部署结果示例

```
🚀 开始部署 NFT 拍卖系统到本地网络...

部署账户: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
账户余额: 10000.0 ETH

📊 部署 Mock Chainlink Aggregators...
   ✅ ETH/USD Aggregator: 0x5FbDB2315678afecb367f032d93F642f64180aa3
   📈 ETH 价格设置为: $2800
   ✅ USDC/USD Aggregator: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
   📈 USDC 价格设置为: $0.9998

... (更多输出)

📊 当前拍卖状态:
   卖家: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   最高出价者: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
   最高出价: 0.6 ETH
   出价币种: ETH
   拍卖结束: 否
   剩余时间: 3596 秒
```

## 🧪 后续测试

### 使用 Hardhat Console 交互
```bash
npx hardhat console --network localhost
```

```javascript
// 获取合约实例
const nftAuction = await ethers.getContractAt("NFTAuction", "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");

// 查看拍卖信息
const auction = await nftAuction.auctions(0);
console.log("最高出价者:", auction.highestBidder);
console.log("最高出价:", ethers.formatEther(auction.highestBid), "ETH");

// 查看剩余时间
const remaining = await nftAuction.getRemainingTime(0);
console.log("剩余时间:", remaining.toString(), "秒");

// 获取测试账户
const [deployer, seller, bidder1, bidder2] = await ethers.getSigners();

// 继续出价测试
await nftAuction.connect(bidder2).placeBid(0, ethers.ZeroAddress, 0, {
  value: ethers.parseEther("0.7")
});
```

### 创建第二个拍卖
```javascript
const mockNFT = await ethers.getContractAt("MockNFT", "0x0165878A594ca255338adfa4d48449f69242Eb8F");
const [, seller] = await ethers.getSigners();

// 授权 Token #1
await mockNFT.connect(seller).approve(nftAuction.target, 1);

// 创建新拍卖
await nftAuction.connect(seller).createAuction(
  priceOracleReader.target,
  mockNFT.target,
  1,                     // tokenId
  2000n * 10n**8n,       // $2000 起拍价
  7200                   // 2 小时
);
```

## 🔧 自定义配置

### 修改初始价格
```javascript
// 修改 ETH 价格为 $3000
const mockETHUSD = await MockV3Aggregator.deploy(8, 300000000000n);

// 修改起拍价为 $500
const startPriceUSD = 500n * 10n**8n;
```

### 修改拍卖时长
```javascript
const duration = 7200; // 2 小时
const duration = 86400; // 1 天
const duration = 604800; // 1 周
```

## 📝 关键差异对比

| 特性 | 原脚本 (TS) | 新脚本 (JS) |
|------|------------|------------|
| 语言 | TypeScript | JavaScript (ES Module) |
| 库 | Viem | Ethers.js v6 |
| 代理模式 | 无 | UUPS (ERC1967) |
| 架构 | Factory 工厂 | 直接部署 |
| 价格转换 | PriceConverter | PriceOracleReader |
| NFT 标准 | ERC721Collectible | MockNFT (ERC721) |
| 初始化 | Factory.initialize | Proxy 初始化 |
| 升级性 | ❌ | ✅ (UUPS) |

## ⚠️ 注意事项

1. **网络选择**: 
   - `--network hardhat`: 临时网络，每次重新部署
   - `--network localhost`: 持久化网络，需先启动 `npx hardhat node`

2. **Gas 费用**: 本地测试网络 gas 费为 0，无需担心

3. **账户余额**: Hardhat 默认提供 20 个测试账户，每个 10000 ETH

4. **代理模式**: 当前项目使用 UUPS 代理，支持合约升级

5. **价格精度**: 所有 USD 价格使用 8 位小数（Chainlink 标准）

## 🎯 下一步

1. ✅ 在本地网络测试完整的拍卖流程
2. ✅ 测试合约升级功能
3. ✅ 测试不同币种的出价和切换
4. ✅ 测试拍卖结束和资产转移
5. 📝 编写测试网部署脚本
6. 📝 编写主网部署脚本

## 🔗 相关文件

- `contracts/NFTAuction.sol` - 主拍卖合约
- `contracts/PriceOracleReader.sol` - 价格预言机读取器
- `contracts/ERC1967Proxy.sol` - UUPS 代理合约
- `test/NFTAuction*.test.js` - 单元测试
- `hardhat.config.cjs` - Hardhat 配置

