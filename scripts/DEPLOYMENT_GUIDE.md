# 🚀 NFT 拍卖系统完整部署指南

## 📑 目录

- [快速开始](#快速开始)
- [本地部署](#本地部署)
- [Sepolia 测试网部署](#sepolia-测试网部署)
- [部署流程详解](#部署流程详解)
- [部署后操作](#部署后操作)
- [常见问题](#常见问题)
- [最佳实践](#最佳实践)

---

## 快速开始

### 选择部署方式

```bash
# 本地测试
npx hardhat run scripts/deploy-local.js --network hardhat

# Sepolia 测试网
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

---

## 本地部署

### 前置要求

- ✅ Node.js 和 npm
- ✅ 项目依赖已安装

### 部署步骤

#### 1. 安装依赖

```bash
npm install
```

#### 2. 运行部署脚本

```bash
# 方式 1: Hardhat 临时网络（推荐用于快速测试）
npx hardhat run scripts/deploy-local.js --network hardhat

# 方式 2: 本地持久化节点（推荐用于持续开发）
# 终端 1: 启动节点
npx hardhat node

# 终端 2: 部署到本地节点
npx hardhat run scripts/deploy-local.js --network localhost
```

#### 3. 查看部署结果

部署成功后会显示：

```
开始部署 NFT 拍卖系统到本地网络...

📝 合约地址汇总:
   ETH/USD Aggregator:    0x...
   USDC/USD Aggregator:   0x...
   PriceOracleReader:     0x...
   NFTAuction 实现:       0x...
   NFTAuction 代理:       0x...
   MockNFT:               0x...
   MockUSDC:              0x...
   MockFeePolicy:         0x...

🎮 测试账户:
   Deployer:              0x...
   Seller:                0x...
   Bidder1:               0x...
   Bidder2:               0x...
```

### ✅ 部署内容

- ✅ **PriceOracleReader** - 价格预言机读取器
- ✅ **NFTAuction** (UUPS 代理) - 主拍卖合约
- ✅ **MockNFT** - 测试 NFT 合约（Token #0, #1）
- ✅ **MockUSDC** - 测试 ERC20 代币
- ✅ **MockFeePolicy** - 手续费策略（默认 2.5%）
- ✅ **示例拍卖** - 已创建并完成 3 次出价

### 🧪 后续测试

#### 使用 Hardhat Console 交互

```bash
npx hardhat console --network localhost
```

```javascript
// 获取合约实例（使用实际的合约地址替换）
// 方法 1: 直接使用地址字符串（需要先规范化地址）
const proxyAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; // 替换为实际地址
const nftAuction = await ethers.getContractAt("NFTAuction", ethers.getAddress(proxyAddress));

// 方法 2: 使用 hre.ethers（推荐）
const { ethers } = require("hardhat");
const nftAuction = await ethers.getContractAt("NFTAuction", proxyAddress);

// 查看拍卖信息
const auction = await nftAuction.auctions(0);
console.log("最高出价者:", auction.highestBidder);
console.log("最高出价:", ethers.formatEther(auction.highestBid), "ETH");

// 查看剩余时间
const remaining = await nftAuction.getRemainingTime(0);
console.log("剩余时间:", remaining.toString(), "秒");

// 继续出价
const [deployer, seller, bidder1, bidder2] = await ethers.getSigners();
await nftAuction.connect(bidder2).placeBidETH(0, {
  value: ethers.parseEther("0.7")
});
```

---

## Sepolia 测试网部署

### 前置要求

- ✅ Node.js 和 npm
- ✅ Alchemy/Infura RPC URL
- ✅ 测试账户私钥
- ✅ 0.1+ Sepolia ETH
- ✅ Etherscan API Key（可选，用于验证合约）

### 配置步骤

#### 1. 安装依赖

```bash
npm install --save-dev dotenv
```

#### 2. 配置 Hardhat

在 `hardhat.config.cjs` 中添加 Sepolia 网络配置：

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // 本地开发网络
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Sepolia 测试网
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: 20000000000, // 20 Gwei
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};
```

#### 3. 创建环境变量文件

在项目根目录创建 `.env` 文件（**不要提交到 Git！**）：

```bash
# Sepolia 测试网 RPC URL
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
# 或使用 Infura: https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID

# 部署账户私钥（不要包含 0x 前缀）
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# Etherscan API Key（用于验证合约）
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

**安全警告**：
- 不要使用主网私钥！
- 确保 `.gitignore` 中包含 `.env`
- 不要将 `.env` 文件提交到 Git

#### 4. 获取必要资源

##### 🔗 获取 RPC URL

**选项 1: Alchemy (推荐)**
1. 访问 https://www.alchemy.com/
2. 创建免费账户
3. 创建新的 App，选择 Sepolia 网络
4. 复制 HTTPS URL

**选项 2: Infura**
1. 访问 https://infura.io/
2. 创建免费账户
3. 创建新的 Project
4. 复制 Sepolia 端点: `https://sepolia.infura.io/v3/YOUR_PROJECT_ID`

**选项 3: 公共 RPC (不推荐，速度慢)**
```
https://rpc.sepolia.org
https://eth-sepolia.public.blastapi.io
```

##### 获取测试 ETH

从以下水龙头获取免费的 Sepolia ETH：

1. **Google Cloud Faucet**
   - https://cloud.google.com/application/web3/faucet/ethereum/sepolia

##### 获取 Etherscan API Key

1. 访问 https://etherscan.io/
2. 注册/登录账户
3. 访问 https://etherscan.io/myapikey
4. 创建新的 API Key
5. 复制 Key 到 `.env` 文件

##### 导出私钥

**MetaMask:**

1. 打开 MetaMask
2. 点击账户详情
3. 导出私钥
4. 输入密码
5. 复制私钥（**不要包含 `0x` 前缀**）

**警告**: 只使用测试账户，不要使用存有真实资金的账户！

### 部署步骤

#### 1. 检查配置

```bash
# 检查 .env 文件
cat .env

# 编译合约
npx hardhat compile
```

#### 2. 运行部署脚本

```bash
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

#### 3. 验证合约（可选但推荐）

部署完成后，使用输出的命令验证合约：

```bash
# 验证 PriceOracleReader
npx hardhat verify --network sepolia <PRICE_ORACLE_READER_ADDRESS>

# 验证 NFTAuction 实现合约
npx hardhat verify --network sepolia <NFT_AUCTION_IMPL_ADDRESS>

# 验证 NFTAuction 代理合约（需要手动验证）
# 在 Etherscan 上：Contract → Code → "Is this a proxy?" → 输入实现合约地址

# 验证 MockNFT
npx hardhat verify --network sepolia <MOCK_NFT_ADDRESS>

# 验证 MockUSDC
npx hardhat verify --network sepolia <MOCK_USDC_ADDRESS> "Test USDC" "USDC" 6

# 验证 MockFeePolicy
npx hardhat verify --network sepolia <MOCK_FEE_POLICY_ADDRESS> <FEE_AMOUNT> <FEE_RECIPIENT>
```

### ✅ 部署内容

- ✅ **PriceOracleReader** - 价格预言机读取器
- ✅ **NFTAuction** (UUPS 代理) - 主拍卖合约
- ✅ **MockNFT** - 测试 NFT 合约
- ✅ **MockUSDC** - 测试 ERC20 代币
- ✅ **MockFeePolicy** - 手续费策略（默认 2.5%）
- ✅ **部署信息 JSON** - 自动生成 `deployment-sepolia.json`

### Chainlink 价格源

Sepolia 测试网使用的官方 Chainlink 价格源：

| 资产对 | 地址 | Etherscan |
|--------|------|-----------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | [查看](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306) |
| USDC/USD | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | [查看](https://sepolia.etherscan.io/address/0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E) |

更多价格源: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet

---

## 部署流程详解

### 完整部署流程

#### 部署价格预言机

**本地部署**：使用 Mock Chainlink Aggregators
```javascript
// ETH/USD: $2800
const mockETHUSD = await MockV3Aggregator.deploy(8, 280000000000n);

// USDC/USD: $0.9998
const mockUSDCUSD = await MockV3Aggregator.deploy(8, 99977674n);
```

**Sepolia 部署**：使用 Chainlink 官方价格源
```javascript
// 使用预定义的 Chainlink 地址
const CHAINLINK_FEEDS = {
  ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
};
```

#### 2️⃣ 部署 PriceOracleReader

```javascript
const PriceOracleReader = await ethers.getContractFactory("PriceOracleReader");
const priceOracleReader = await PriceOracleReader.deploy();
await priceOracleReader.waitForDeployment();

// 设置 ETH 价格源
await priceOracleReader.setEthPriceFeed(ethPriceFeedAddress);
```

#### 3️⃣ 部署 NFTAuction（UUPS 代理模式）

```javascript
// 部署实现合约
const NFTAuction = await ethers.getContractFactory("NFTAuction");
const nftAuctionImpl = await NFTAuction.deploy();
await nftAuctionImpl.waitForDeployment();

// 部署代理合约
const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
const initData = nftAuctionImpl.interface.encodeFunctionData("initialize", []);
const proxy = await ERC1967Proxy.deploy(
  await nftAuctionImpl.getAddress(),
  initData
);
await proxy.waitForDeployment();

// 获取代理实例
const nftAuction = await ethers.getContractAt(
  "NFTAuction",
  await proxy.getAddress()
);
```

#### 4️⃣ 部署测试资产

```javascript
// MockNFT
const MockNFT = await ethers.getContractFactory("MockNFT");
const mockNFT = await MockNFT.deploy();
await mockNFT.waitForDeployment();

// MockUSDC
const MockERC20 = await ethers.getContractFactory("MockERC20");
const mockUSDC = await MockERC20.deploy("Test USDC", "USDC", 6);
await mockUSDC.waitForDeployment();
```

#### 5️⃣ 配置价格源

```javascript
// 设置 USDC 价格源
await priceOracleReader.setTokenPriceFeed(
  await mockUSDC.getAddress(),
  usdcPriceFeedAddress
);
```

#### 6️⃣ 部署 MockFeePolicy（手续费策略）

```javascript
const MockFeePolicy = await ethers.getContractFactory("MockFeePolicy");
// 默认手续费：2.5% (0.025 ETH per 1 ETH)
const defaultFeeAmount = ethers.parseEther("0.025");
const mockFeePolicy = await MockFeePolicy.deploy(
  defaultFeeAmount,
  deployer.address // 手续费归集地址
);
await mockFeePolicy.waitForDeployment();

// 设置手续费策略到 NFTAuction
await nftAuction.setFeePolicy(await mockFeePolicy.getAddress());
```

#### 7️⃣ 准备测试资产

```javascript
// Mint NFT 给卖家
await mockNFT.mint(seller.address);  // Token #0
await mockNFT.mint(seller.address);  // Token #1

// Mint USDC 给出价者
const usdcAmount = ethers.parseUnits("10000", 6);
await mockUSDC.mint(bidder1.address, usdcAmount);
await mockUSDC.mint(bidder2.address, usdcAmount);
```

#### 8️⃣ 创建示例拍卖

```javascript
// 卖家授权 NFT
await mockNFT.connect(seller).approve(
  await nftAuction.getAddress(),
  0
);

// 创建拍卖
const startPriceUSD = 1000n * 10n**8n; // $1000 (8 位小数)
const duration = 3600; // 1 小时

await nftAuction.connect(seller).createAuction(
  await priceOracleReader.getAddress(),
  await mockNFT.getAddress(),
  0,              // tokenId
  startPriceUSD,
  duration
);
```

#### 9️⃣ 模拟出价

```javascript
// Bidder1: 0.5 ETH (~$1400)
await nftAuction.connect(bidder1).placeBidETH(0, {
  value: ethers.parseEther("0.5")
});

// Bidder2: 1500 USDC (~$1500)
const usdcBid = ethers.parseUnits("1500", 6);
await mockUSDC.connect(bidder2).approve(
  await nftAuction.getAddress(),
  usdcBid
);
await nftAuction.connect(bidder2).placeBidToken(
  0,
  await mockUSDC.getAddress(),
  usdcBid
);

// Bidder1: 0.6 ETH (~$1680)
await nftAuction.connect(bidder1).placeBidETH(0, {
  value: ethers.parseEther("0.6")
});
```

---

## 部署后操作

### 查看部署信息

**本地部署**：查看控制台输出

**Sepolia 部署**：查看 `deployment-sepolia.json` 文件

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
    "mockUSDC": "0x...",
    "mockFeePolicy": "0x..."
  },
  "feePolicy": {
    "address": "0x...",
    "defaultFeeAmount": "25000000000000000",
    "feeRecipient": "0x..."
  },
  "chainlink": { ... },
  "etherscan": { ... }
}
```

### 在 Etherscan 查看（Sepolia）

部署成功后访问：
```
https://sepolia.etherscan.io/address/<YOUR_CONTRACT_ADDRESS>
```

验证合约后可以直接在 Etherscan 上交互：
1. 访问合约的 Etherscan 页面
2. 点击 "Contract" 标签
3. 点击 "Write Contract" 或 "Read Contract"
4. 连接 MetaMask 进行交互

### 创建测试拍卖

#### 使用 Hardhat Console

```bash
npx hardhat console --network localhost  # 本地
# 或
npx hardhat console --network sepolia    # Sepolia
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
  100000000000n,      // $1000 (8 位小数)
  86400               // 1 天
);
```

### 测试出价

```javascript
// ETH 出价
await nftAuction.placeBidETH(0, {
  value: ethers.parseEther("0.5")
});

// ERC20 出价
const mockUSDC = await ethers.getContractAt("MockERC20", "0x...");
const amount = ethers.parseUnits("1500", 6); // 1500 USDC
await mockUSDC.approve(await nftAuction.getAddress(), amount);
await nftAuction.placeBidToken(0, await mockUSDC.getAddress(), amount);
```

### 管理手续费策略

#### 查看当前手续费策略

```javascript
const currentPolicy = await nftAuction.feePolicy();
console.log("当前手续费策略:", currentPolicy);
```

#### 禁用手续费

```javascript
await nftAuction.setFeePolicy(ethers.ZeroAddress);
```

#### 更新手续费策略

```javascript
// 部署新的手续费策略
const newPolicy = await MockFeePolicy.deploy(
  ethers.parseEther("0.05"),  // 5% 手续费
  newRecipientAddress
);
await newPolicy.waitForDeployment();

// 设置到 NFTAuction
await nftAuction.setFeePolicy(await newPolicy.getAddress());
```

#### 提取累计手续费

```javascript
// 查看累计手续费
const accruedFees = await nftAuction.accruedFees(ethers.ZeroAddress);
console.log("累计 ETH 手续费:", ethers.formatEther(accruedFees));

// 提取手续费（仅管理员）
await nftAuction.withdrawFees(
  ethers.ZeroAddress,  // ETH
  recipientAddress,
  amount
);
```

### 查询拍卖信息

```javascript
// 获取单个拍卖详情
const [auction, remainingTime] = await nftAuction.getAuctionDetail(0);
console.log("卖家:", auction.seller);
console.log("最高出价者:", auction.highestBidder);
console.log("最高出价:", ethers.formatEther(auction.highestBid));
console.log("剩余时间:", remainingTime.toString(), "秒");

// 批量查询拍卖详情
const [auctions, remainingTimes] = await nftAuction.getAuctionsDetail([0, 1, 2]);
```

---

### 🎯 部署检查清单

#### 部署前
- [ ] 安装所有依赖 (`npm install`)
- [ ] 配置 `.env` 文件（Sepolia）
- [ ] 更新 `hardhat.config.cjs`（Sepolia）
- [ ] 获取足够的测试 ETH（≥ 0.1，Sepolia）
- [ ] 编译合约 (`npx hardhat compile`)
- [ ] 运行测试 (`npx hardhat test`)

#### 部署中
- [ ] 运行部署脚本
- [ ] 记录所有输出信息
- [ ] 保存交易哈希
- [ ] 检查部署是否成功

#### 部署后
- [ ] 验证所有合约（Sepolia）
- [ ] 保存部署信息 JSON
- [ ] 在 Etherscan 上检查合约（Sepolia）
- [ ] 测试基本功能
- [ ] 创建测试拍卖
- [ ] 测试出价功能
- [ ] 测试手续费功能
- [ ] 记录所有合约地址和链接
