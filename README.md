# NFT 拍卖合约

TODO: 简介

## 功能说明

- **UUPS 可升级架构**：`NFTAuction` 基于 UUPSUpgradeable，实现 `initialize` 初始化管理员及 ReentrancyGuard，`_authorizeUpgrade` 限定管理员升级。
- **多资产拍卖**：支持任何 ERC721，卖家调用 `createAuction` 设定起拍价（美元 8 位小数）、持续时间（>10 分钟）。竞价可使用 ETH 或任何配置了 Chainlink 预言机的 ERC20。
- **Chainlink 报价校验**：`setPriceFeed` 仅允许管理员设置，部署时进行 `latestRoundData` 健康检查；`getChainlinkDataFeedLatestAnswer` 会校验价格为正且非 stale。
- **竞价流程**：`placeBid` 统一转换到美元价值比较，支持 ETH↔ERC20 出价切换，自动退款上一位最高出价者，同时防止卖家自竞、过期/结束拍卖竞价等情况。
- **拍卖结束**：`endAuction` 允许卖家或管理员在结束时间后调用，将 NFT/资金结算给买家与卖家，若无人出价则退回 NFT。
- **安全性**：ReentrancyGuard、CEI 流程、`receive`/`fallback` 显式拒绝直接转账或未知调用，配套测试涵盖各种异常路径。

## 项目结构

```
nft-auction
├── contracts
│   ├── NFTAuction.sol              # 主拍卖逻辑（UUPS、Chainlink 报价、多资产出价）
│   ├── ERC1967Proxy.sol            # 轻量代理合约，便于本地测试 UUPS 升级
│   └── mocks                       # 测试所需的假合约
│       ├── MockNFT.sol             # 简单的 ERC721，支持 mint
│       ├── MockERC20.sol           # 可配置精度的 ERC20，提供 mint / burn
│       ├── MockV3Aggregator.sol    # 标准 Chainlink Mock 预言机
│       └── MockFaultyAggregator.sol# 可自定义故障/过期数据的预言机
├── test
│   ├── NFTAuction_chainlink.js     # 针对链上报价、ETH/USDC 流程及安全性测试
│   ├── NFTAuction_decimals.js      # 不同 ERC20 精度、混合竞价、边界测试
│   ├── NFTAuction_upgrade.js       # UUPS 升级流程与权限验证
│   └── NFTAuction_additional.js    # 覆盖初始化、非法参数及价格源异常等边界
├── hardhat.config.cjs              # Hardhat 配置（0.8.28、UUPS 插件）
└── README.md
```

## 系统架构

## 依赖

## 合约部署地址


## 部署步骤


## 测试覆盖率

---------------------------|----------|----------|----------|----------|----------------|
File                       |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
---------------------------|----------|----------|----------|----------|----------------|
 contracts/                |      100 |    97.06 |      100 |      100 |                |
  ERC1967Proxy.sol         |      100 |      100 |      100 |      100 |                |
  NFTAuction.sol           |      100 |    97.06 |      100 |      100 |                |
 contracts/mocks/          |    69.23 |       75 |     62.5 |    64.29 |                |
  MockERC20.sol            |    66.67 |      100 |       75 |       75 |             26 |
  MockFaultyAggregator.sol |    66.67 |       75 |       50 |    64.71 |... 43,44,45,46 |
  MockNFT.sol              |      100 |      100 |      100 |      100 |                |
  MockV3Aggregator.sol     |       50 |      100 |       50 |    52.94 |... 50,51,68,99 |
---------------------------|----------|----------|----------|----------|----------------|
All files                  |    95.65 |    95.83 |    81.25 |    89.05 |                |
---------------------------|----------|----------|----------|----------|----------------|
