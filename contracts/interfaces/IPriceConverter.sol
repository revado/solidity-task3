// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

/**
 * @notice 价格转换器接口
 * @dev 用于将价格从一种资产转换为另一种资产
 */
interface IPriceConverter {
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

	/**
	 * @notice 获取 ETH 当前价格
	 * @return USD 价格（8 位小数）
	 */
	function getEthPrice() external view returns (uint256);

	/**
	 * @notice 获取 ERC-20 代币当前价格
	 * @param tokenAddress 代币合约地址
	 * @return USD 价格（8 位小数）
	 */
	function getTokenPrice(address tokenAddress) external view returns (uint256);
}