// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

interface IFeePolicy {
	/**
	 * @notice 计算拍卖手续费
	 * @param auctionId 拍卖 ID
	 * @param seller 卖家地址
	 * @param token 结算资产地址（address(0) 表示 ETH）
	 * @param grossAmount 成交总额
	 * @return feeAmount 手续费金额（与 token 同精度）
	 * @return feeRecipient 手续费归集地址（可为 address(0)，调用方应处理）
	 */
	function computeFee(uint256 auctionId, address seller, address token, uint256 grossAmount) external view returns (uint256 feeAmount, address feeRecipient);
}
