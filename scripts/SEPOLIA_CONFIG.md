# 📝 Sepolia 测试网部署配置指南

## 🚀 快速开始

### 1️⃣ 配置 Hardhat

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

### 2️⃣ 安装依赖

```bash
npm install --save-dev dotenv
```

### 3️⃣ 创建 .env 文件

在项目根目录创建 `.env` 文件（不要提交到 Git！）：

```bash
# Sepolia 测试网 RPC URL
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# 部署账户私钥
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# Etherscan API Key（用于验证合约）
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

⚠️ **安全警告**：
- 不要使用主网私钥！
- 不要将 `.env` 文件提交到 Git！
- 确保 `.gitignore` 中包含 `.env`

### 4️⃣ 获取必要资源

#### 🔗 获取 RPC URL

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

#### 💰 获取测试 ETH

从以下水龙头获取免费的 Sepolia ETH：

1. **Alchemy Faucet** (推荐)
   - https://www.alchemy.com/faucets/ethereum-sepolia
   - 需要 Alchemy 账户
   - 每日 0.5 ETH

2. **Sepolia Faucet**
   - https://sepoliafaucet.com/
   - 每日 0.5 ETH

3. **QuickNode Faucet**
   - https://faucet.quicknode.com/ethereum/sepolia
   - 需要 Twitter 账户

4. **Infura Faucet**
   - https://www.infura.io/faucet/sepolia
   - 需要 Infura 账户

💡 **提示**: 建议从多个水龙头获取，确保有足够的 ETH（至少 0.1 ETH）

#### 🔑 获取 Etherscan API Key

1. 访问 https://etherscan.io/
2. 注册/登录账户
3. 访问 https://etherscan.io/myapikey
4. 创建新的 API Key
5. 复制 Key 到 `.env` 文件

#### 🔐 导出私钥

**MetaMask:**
1. 打开 MetaMask
2. 点击账户详情
3. 导出私钥
4. 输入密码
5. 复制私钥（不要包含 `0x` 前缀）

⚠️ **警告**: 只使用测试账户，不要使用存有真实资金的账户！

### 5️⃣ 部署到 Sepolia

```bash
# 运行部署脚本
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

### 6️⃣ 验证合约

部署完成后，使用输出的命令验证合约：

```bash
# 验证 PriceOracleReader
npx hardhat verify --network sepolia 0xYourContractAddress

# 验证 NFTAuction 实现合约
npx hardhat verify --network sepolia 0xYourImplementationAddress

# 验证 MockUSDC
npx hardhat verify --network sepolia 0xYourMockUSDCAddress "Test USDC" "USDC" 6
```

## 📊 Chainlink 价格源（Sepolia）

脚本中使用的官方 Chainlink 价格源：

| 资产对 | 地址 | Etherscan |
|--------|------|-----------|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | [查看](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306) |
| USDC/USD | `0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E` | [查看](https://sepolia.etherscan.io/address/0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E) |

更多价格源: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet

## 🎯 部署后操作

### 1. 查看部署信息

部署成功后会生成 `deployment-sepolia.json` 文件，包含所有合约地址。

### 2. 在 Etherscan 交互

验证合约后，可以直接在 Etherscan 上与合约交互：

1. 访问合约的 Etherscan 页面
2. 点击 "Contract" 标签
3. 点击 "Write Contract" 或 "Read Contract"
4. 连接 MetaMask 进行交互

### 3. 创建测试拍卖

```javascript
// 使用 Hardhat Console
npx hardhat console --network sepolia

// 获取合约实例
const nftAuction = await ethers.getContractAt("NFTAuction", "0xYourProxyAddress");
const mockNFT = await ethers.getContractAt("MockNFT", "0xYourNFTAddress");
const priceOracleReader = await ethers.getContractAt("PriceOracleReader", "0xYourReaderAddress");

// 授权 NFT
await mockNFT.approve(await nftAuction.getAddress(), 0);

// 创建拍卖（起拍价 $1000，持续 1 天）
await nftAuction.createAuction(
  await priceOracleReader.getAddress(),
  await mockNFT.getAddress(),
  0,                    // tokenId
  100000000000n,        // $1000 (8 位小数)
  86400                 // 1 天
);
```

### 4. 测试出价

```javascript
// ETH 出价
await nftAuction.placeBid(0, ethers.ZeroAddress, 0, {
  value: ethers.parseEther("0.5")  // 0.5 ETH
});

// ERC20 出价
const mockUSDC = await ethers.getContractAt("MockERC20", "0xYourUSDCAddress");
const amount = ethers.parseUnits("1500", 6); // 1500 USDC
await mockUSDC.approve(await nftAuction.getAddress(), amount);
await nftAuction.placeBid(0, await mockUSDC.getAddress(), amount);
```

## 🔧 常见问题

### Q1: 交易一直 pending？
**A**: 可能是 gas price 设置过低。在 hardhat.config.cjs 中添加：
```javascript
networks: {
  sepolia: {
    // ...
    gasPrice: 20000000000, // 20 Gwei
  }
}
```

### Q2: 余额不足？
**A**: 从多个水龙头获取测试 ETH，或等待 24 小时后再次请求。

### Q3: RPC 请求失败？
**A**: 
- 检查 RPC URL 是否正确
- Alchemy/Infura 免费账户有请求限制
- 尝试使用其他 RPC 提供商

### Q4: 合约验证失败？
**A**:
- 确保 Etherscan API Key 正确
- 等待几分钟后重试
- 检查构造函数参数是否正确

### Q5: 代理合约如何验证？
**A**: 代理合约可能需要手动验证：
1. 在 Etherscan 上点击 "Contract" → "Code"
2. 选择 "Verify and Publish"
3. 选择 "Proxy" 合约类型
4. 输入实现合约地址

## 📚 相关资源

- **Hardhat 文档**: https://hardhat.org/hardhat-runner/docs/guides/deploying
- **OpenZeppelin Upgrades**: https://docs.openzeppelin.com/upgrades-plugins/
- **Chainlink 价格源**: https://docs.chain.link/data-feeds
- **Etherscan API**: https://docs.etherscan.io/
- **Sepolia 浏览器**: https://sepolia.etherscan.io/

## 🎉 完成后检查清单

- [ ] Hardhat 配置完成
- [ ] .env 文件配置完成
- [ ] 获取足够的测试 ETH（≥ 0.1 ETH）
- [ ] 成功部署所有合约
- [ ] 验证合约成功
- [ ] 保存部署信息（deployment-sepolia.json）
- [ ] 测试创建拍卖功能
- [ ] 测试出价功能
- [ ] 记录所有合约地址

---

**💡 提示**: 测试网部署失败是正常的，多尝试几次。如果遇到问题，检查：
1. 网络连接
2. 账户余额
3. RPC 配置
4. 合约代码编译
