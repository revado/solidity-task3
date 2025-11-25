// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @dev Mock aggregator that can simulate stale data or reverts for testing.
 */
contract MockFaultyAggregator is AggregatorV3Interface {
    uint256 public constant override version = 0;

    uint8 public override decimals;
    int256 public latestAnswer;
    bool public revertLatest;
    bool public stale;

    constructor(uint8 _decimals, int256 _answer, bool _revertLatest, bool _stale) {
        decimals = _decimals;
        latestAnswer = _answer;
        revertLatest = _revertLatest;
        stale = _stale;
    }

    function description() external pure returns (string memory) {
        return "MockFaultyAggregator";
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _roundId;
        answer = latestAnswer;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = _roundId;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        if (revertLatest) {
            revert("latestRoundData reverted");
        }

        roundId = 1;
        answer = latestAnswer;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = stale ? 0 : roundId;
    }
}
