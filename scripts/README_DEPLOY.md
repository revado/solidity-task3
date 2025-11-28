# 🚀 NFT 拍卖系统部署脚本说明

## 📑 目录

- [本地部署 (deploy-local.js)](#本地部署)
- [Sepolia 测试网部署 (deploy-sepolia.js)](#sepolia-测试网部署)
- [脚本对比分析](#脚本对比分析)

---

## 本地部署

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

---

## Sepolia 测试网部署

## 📝 脚本概述

`deploy-sepolia.js` 用于将 NFT 拍卖系统部署到 Sepolia 测试网。

### 主要特点

✅ 使用 Chainlink 官方价格源（ETH/USD, USDC/USD）  
✅ UUPS 代理模式，支持合约升级  
✅ 自动验证合约（需配置 Etherscan API Key）  
✅ 生成部署信息 JSON 文件  
✅ 提供详细的交互指南  

### 与本地部署的区别

| 特性 | 本地部署 | Sepolia 部署 |
|------|---------|-------------|
| 价格源 | Mock Aggregator | Chainlink 官方预言机 |
| 网络 | Hardhat 临时网络 | Sepolia 测试网 |
| Gas 费 | 免费 | 需要测试 ETH |
| 合约验证 | 不需要 | 可在 Etherscan 验证 |
| 持久性 | 临时 | 永久保存 |
| RPC | 本地 | Alchemy/Infura |

## 🚀 快速开始

### 前置要求

1. **安装依赖**
```bash
npm install --save-dev dotenv
```

2. **配置网络**

在 `hardhat.config.cjs` 中添加：

```javascript
require("dotenv").config();

module.exports = {
  // ... 其他配置
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};
```

完整示例见 `hardhat.config.example.cjs`

3. **创建环境变量文件**

创建 `.env` 文件（根目录）：

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
```

⚠️ **安全警告**: 确保 `.env` 在 `.gitignore` 中！

### 获取资源

#### 1. 获取 RPC URL

**Alchemy (推荐)**:
- 访问 https://www.alchemy.com/
- 创建免费账户 → 创建 App → 选择 Sepolia
- 复制 HTTPS URL

**Infura**:
- 访问 https://infura.io/
- 创建 Project → 获取 Sepolia endpoint

#### 2. 获取测试 ETH (至少 0.1 ETH)

- https://www.alchemy.com/faucets/ethereum-sepolia
- https://sepoliafaucet.com/
- https://faucet.quicknode.com/ethereum/sepolia

#### 3. 获取 Etherscan API Key

- 访问 https://etherscan.io/myapikey
- 注册 → 创建 API Key

### 部署步骤

```bash
# 1. 检查配置
cat .env

# 2. 编译合约
npx hardhat compile

# 3. 部署到 Sepolia
npx hardhat run scripts/deploy-sepolia.js --network sepolia

# 4. 验证合约（使用输出的命令）
npx hardhat verify --network sepolia 0xYourContractAddress
```

## 📦 部署流程详解

### 1️⃣ 部署 PriceOracleReader

```javascript
const priceOracleReader = await PriceOracleReader.deploy();
await priceOracleReader.setEthPriceFeed(CHAINLINK_ETH_USD_FEED);
```

使用 Chainlink 官方价格源：
- ETH/USD: `0x694AA1769357215DE4FAC081bf1f309aDC325306`

### 2️⃣ 部署 NFTAuction (UUPS 代理)

```javascript
// 部署实现合约
const nftAuctionImpl = await NFTAuction.deploy();

// 部署代理
const proxy = await ERC1967Proxy.deploy(nftAuctionImpl, initData);

// 获取代理实例
const nftAuction = await ethers.getContractAt("NFTAuction", proxy);
```

### 3️⃣ 部署测试合约 (可选)

```javascript
// MockNFT - 用于测试
const mockNFT = await MockNFT.deploy();

// MockUSDC - 用于测试 ERC20 出价
const mockUSDC = await MockERC20.deploy("Test USDC", "USDC", 6);
await priceOracleReader.setTokenPriceFeed(mockUSDC, CHAINLINK_USDC_USD_FEED);
```

### 4️⃣ 生成部署信息

自动生成 `deployment-sepolia.json`：

```json
{
  "network": "sepolia",
  "timestamp": "2024-11-28T...",
  "deployer": "0x...",
  "contracts": {
    "priceOracleReader": "0x...",
    "nftAuctionImpl": "0x...",
    "nftAuctionProxy": "0x...",
    "mockNFT": "0x...",
    "mockUSDC": "0x..."
  },
  "chainlink": { ... },
  "etherscan": { ... }
}
```

## 🎯 部署后操作

### 1. 验证合约

```bash
# PriceOracleReader
npx hardhat verify --network sepolia <ADDRESS>

# NFTAuction 实现
npx hardhat verify --network sepolia <IMPL_ADDRESS>

# MockUSDC
npx hardhat verify --network sepolia <USDC_ADDRESS> "Test USDC" "USDC" 6
```

### 2. 在 Etherscan 查看

部署成功后访问：
```
https://sepolia.etherscan.io/address/<YOUR_CONTRACT_ADDRESS>
```

验证后可以直接在 Etherscan 上交互！

### 3. 创建测试拍卖

使用 Hardhat Console:

```bash
npx hardhat console --network sepolia
```

```javascript
// 获取合约实例
const nftAuction = await ethers.getContractAt("NFTAuction", "0x...");
const mockNFT = await ethers.getContractAt("MockNFT", "0x...");
const priceOracleReader = await ethers.getContractAt("PriceOracleReader", "0x...");

// 授权 NFT
await mockNFT.approve(await nftAuction.getAddress(), 0);

// 创建拍卖（$1000 起拍，1 天）
await nftAuction.createAuction(
  await priceOracleReader.getAddress(),
  await mockNFT.getAddress(),
  0,                  // tokenId
  100000000000n,      // $1000
  86400               // 1 天
);
```

### 4. 测试出价

```javascript
// ETH 出价
await nftAuction.placeBid(0, ethers.ZeroAddress, 0, {
  value: ethers.parseEther("0.5")
});

// ERC20 出价
const mockUSDC = await ethers.getContractAt("MockERC20", "0x...");
await mockUSDC.approve(nftAuction.target, ethers.parseUnits("1500", 6));
await nftAuction.placeBid(0, mockUSDC.target, ethers.parseUnits("1500", 6));
```

## 📊 Chainlink 价格源

Sepolia 测试网官方价格源：

| 资产对 | 地址 | 精度 |
|--------|------|------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 8 |
| USDC/USD | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | 8 |

更多价格源：https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet

## 🔧 常见问题

### Q1: 部署失败 - 余额不足
```
Error: insufficient funds for intrinsic transaction cost
```

**解决方案**: 
- 从水龙头获取更多测试 ETH
- 确保至少有 0.1 ETH

### Q2: RPC 请求失败
```
Error: could not detect network
```

**解决方案**:
- 检查 `SEPOLIA_RPC_URL` 是否正确
- 尝试其他 RPC 提供商（Alchemy/Infura）
- 检查网络连接

### Q3: 私钥错误
```
Error: invalid private key
```

**解决方案**:
- 私钥不要包含 `0x` 前缀
- 确保私钥长度为 64 个字符
- 检查是否有多余的空格

### Q4: 合约验证失败
```
Error: Etherscan API Key not found
```

**解决方案**:
- 检查 `.env` 中的 `ETHERSCAN_API_KEY`
- 在 `hardhat.config.cjs` 中配置 `etherscan.apiKey`
- 等待几分钟后重试

### Q5: Gas Price 过高
```
Error: transaction underpriced
```

**解决方案**:
在 `hardhat.config.cjs` 中调整 gas price:
```javascript
sepolia: {
  gasPrice: 30000000000, // 30 Gwei
}
```

### Q6: 代理合约如何验证？

代理合约验证较复杂，建议：
1. 先验证实现合约
2. 在 Etherscan 上手动验证代理：
   - Contract → Code → "Is this a proxy?"
   - 输入实现合约地址

## 💡 最佳实践

### 1. 安全性

- ✅ 使用专门的测试账户
- ✅ 不要在代码中硬编码私钥
- ✅ 确保 `.env` 在 `.gitignore` 中
- ✅ 定期轮换 API Keys

### 2. Gas 优化

- ✅ 在本地充分测试后再部署
- ✅ 使用适当的 gas price
- ✅ 批量操作以节省 gas

### 3. 验证和测试

- ✅ 部署后立即验证合约
- ✅ 在 Etherscan 上测试读写功能
- ✅ 保存所有合约地址
- ✅ 记录交易哈希

### 4. 文档记录

- ✅ 保存 `deployment-sepolia.json`
- ✅ 记录所有配置和环境变量
- ✅ 文档化自定义配置

## 📚 相关资源

### 官方文档
- **Hardhat 文档**: https://hardhat.org/
- **OpenZeppelin Upgrades**: https://docs.openzeppelin.com/upgrades-plugins/
- **Chainlink 数据源**: https://docs.chain.link/data-feeds

### 工具和服务
- **Sepolia 浏览器**: https://sepolia.etherscan.io/
- **Alchemy RPC**: https://www.alchemy.com/
- **Infura RPC**: https://infura.io/
- **Sepolia 水龙头**: https://sepoliafaucet.com/

### 配置文件
- `scripts/SEPOLIA_CONFIG.md` - 详细配置指南
- `hardhat.config.example.cjs` - 配置示例
- `.env.example` - 环境变量示例

## ✅ 部署检查清单

### 部署前
- [ ] 安装所有依赖 (`npm install`)
- [ ] 配置 `.env` 文件
- [ ] 更新 `hardhat.config.cjs`
- [ ] 获取足够的测试 ETH (≥ 0.1)
- [ ] 编译合约 (`npx hardhat compile`)

### 部署中
- [ ] 运行部署脚本
- [ ] 记录所有输出信息
- [ ] 保存交易哈希
- [ ] 检查部署是否成功

### 部署后
- [ ] 验证所有合约
- [ ] 保存 `deployment-sepolia.json`
- [ ] 在 Etherscan 上检查合约
- [ ] 测试基本功能
- [ ] 创建测试拍卖
- [ ] 测试出价功能
- [ ] 记录所有合约地址和链接

## 🎯 后续步骤

1. ✅ 完成 Sepolia 部署和测试
2. 📝 根据测试结果优化合约
3. 📝 准备主网部署脚本
4. 📝 进行安全审计
5. 📝 准备监控和报警系统
6. 📝 编写用户使用文档

---

**🎉 恭喜！** 你已经掌握了在 Sepolia 测试网部署 NFT 拍卖系统的完整流程。

**💬 需要帮助？** 查看 `scripts/SEPOLIA_CONFIG.md` 获取更详细的配置说明。
