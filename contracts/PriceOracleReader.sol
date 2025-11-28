// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { IPriceOracleReader } from "./interfaces/IPriceOracleReader.sol";

contract PriceOracleReader is IPriceOracleReader, Ownable {
	// ============================== 错误 ==============================
	error InvalidEthPriceFeed();
	error InvalidTokenAddress();
	error InvalidTokenPriceFeed();
	error StalePriceData();
	error InvalidPrice();

	// ============================== 状态变量 ==============================
	// eth 价格 Feed 地址
	address public ethPriceFeed;

	// 价格时效性限制：不超过 1 小时
	uint256 public constant PRICE_STALE_LIMIT = 1 hours;

	// 代币合约地址 => 价格 Feed 地址
	mapping(address => address) public priceFeeds;

	// ============================== 事件 ==============================
	// 代币价格 Feed 更新事件
	event PriceFeedUpdated(address indexed token, address indexed feed);

	// ============================== 函数 ==============================
	constructor() Ownable(msg.sender) {}

	/**
	 * @notice 设置 ETH 价格 Feed
	 * @param _ethPriceFeed 价格 Feed 地址
	 */
	function setEthPriceFeed(address _ethPriceFeed) external onlyOwner {
		if (_ethPriceFeed == address(0)) {
			revert InvalidEthPriceFeed();
		}
		ethPriceFeed = _ethPriceFeed;

		emit PriceFeedUpdated(address(0), _ethPriceFeed);
	}

	/**
	 * @notice 设置 ERC-20 代币价格 Feed
	 * @param token 代币地址
	 * @param priceFeed 价格 Feed 地址
	 */
	function setTokenPriceFeed(address token, address priceFeed) external onlyOwner {
		if (token == address(0)) {
			revert InvalidTokenAddress();
		}

		if (priceFeed == address(0)) {
			revert InvalidTokenPriceFeed();
		}

		priceFeeds[token] = priceFeed;

		emit PriceFeedUpdated(address(0), priceFeed);
	}

	/**
	 * @notice 获取 ETH 当前价格
	 * @return USD 价格（8 位小数）
	 */
	function getEthPrice() public view returns (uint256) {
		return _getPrice(ethPriceFeed);
	}

	/**
	 * @notice 获取 ERC-20 代币当前价格
	 * @param token 代币地址
	 * @return USD 价格（8 位小数）
	 */
	function getTokenPrice(address token) public view returns (uint256) {
		address priceFeed = priceFeeds[token];
		return _getPrice(priceFeed);
	}

	/**
	 * @notice 获取代币价格
	 * @param priceFeed 价格 Feed 地址
	 * @return 最新 USD 价格（8 位小数）
	 */
	function _getPrice(address priceFeed) internal view returns (uint256) {
		try AggregatorV3Interface(priceFeed).latestRoundData() returns (
			uint80 roundId,
			int256 answer,
			uint256, /* startedAt */
			uint256 updatedAt,
			uint80 answeredInRound
		) {
			if (answer <= 0) {
				revert InvalidPrice();
			}
			// 检查 round 是否完整，防止数据不一致
			if (answeredInRound != roundId) {
				revert StalePriceData();
			}
			// 检查价格时效性是否在限制范围内
			if (block.timestamp - updatedAt > PRICE_STALE_LIMIT) {
				revert StalePriceData();
			}

			return uint256(answer);
		} catch {
			revert InvalidPrice();
		}
	}

	/**
	 * @notice 获取 ETH 的 USD 价值
	 * @param amount ETH 数量（最小单位）
	 * @return USD 价格（8 位小数）
	 */
	function getEthValueInUSD(uint256 amount) external view override returns (uint256) {
		// ETH 价格是 8 位小数，ETH 数量是 18 位小数
		// (ETH数量 * ETH价格) / 10^18，结果是 8 位小数的美元
		uint256 ethPrice = getEthPrice();
		return (amount * ethPrice) / 1e18;
	}

	/**
	 * @notice 获取 ERC-20 代币的 USD 价值
	 * @param token 代币地址
	 * @param amount 代币数量（最小单位）
	 * @return USD 价格（8 位小数）
	 */
	function getTokenValueInUSD(address token, uint256 amount) external view override returns (uint256) {
		// 动态获取代币精度
		uint8 decimals = IERC20Metadata(token).decimals();

		// ERC-20 代币价格是 8 位小数
		// (代币数量 * 代币价格) / 10^decimals，结果是 8 位小数的美元
		uint256 tokenPrice = getTokenPrice(token);
		return (amount * tokenPrice) / (10 ** decimals);
	}

	/**
	 * @notice 检查价格 Feed 是否设置
	 * @param token 代币地址
	 * @return 是否设置
	 */
	function isPriceFeedSet(address token) public view returns (bool) {
		if (token == address(0)) {
			return ethPriceFeed != address(0);
		}
		return priceFeeds[token] != address(0);
	}
}