// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

/**
 * @notice 价格预言机读取器
 */
interface IPriceOracleReader {
	/**
	 * @notice 获取 ETH 的 USD 价值
	 * @param amount ETH 数量（最小单位）
	 * @return USD 价格（8 位小数）
	 */
	function getEthValueInUSD(uint256 amount) external view returns (uint256);

	/**
	 * @notice 获取 ERC-20 代币的 USD 价值
	 * @param amount 代币数量（最小单位）
	 * @return USD 价格（8 位小数）
	 */
	function getTokenValueInUSD(address tokenAddress, uint256 amount) external view returns (uint256);
}