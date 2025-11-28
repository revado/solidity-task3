# ⚡ 快速开始指南

## 🎯 选择部署方式

```bash
# 本地测试（最快）
npx hardhat run scripts/deploy-local.js --network hardhat

# Sepolia 测试网（需要配置）
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

## 📦 本地部署（5 分钟）

### 1. 安装依赖
```bash
npm install
```

### 2. 运行部署
```bash
npx hardhat run scripts/deploy-local.js --network hardhat
```

✅ **完成！** 所有合约已部署，示例拍卖已创建。

### 3. 查看结果
- ✅ NFTAuction 代理合约
- ✅ PriceOracleReader
- ✅ MockNFT (Token #0, #1)
- ✅ MockUSDC
- ✅ 示例拍卖（3 次出价完成）

## 🌐 Sepolia 部署（15 分钟）

### 1. 安装依赖
```bash
npm install --save-dev dotenv
```

### 2. 配置环境变量

创建 `.env`:
```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_private_key_without_0x
ETHERSCAN_API_KEY=your_etherscan_key
```

### 3. 更新 Hardhat 配置

在 `hardhat.config.cjs` 中添加：
```javascript
require("dotenv").config();

module.exports = {
  // ... 现有配置
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: { sepolia: process.env.ETHERSCAN_API_KEY || "" },
  },
};
```

参考 `hardhat.config.example.cjs`

### 4. 获取测试 ETH

从水龙头获取 0.1+ ETH：
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://sepoliafaucet.com/

### 5. 部署
```bash
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

### 6. 验证合约
使用输出的命令验证：
```bash
npx hardhat verify --network sepolia <ADDRESS>
```

## 📋 需要的资源

### 本地部署
- ✅ Node.js 和 npm
- ✅ 项目依赖

### Sepolia 部署
- ✅ Alchemy/Infura RPC URL
- ✅ 测试账户私钥
- ✅ 0.1+ Sepolia ETH
- ✅ Etherscan API Key（可选）

## 🆘 获取帮助

### 详细文档
- `scripts/README_DEPLOY.md` - 完整部署指南
- `scripts/SEPOLIA_CONFIG.md` - Sepolia 配置详解

### 获取资源
- **RPC**: https://www.alchemy.com/
- **测试 ETH**: https://sepoliafaucet.com/
- **API Key**: https://etherscan.io/myapikey

### 常见问题

**Q: 本地部署失败？**
```bash
# 清理缓存重试
npx hardhat clean
npx hardhat compile
npx hardhat run scripts/deploy-local.js --network hardhat
```

**Q: Sepolia 余额不足？**
- 从多个水龙头获取测试 ETH
- 等待 24 小时后再次尝试

**Q: RPC 连接失败？**
- 检查 `.env` 中的 URL
- 尝试其他 RPC 提供商

## 🎉 部署成功后

### 本地测试
```bash
# 继续在 Hardhat Console 交互
npx hardhat console --network localhost

# 运行测试
npx hardhat test
```

### Sepolia 测试网
1. 在 Etherscan 查看合约
2. 验证合约代码
3. 创建测试拍卖
4. 邀请他人测试出价

## 📊 脚本对比

| 特性 | 本地部署 | Sepolia 部署 |
|------|---------|-------------|
| 速度 | ⚡ 快 | 🐌 慢 (链上确认) |
| 费用 | 💰 免费 | 💰 需要测试 ETH |
| 持久性 | ❌ 临时 | ✅ 永久 |
| 验证 | ❌ 不需要 | ✅ 可验证 |
| 分享 | ❌ 本地 | ✅ 公开可访问 |
| 适用 | 开发测试 | 演示和集成测试 |

## 💡 推荐流程

```
1. 本地开发和测试
   ↓
2. 本地部署验证
   ↓
3. Sepolia 测试网部署
   ↓
4. 邀请测试和收集反馈
   ↓
5. 安全审计
   ↓
6. 主网部署
```

---

**快速链接**:
- 📖 [完整文档](README_DEPLOY.md)
- 🔧 [Sepolia 配置](SEPOLIA_CONFIG.md)
- 💻 [配置示例](../hardhat.config.example.cjs)
