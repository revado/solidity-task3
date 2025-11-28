# 🎨 NFT 拍卖系统

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.27.0-yellow.svg)](https://hardhat.org/)
[![License](https://img.shields.io/badge/License-UNLICENSED-red.svg)](LICENSE)
[![Coverage](https://img.shields.io/badge/Coverage-95%25-green.svg)](coverage)

一个基于以太坊的去中心化 NFT 拍卖系统，支持多币种竞价、Chainlink 价格预言机集成、UUPS 可升级架构和灵活的手续费策略。

## 📋 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [项目结构](#项目结构)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [核心 API](#核心-api)
- [事件](#事件)
- [依赖](#依赖)
- [测试](#测试)
- [生命周期](#生命周期)
- [完整工作流程](#完整工作流程)
- [安全机制](#安全机制)
- [Gas 优化](#gas-优化)
- [部署](#部署)

---

## 项目简介

NFT 拍卖系统是一个功能完整的去中心化拍卖平台，允许用户使用任何 ERC721 NFT 创建拍卖，并支持使用 ETH 或任何配置了 Chainlink 价格源的 ERC20 代币进行竞价。系统采用 UUPS 可升级架构，支持合约升级，并集成了灵活的手续费策略机制。

### ✨ 主要特性

- 🎯 **多币种竞价**: 支持 ETH 和 ERC20 代币出价，自动进行美元价值比较
- 🔗 **Chainlink 集成**: 使用 Chainlink 价格预言机确保价格准确性
- 🔄 **UUPS 可升级**: 基于 OpenZeppelin UUPS 代理模式，支持合约升级
- 💰 **手续费策略**: 可配置的手续费机制，支持动态调整
- 🛡️ **安全防护**: 多重安全机制，包括重入攻击防护、CEI 模式等
- ⚡ **Gas 优化**: 使用自定义错误、存储优化等技术降低 Gas 消耗

---

## 核心功能

### 1. 拍卖创建

- 任何 ERC721 NFT 所有者都可以创建拍卖
- 支持自定义起拍价（美元计价，8 位小数）
- 每个拍卖绑定独立的价格预言机读取器

### 2. 多币种竞价

- **ETH 竞价**: 使用 `placeBidETH()` 函数，直接发送 ETH
- **ERC20 竞价**: 使用 `placeBidToken()` 函数，支持任何配置了价格源的 ERC20 代币
- **自动转换**: 所有出价自动转换为美元价值进行比较
- **币种切换**: 支持在 ETH 和 ERC20 之间自由切换出价

### 3. 价格预言机

- 集成 Chainlink 价格源
- 自动验证价格数据新鲜度（1 小时时效性检查）
- 支持多个 ERC20 代币的价格源配置
- 价格数据异常检测

### 4. 手续费管理

- 可配置的手续费策略（`IFeePolicy` 接口）
- 支持动态设置和更新手续费策略
- 手续费自动累计，管理员可提取
- 支持禁用手续费（设置为 `address(0)`）

### 5. 拍卖结算

- 自动或手动结束拍卖
- 无人出价时自动退回 NFT 给卖家
- 有出价时自动转移 NFT 给最高出价者
- 自动计算和分配手续费

### 6. 合约升级

- UUPS 代理模式，支持无状态迁移升级
- 仅管理员可执行升级
- 保持合约地址不变

---

## 项目结构

```
nft-auction/
├── contracts/
│   ├── NFTAuction.sol                # 主拍卖合约（UUPS 可升级）
│   ├── PriceOracleReader.sol         # 价格预言机读取器
│   ├── ERC1967Proxy.sol              # UUPS 代理合约（用于本地测试）
│   ├── interfaces/
│   │   ├── IFeePolicy.sol            # 手续费策略接口
│   │   └── IPriceOracleReader.sol    # 价格预言机读取器接口
│   └── mocks/
│       ├── MockNFT.sol               # 测试用 ERC721 NFT
│       ├── MockERC20.sol             # 测试用 ERC20 代币
│       ├── MockV3Aggregator.sol      # Chainlink 价格源 Mock
│       ├── MockFaultyAggregator.sol  # 故障价格源 Mock（测试用）
│       └── MockFeePolicy.sol         # 手续费策略 Mock
├── test/
│   ├── NFTAuction.test.js            # 核心功能测试
│   ├── NFTAuction_price.test.js      # 价格相关测试
│   ├── NFTAuction_upgrade.test.js    # 升级功能测试
│   ├── NFTAuction_additional.test.js # 补充测试
│   └── PriceOracleReader.test.js     # 价格预言机测试
├── scripts/
│   ├── deploy-local.js               # 本地部署脚本
│   ├── deploy-sepolia.js             # Sepolia 测试网部署脚本
│   └── DEPLOYMENT_GUIDE.md           # 部署指南
├── coverage/                         # 测试覆盖率报告
├── hardhat.config.cjs                # Hardhat 配置
└── package.json                      # 项目依赖
```

---

## 系统架构

### 核心模块交互

```
┌─────────────────┐
│   NFTAuction    │  ← 主拍卖合约（UUPS 代理）
│   (UUPS Proxy)  │
└────────┬────────┘
         │
         ├──→ ┌──────────────────┐
         │    │ PriceOracleReader │  ← 价格预言机读取器
         │    └──────────────────┘
         │
         ├──→ ┌──────────────┐
         │    │  IFeePolicy  │  ← 手续费策略接口
         │    └──────────────┘
         │
         ├──→ ┌──────────────┐
         │    │   IERC721     │  ← NFT 合约
         │    └──────────────┘
         │
         └──→ ┌──────────────┐
              │   IERC20      │  ← ERC20 代币（可选）
              └──────────────┘
```

### 数据流

1. **创建拍卖流程**:

   ```
   NFT Owner → createAuction() → NFTAuction
   NFT 转移 → NFTAuction (托管)
   价格源绑定 → PriceOracleReader
   ```

2. **竞价流程**:

   ```
   Bidder → placeBidETH/placeBidToken() → NFTAuction
   NFTAuction → PriceOracleReader (查询价格)
   NFTAuction → 验证出价 → 更新状态 → 退款前一个出价者
   ```

3. **结束拍卖流程**:

   ```
   Seller/Admin → endAuction() → NFTAuction
   NFTAuction → IFeePolicy (计算手续费)
   NFTAuction → 转移 NFT → 结算资金 → 累计手续费
   ```

---

## 快速开始

### 前置要求

- Node.js >= 16.0.0
- npm >= 7.0.0
- Hardhat >= 2.27.0

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd nft-auction

# 安装依赖
npm install
```

### 编译合约

```bash
npx hardhat compile
```

### 运行测试

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/NFTAuction.test.js

# 生成测试覆盖率报告
npx hardhat coverage
```

### 本地部署

```bash
# 快速部署到本地 Hardhat 网络
npx hardhat run scripts/deploy-local.js --network hardhat
```

详细部署指南请参考 [部署指南](scripts/DEPLOYMENT_GUIDE.md)

---

## 核心 API

### NFTAuction 合约

#### 创建拍卖

```solidity
function createAuction(
    address _priceOracleReader,  // 价格预言机读取器地址
    address _nftContract,        // NFT 合约地址
    uint256 _tokenId,            // NFT Token ID
    uint256 _startPrice,         // 起拍价（美元，8 位小数）
    uint256 _duration            // 持续时间（秒，≥ 600）
) external
```

**示例**:

```javascript
await nftAuction.createAuction(
  priceOracleReaderAddress,
  nftContractAddress,
  0,                    // tokenId
  100000000000n,        // $1000 (8 位小数)
  3600                  // 1 小时
);
```

#### ETH 竞价

```solidity
function placeBidETH(uint256 _auctionId) external payable
```

**示例**:

```javascript
await nftAuction.placeBidETH(0, {
  value: ethers.parseEther("0.5")  // 0.5 ETH
});
```

#### ERC20 代币竞价

```solidity
function placeBidToken(
    uint256 _auctionId,
    address _token,     // ERC20 代币地址
    uint256 amount      // 代币数量
) external
```

**示例**:

```javascript
// 先授权
await mockUSDC.approve(nftAuctionAddress, ethers.parseUnits("1500", 6));

// 出价
await nftAuction.placeBidToken(
  0,
  mockUSDCAddress,
  ethers.parseUnits("1500", 6)  // 1500 USDC
);
```

#### 结束拍卖

```solidity
function endAuction(uint256 _auctionId) external
```

**权限**: 卖家或管理员

**示例**:
```javascript
await nftAuction.endAuction(0);
```

#### 查询函数

```solidity
// 获取拍卖信息
function auctions(uint256 _auctionId) external view returns (Auction memory)

// 获取单个拍卖详情及剩余时间
function getAuctionDetail(uint256 _auctionId) external view returns (Auction memory auction, uint256 remainingTime)

// 批量获取拍卖详情
function getAuctionsDetail(uint256[] calldata auctionIds) external view returns (Auction[] memory auctionList, uint256[] memory remainingTimes)

// 获取剩余时间
function getRemainingTime(uint256 _auctionId) external view returns (uint256)
```

#### 手续费管理

```solidity
// 设置手续费策略（仅管理员）
function setFeePolicy(address _policy) external

// 提取累计手续费（仅管理员）
function withdrawFees(address token, address to, uint256 amount) external

// 查看累计手续费
function accruedFees(address token) external view returns (uint256)
```

### PriceOracleReader 合约

```solidity
// 设置 ETH 价格源（仅 Owner）
function setEthPriceFeed(address _ethPriceFeed) external

// 设置 ERC20 代币价格源（仅 Owner）
function setTokenPriceFeed(address token, address feed) external

// 获取 ETH 的美元价值
function getEthValueInUSD(uint256 ethAmount) external view returns (uint256)

// 获取 ERC20 代币的美元价值
function getTokenValueInUSD(address token, uint256 amount) external view returns (uint256)

// 检查价格源是否设置
function isPriceFeedSet(address token) external view returns (bool)
```

---

## 事件

### NFTAuction 事件

```solidity
// 拍卖创建
event AuctionCreated(
    uint256 indexed auctionId,
    address indexed seller,
    uint256 startPrice
);

// 新的最高出价
event NewHighestBid(
    uint256 indexed auctionId,
    address indexed bidder,
    uint256 amount,
    address token
);

// 拍卖结束
event AuctionEnded(
    uint256 indexed auctionId,
    address indexed winner,
    uint256 finalPrice
);

// 手续费策略更新
event FeePolicyUpdated(address indexed newPolicy);

// 手续费累计
event FeeAccrued(
    uint256 indexed auctionId,
    address indexed token,
    address indexed recipient,
    uint256 amount
);

// 手续费提取
event FeeWithdrawn(
    address indexed token,
    address indexed to,
    uint256 amount
);
```

### PriceOracleReader 事件

```solidity
// 价格源更新
event PriceFeedUpdated(
    address indexed token,
    address indexed feed
);
```

### 监听事件示例

```javascript
// 监听拍卖创建
nftAuction.on("AuctionCreated", (auctionId, seller, startPrice) => {
  console.log(`拍卖 #${auctionId} 已创建，卖家: ${seller}`);
});

// 监听新的最高出价
nftAuction.on("NewHighestBid", (auctionId, bidder, amount, token) => {
  console.log(`拍卖 #${auctionId} 新出价: ${ethers.formatEther(amount)}`);
});
```

---

## 依赖

### 生产依赖

```json
{
  "@chainlink/contracts": "^1.5.0",                 // Chainlink 价格源接口
  "@openzeppelin/contracts": "^5.4.0",              // OpenZeppelin 标准库
  "@openzeppelin/contracts-upgradeable": "^5.4.0",  // 可升级合约库
  "@openzeppelin/hardhat-upgrades": "^3.5.0"        // Hardhat 升级插件
}
```

### 开发依赖

```json
{
  "@nomicfoundation/hardhat-toolbox": "^6.1.0",
  "@nomicfoundation/hardhat-ethers": "^3.1.2",
  "@nomicfoundation/hardhat-network-helpers": "^1.1.2",
  "hardhat": "^2.27.0",
  "ethers": "^6.15.0",
  "chai": "^4.5.0",
  "solidity-coverage": "^0.8.16",
  "hardhat-gas-reporter": "^2.3.0"
}
```

### 关键依赖说明

- **OpenZeppelin Contracts**: 提供经过审计的标准合约实现
- **OpenZeppelin Upgrades**: 支持 UUPS 代理模式升级
- **Chainlink Contracts**: Chainlink 价格源接口定义
- **Hardhat**: 开发、测试和部署框架
- **Ethers.js**: 以太坊交互库

---

## 测试

### 运行测试

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/NFTAuction.test.js

# 运行测试并显示 Gas 报告
REPORT_GAS=true npx hardhat test

# 生成测试覆盖率报告
npx hardhat coverage
```

### 测试覆盖率

当前测试覆盖率：

```
---------------------------|----------|----------|----------|----------|
File                       |  % Stmts | % Branch |  % Funcs |  % Lines |
---------------------------|----------|----------|----------|----------|
contracts/                 |      100 |    96.08 |      100 |      100 |
  ERC1967Proxy.sol         |      100 |      100 |      100 |      100 |
  NFTAuction.sol           |      100 |    95.24 |      100 |      100 |
  PriceOracleReader.sol   |      100 |      100 |      100 |      100 |
---------------------------|----------|----------|----------|----------|
All files                  |      100 |    95.28 |      100 |     92.56 |
---------------------------|----------|----------|----------|----------|
```

### 测试文件说明

- **NFTAuction.test.js**: 核心功能测试（创建拍卖、竞价、结束拍卖）
- **NFTAuction_price.test.js**: 价格相关测试（多币种竞价、价格转换）
- **NFTAuction_upgrade.test.js**: 合约升级测试（UUPS 升级流程）
- **NFTAuction_additional.test.js**: 补充测试（边界情况、手续费、重入攻击防护）
- **PriceOracleReader.test.js**: 价格预言机测试（价格查询、时效性验证）

---

## 生命周期

### 拍卖生命周期

```
1. 创建阶段
   └─> NFT Owner 调用 createAuction()
       └─> NFT 转移到合约托管
       └─> 创建拍卖记录
       └─> 触发 AuctionCreated 事件

2. 竞价阶段
   └─> Bidder 调用 placeBidETH() 或 placeBidToken()
       └─> 验证出价条件
       └─> 转换为美元价值比较
       └─> 更新最高出价
       └─> 退款前一个出价者
       └─> 触发 NewHighestBid 事件

3. 结束阶段
   └─> Seller/Admin 调用 endAuction()
       └─> 验证拍卖已结束
       └─> 计算手续费
       └─> 转移 NFT 给最高出价者
       └─> 结算资金给卖家
       └─> 累计手续费
       └─> 触发 AuctionEnded 事件
```

### 合约生命周期

```
1. 部署阶段
   └─> 部署实现合约
   └─> 部署代理合约
   └─> 调用 initialize()

2. 运行阶段
   └─> 创建拍卖
   └─> 处理竞价
   └─> 结束拍卖
   └─> 管理手续费

3. 升级阶段（可选）
   └─> 部署新实现合约
   └─> 调用 upgradeTo()
   └─> 验证升级成功
```

---

## 完整工作流程

### 场景：完整的拍卖流程

#### 1. 初始设置

```javascript
// 部署合约
const nftAuction = await deployProxy();
const priceOracleReader = await deployPriceOracleReader();
const mockNFT = await deployMockNFT();

// 配置价格源
await priceOracleReader.setEthPriceFeed(ethPriceFeedAddress);
await priceOracleReader.setTokenPriceFeed(usdcAddress, usdcPriceFeedAddress);

// 设置手续费策略（可选）
const feePolicy = await deployMockFeePolicy(ethers.parseEther("0.025"), admin);
await nftAuction.setFeePolicy(await feePolicy.getAddress());
```

#### 2. 创建拍卖

```javascript
// 卖家准备
await mockNFT.mint(seller.address);
await mockNFT.connect(seller).approve(nftAuctionAddress, 0);

// 创建拍卖
await nftAuction.connect(seller).createAuction(
  priceOracleReaderAddress,
  mockNFTAddress,
  0,                    // tokenId
  100000000000n,        // $1000 起拍价
  86400                 // 1 天
);
```

#### 3. 竞价过程

```javascript
// Bidder1: ETH 出价 $1400
await nftAuction.connect(bidder1).placeBidETH(0, {
  value: ethers.parseEther("0.5")  // 假设 ETH = $2800
});

// Bidder2: USDC 出价 $1500
await mockUSDC.connect(bidder2).approve(nftAuctionAddress, ethers.parseUnits("1500", 6));
await nftAuction.connect(bidder2).placeBidToken(
  0,
  mockUSDCAddress,
  ethers.parseUnits("1500", 6)
);

// Bidder1: 再次 ETH 出价 $1680
await nftAuction.connect(bidder1).placeBidETH(0, {
  value: ethers.parseEther("0.6")
});
```

#### 4. 结束拍卖

```javascript
// 等待拍卖结束或手动结束
await time.increase(86400 + 1);  // 1 天后

// 结束拍卖
await nftAuction.endAuction(0);

// 结果：
// - NFT 转移给 Bidder1
// - 资金结算给卖家（扣除手续费）
// - 手续费累计到合约
```

#### 5. 提取手续费

```javascript
// 管理员提取手续费
const accruedFees = await nftAuction.accruedFees(ethers.ZeroAddress);
await nftAuction.withdrawFees(
  ethers.ZeroAddress,  // ETH
  adminAddress,
  accruedFees
);
```

---

## 安全机制

### 1. 重入攻击防护

系统采用多重防护机制防止重入攻击：

- **ReentrancyGuard 保护**: 使用 OpenZeppelin 的 `ReentrancyGuardUpgradeable`，所有状态修改函数都使用 `nonReentrant` 修饰符保护
- **CEI 模式**: 严格遵循检查-效果-交互（Checks-Effects-Interactions）模式，先更新状态再执行外部调用
- **Gas 限制**: 使用 `transfer()` 进行退款，限制 Gas 为 2300，有效防止复杂重入攻击
- **状态锁定**: 在关键操作期间锁定重入状态，确保原子性执行

### 2. 访问控制

完善的权限管理系统：

- **管理员权限**: 合约初始化时设置管理员地址，仅管理员可执行敏感操作
- **升级权限**: 仅管理员可通过 UUPS 模式升级合约实现
- **手续费管理**: 仅管理员可设置和更新手续费策略，提取累计手续费
- **拍卖结束**: 卖家或管理员可在拍卖结束后调用结束函数，防止恶意操作

### 3. 输入验证

全面的输入参数验证：

- **地址验证**: 所有地址参数都进行零地址检查，防止无效地址导致的错误
- **数值验证**: 起拍价必须大于 0，拍卖时长至少 10 分钟，确保拍卖参数合理
- **所有权验证**: 创建拍卖时验证调用者是否为 NFT 所有者，防止未授权操作
- **状态验证**: 竞价和结束拍卖时验证拍卖状态，防止对已结束或过期的拍卖进行操作

### 4. 价格数据验证

价格预言机数据的安全验证：

- **时效性检查**: 价格数据必须在一小时内更新，超过时效的数据会被拒绝，防止使用过时价格
- **有效性检查**: 验证价格数据是否为正数，拒绝无效或异常的价格数据
- **数据完整性**: 检查 Chainlink 价格源的 `roundId` 和 `answeredInRound` 是否匹配，确保数据一致性
- **异常处理**: 对价格查询失败的情况进行适当处理，防止系统因价格源故障而瘫痪

### 5. 安全转账

使用经过审计的安全转账机制：

- **SafeERC20**: 使用 OpenZeppelin 的 `SafeERC20` 库处理 ERC20 转账，自动处理非标准代币的返回值
- **ETH 转账**: 使用 `call()` 进行 ETH 转账，并检查返回值，确保转账成功
- **错误处理**: 转账失败时使用自定义错误回退，提供清晰的错误信息
- **Gas 优化**: 在保证安全的前提下，优化转账操作的 Gas 消耗

### 6. 拒绝直接转账

防止意外或恶意的直接转账：

- **receive 函数**: 实现 `receive()` 函数并直接回退，拒绝直接发送 ETH，要求使用专门的竞价函数
- **fallback 函数**: 实现 `fallback()` 函数拒绝未知函数调用，防止误操作
- **明确指引**: 错误消息明确告知用户应使用的正确函数，提升用户体验

### 7. 自定义错误

使用自定义错误替代字符串错误消息：

- **Gas 优化**: 自定义错误比字符串消息消耗更少的 Gas，特别是在部署时
- **类型安全**: 编译时检查错误类型，减少运行时错误
- **清晰明确**: 错误名称清晰表达错误原因，便于调试和前端处理

---

## Gas 优化

1. **自定义错误**。使用自定义错误替代 `require` 语句的字符串消息

2. **存储优化**。将多个小类型变量打包到同一个存储槽中

3. **缓存存储变量**。在函数中多次使用同一个存储变量时，先将其读取到内存中缓存，然后使用缓存变量而不是重复读取存储

4. **批量操作**。提供批量查询函数，允许在一次调用中获取多个拍卖的详细信息

5. **使用 unchecked 块**。在循环计数器等安全场景下使用 `unchecked` 块

6. **事件优化**。合理使用 `indexed` 参数。事件参数最多有 3 个 `indexed` 参数

7. **函数可见性**。将不需要外部调用的函数设置为 `private` 或 `internal`，将只读函数设置为 `view` 或 `pure`

---

## 部署

### 本地部署

```bash
npx hardhat run scripts/deploy-local.js --network hardhat
```

### Sepolia 测试网部署

```bash
# 1. 配置 .env 文件
# 2. 运行部署脚本
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

详细部署指南请参考 [DEPLOYMENT_GUIDE.md](scripts/DEPLOYMENT_GUIDE.md)

---
