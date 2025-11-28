// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../interfaces/IFeePolicy.sol";

// Simple fee policy used in tests to return configurable fee amounts/recipients.
contract MockFeePolicy is IFeePolicy {
	uint256 public feeAmount;
	address public feeRecipient;

	constructor(uint256 _feeAmount, address _feeRecipient) {
		feeAmount = _feeAmount;
		feeRecipient = _feeRecipient;
	}

	function setFee(uint256 _feeAmount) external {
		feeAmount = _feeAmount;
	}

	function setRecipient(address _feeRecipient) external {
		feeRecipient = _feeRecipient;
	}

	function computeFee(uint256, address, address, uint256) external view override returns (uint256, address) {
		return (feeAmount, feeRecipient);
	}
}

// Receiver that deliberately reverts on ETH transfers to test failure paths.
contract RevertingReceiver {
	receive() external payable {
		revert("reverted");
	}
}
