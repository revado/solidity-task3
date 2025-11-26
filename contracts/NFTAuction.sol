// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IPriceConverter } from "./interfaces/IPriceConverter.sol";

// NFT 拍卖合约
contract NFTAuction is Initializable, IERC721Receiver, UUPSUpgradeable, ReentrancyGuardUpgradeable {
	// 拍卖信息
	struct Auction {
		bool ended; // 拍卖是否结束

		// 地址类型
		address seller;        // 卖家
		address nftContract;   // NFT 合约地址
		address highestBidder; // 最高出价者
		address tokenAddress;  // 参与竞价的资产类型

		// 数值类型
		uint256 tokenId;    // NFT ID
		uint256 startPrice; // 起始价格（8 位小数的美元/USD）
		uint256 startTime;  // 开始时间（Unix 时间戳，秒）
		uint256 duration;   // 拍卖持续时间
		uint256 highestBid; // 最高出价
	}

	// ============================== 状态变量 ==============================
	// NFT ID => 拍卖信息
	mapping(uint256 => Auction) public auctions;

	// 下一场拍卖 ID
	uint256 public nextAuctionId;

	// 管理员地址
	address public admin;

	// 价格转化器
	IPriceConverter public priceConverter;

	// ============================== 事件 ==============================
	// 事件：拍卖创建
	event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 startPrice);

	// 事件：新的最高出价
	event NewHighestBid(uint256 indexed auctionId, address indexed bidder, uint256 amount, address tokenAddress);

	// 事件：拍卖结束
	event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 finalPrice);

	// ============================== 函数 ==============================
	/**
	 * @notice 初始化函数
	 * @dev 初始化函数，只能被管理员调用
	 */
	function initialize() initializer public {
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		admin = msg.sender;
	}

	// /**
	//  * @notice 设置不同资产价格源
	//  * @param tokenAddress 代币地址
	//  * @param priceFeed 价格源地址
	//  */
	// function setPriceFeed(address tokenAddress, address priceFeed) public {
	// 	// 只有管理员可以设置价格源
	// 	require(msg.sender == admin, "Only admin can set price feed");
	// 	// 验证价格源地址有效
	// 	require(priceFeed != address(0), "Invalid price feed address");

	// 	priceFeeds[tokenAddress] = AggregatorV3Interface(priceFeed);

	// 	try AggregatorV3Interface(priceFeed).latestRoundData() returns (
	// 		uint80,
	// 		int256 answer,
	// 		uint256,
	// 		uint256,
	// 		uint80
	// 	) {
	// 		require(answer > 0, "Price feed returned invalid data");
	// 	} catch {
	// 		revert("Price feed is not functional");
	// 	}
	// }

	// /**
	//  * @notice 获取 Chainlink 价格源的最新价格
	//  * @param tokenAddress 代币地址
	//  * @return answer 最新价格
	//  */
	// function getChainlinkDataFeedLatestAnswer(address tokenAddress) public view returns (int256) {
	// 	AggregatorV3Interface priceFeed = priceFeeds[tokenAddress];

	// 	// 价格源需要提前设置
	// 	require(address(priceFeed) != address(0), "Price feed not set for this token");

	// 	(
	// 		uint80 roundId,
	// 		int256 answer,
	// 		/* uint256 startedAt */,
	// 		/* uint256 updatedAt */,
	// 		uint80 answeredInRound
	// 	) = priceFeed.latestRoundData();

	// 	// 验证价格是否有效
	// 	require(answer > 0, "Invalid price from feed");

	// 	// 检查 found 是否完整，防止数据不一致
	// 	require(answeredInRound == roundId, "Stale price data");

	// 	return answer;
	// }

	/**
	 * @notice 创建拍卖，允许任何 NFT 所有者创建拍卖
	 * @param _nftContract NFT 合约地址
	 * @param _tokenId NFT ID
	 * @param _startPrice 起始价格
	 * @param _duration 拍卖持续时间
	 */
	function createAuction(
		address _priceConverter,
		address _nftContract,
		uint256 _tokenId,
		uint256 _startPrice,
		uint256 _duration
	) public {
		require(_priceConverter != address(0), "Invalid price converter address");
		require(_nftContract != address(0), "Invalid NFT contract address");
		// 验证调用者是 NFT 所有者
		require(IERC721(_nftContract).ownerOf(_tokenId) == msg.sender, "Only NFT owner can create auction");
		// 拍卖持续时间至少 10 分钟
		require(_duration > 10 minutes, "Duration must be at least 10 minutes");
		require(_startPrice > 0, "Start price must be greater than 0");

		// 转移 NFT 所有权到合约（NFT 所有者需要在此之前先授权给调用者）
		IERC721(_nftContract).safeTransferFrom(msg.sender, address(this), _tokenId);

		uint256 auctionId = nextAuctionId;
		priceConverter = IPriceConverter(_priceConverter);
		// 创建拍卖
		auctions[auctionId] = Auction({
			ended: false,
			seller: msg.sender,
			nftContract: _nftContract,
			highestBidder: address(0),
			tokenAddress: address(0), // 默认使用 ETH
			tokenId: _tokenId,
			startPrice: _startPrice,
			startTime: block.timestamp,
			duration: _duration,
			highestBid: 0
		});

		// 触发拍卖创建事件
		emit AuctionCreated(auctionId, msg.sender, _startPrice);

		++nextAuctionId;
	}

	/**
	 * @notice 验证竞价的基本条件
	 * @param auction 拍卖信息
	 * @param seller 卖家地址
	 */
	function _validateBidConditions(Auction storage auction, address seller) private view {
		require(seller != address(0), "Auction does not exist");
		require(!auction.ended, "Auction already ended");
		require(auction.startTime + auction.duration > block.timestamp, "Auction expired");
		// 卖家不能竞拍自己的拍卖
		require(msg.sender != seller, "Seller cannot bid on own auction");
	}

	/**
	 * @notice 计算 ETH 竞价的美元价值
	 * @return payValueInUSD 美元价值（8 位小数）
	 * @return bidAmount ETH 数量
	 */
	function _calculateETHBidValue() private view returns (uint256 payValueInUSD, uint256 bidAmount) {
		require(msg.value > 0, "Must send ETH");

		bidAmount = msg.value;
		payValueInUSD = priceConverter.getEthValueInUSD(bidAmount);
	}

	/**
	 * @notice 计算 ERC-20 竞价的美元价值
	 * @param tokenAddress 代币地址
	 * @param amount 代币数量
	 * @return payValueInUSD 美元价值（8位小数）
 	 * @return bidAmount 代币数量
	 */
	function _calculateERC20BidValue(address tokenAddress, uint256 amount) private view returns (uint256 payValueInUSD, uint256 bidAmount) {
		require(amount > 0, "Amount must be greater than 0");
		require(msg.value == 0, "ETH not accepted for ERC-20 bids");

		bidAmount = amount;
		payValueInUSD = priceConverter.getTokenValueInUSD(tokenAddress, amount);
	}

	/**
	 * @dev 将代币数量转换为美元价值
	 * @param tokenAddress 代币地址（address(0) 表示 ETH）
	 * @param tokenAmount 代币数量
	 * @return 美元价值（8位小数）
	 */
	function _convertToUSDValue(address tokenAddress, uint256 tokenAmount) private view returns (uint256) {
		// ETH
		if (tokenAddress == address(0)) {
			return priceConverter.getEthValueInUSD(tokenAmount);
		}

		// ERC-20 代币
		return priceConverter.getTokenValueInUSD(tokenAddress, tokenAmount);
	}

	/**
	 * @notice 验证出价金额是否足够
	 * @param auction 拍卖信息
	 * @param payValueInUSD 当前出价的美元价值
	 * @param currentTokenAddress 当前最高出价使用的代币
	 * @param currentHighestBid 当前最高出价金额
	 */
	function _validateBidAmount(Auction storage auction, uint256 payValueInUSD, address currentTokenAddress, uint256 currentHighestBid) private view {
		if (auction.highestBidder == address(0)) {
			// 第一次出价，与起始价格比较。startPrice 是 8 位小数的美元价值
			require(payValueInUSD >= auction.startPrice, "Bid must be at least the starting price");
		} else {
			// 后续出价，与当前最高价比较。需要将前一次出价转换为美元价值
			uint256 highestBidValueInUSD = _convertToUSDValue(currentTokenAddress, currentHighestBid);
			require(payValueInUSD > highestBidValueInUSD, "Bid must be higher than the current highest bid");
		}
	}

	/**
	 * @notice 转移竞价资金到合约
	 * @param tokenAddress 代币地址（address(0) 表示 ETH）
	 * @param amount 金额
	 */
	function _transferBidAmount(address tokenAddress, uint256 amount) private {
		if (tokenAddress != address(0)) {
			// 把代币从用户（买家）转移到拍卖合约中托管
			IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
		}
		// ETH 已经通过 msg.value 发送，无需额外操作
	}

	/**
	 * @notice 退款给之前的最高出价者
	 * @param previousBidder 之前的出价者地址
	 * @param previousTokenAddress 之前的代币地址
	 * @param previousBid 之前的出价金额
	 */
	function _refundPreviousBidder(address previousBidder, address previousTokenAddress, uint256 previousBid) private {
		if (previousBidder != address(0)) {
			if (previousTokenAddress == address(0)) {
				// 退回之前的 ETH
				payable(previousBidder).transfer(previousBid);
			} else {
				// 退回之前的 ERC-20 代币
				IERC20(previousTokenAddress).transfer(previousBidder, previousBid);
			}
		}
	}

	/**
	 * @notice 竞价
	 * @param _auctionId 拍卖 ID
	 * @param _tokenAddress 参与竞价的资产类型（地址）
	 * @param amount 参与竞价的资产数量
	 */
	function placeBid(uint256 _auctionId, address _tokenAddress, uint256 amount) external payable nonReentrant {
		Auction storage auction = auctions[_auctionId];
		address seller = auction.seller;
		_validateBidConditions(auction, seller);

		uint256 payValue;  // 计算当前出价的美元价值（标准化为 8 位小数）
		uint256 bidAmount; // ETH 或 ERC-20 代币数量

		if (_tokenAddress == address(0)) {
			// 用户使用 ETH 竞价
			(payValue, bidAmount) = _calculateETHBidValue();
		} else {
			// 用户使用 ERC-20 代币竞价
			(payValue, bidAmount) = _calculateERC20BidValue(_tokenAddress, amount);
		}

		// 缓存常用变量，减少读取 Storage
		address tokenAddress = auction.tokenAddress;
		address highestBidder = auction.highestBidder;
		uint256 highestBid = auction.highestBid;

		// 验证出价是否足够高
		_validateBidAmount(auction, payValue, tokenAddress, highestBid);

		// 收取最新出价（ERC-20 代币）
		_transferBidAmount(_tokenAddress, bidAmount);

		// 保存前一个出价者信息（用于退款）
		address previousBidder = highestBidder;
		uint256 previousBid = highestBid;
		address previousTokenAddress = tokenAddress;

		// 先更新拍卖状态
		auction.tokenAddress = _tokenAddress;
		auction.highestBidder = msg.sender;
		auction.highestBid = bidAmount;

		// 触发新的最高出价事件
		emit NewHighestBid(_auctionId, msg.sender, bidAmount, _tokenAddress);

		// 退款给之前的出价者
		_refundPreviousBidder(previousBidder, previousTokenAddress, previousBid);
	}

	/**
	 * @notice 结束拍卖
	 * @param _auctionId 拍卖 ID
	 */
	function endAuction(uint256 _auctionId) external {
		Auction storage auction = auctions[_auctionId];
		require(!auction.ended, "Auction has already ended");
		require(block.timestamp > auction.startTime + auction.duration, "Auction has not ended yet");
		require(msg.sender == auction.seller || msg.sender == admin, "Only seller or admin can end auction");

		auction.ended = true;

		// 缓存常用变量，减少读取 Storage
		address tokenAddress = auction.tokenAddress;
		address highestBidder = auction.highestBidder;
		uint256 highestBid = auction.highestBid;

		if (highestBidder == address(0)) {
			// 如果没有人出价，把 NFT 退还给卖家
			IERC721(auction.nftContract).safeTransferFrom(address(this), auction.seller, auction.tokenId);
		} else {
			// 将 NFT 转给最高出价者
			IERC721(auction.nftContract).safeTransferFrom(address(this), highestBidder, auction.tokenId);

			// 将拍卖所得转给卖家
			if (tokenAddress == address(0)) {
				payable(auction.seller).transfer(highestBid);
			} else {
				IERC20(tokenAddress).transfer(auction.seller, highestBid);
			}
		}

		emit AuctionEnded(_auctionId, highestBidder, highestBid);
	}

	/**
	 * @notice 实现 IERC721Receiver 接口，允许合约接收 NFT
	 * @return bytes4 返回值
	 */
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

	/**
	 * @notice 拒绝直接接收 ETH，要求使用 placeBid() 函数
	 */
    receive() external payable {
        revert("Please use placeBid() to participate in auction");
    }

	/**
	 * @notice 拒绝调用不存在的函数
	 */
    fallback() external payable {
        revert("Function does not exist");
    }

	/**
	 * @notice UUPS 升级授权函数，只有管理员可以升级合约
	 */
	function _authorizeUpgrade(address /* newImplementation */) internal override {
		require(msg.sender == admin, "Only admin can upgrade");
	}

	/**
	 * @notice 获取拍卖剩余时间（秒）
	 * @return 剩余时间（秒）
	 */
	function getRemainingTime(uint256 _auctionId) public view returns (uint256) {
		Auction storage auction = auctions[_auctionId];
		if (auction.ended) {
			return 0;
		}
		uint256 endTime = auction.startTime + auction.duration;
		if (block.timestamp > endTime) {
			return 0;
		}
		return endTime - block.timestamp;
	}
}