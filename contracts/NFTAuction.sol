// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IPriceOracleReader } from "./interfaces/IPriceOracleReader.sol";
import { IFeePolicy } from "./interfaces/IFeePolicy.sol";

// NFT 拍卖合约
contract NFTAuction is Initializable, ERC721HolderUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
	using SafeERC20 for IERC20;
	// ============================== 自定义错误 ==============================
	error InvalidPriceOracleReaderAddress();
	error InvalidNFTContractAddress();
	error OnlyNFTOwnerCanCreateAuction();
	error DurationTooShort();
	error StartPriceMustBeGreaterThanZero();
	error AuctionDoesNotExist();
	error AuctionAlreadyEnded();
	error AuctionExpired();
	error SellerCannotBidOnOwnAuction();
	error MustSendETH();
	error AmountMustBeGreaterThanZero();
	error BidMustBeAtLeastStartingPrice();
	error BidMustBeHigherThanCurrentHighestBid();
	error AuctionHasNotEndedYet();
	error OnlySellerOrAdminCanEndAuction();
	error OnlyAdminCanUpgrade();
	error FeeExceedsProceeds();
	error ETHTransferFailed();

	// 拍卖信息
	struct Auction {
		bool ended; // 拍卖是否结束
		address priceOracleReader; // 价格预言机读取器地址（固定在创建时，避免被后续拍卖覆盖）

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

	// 费用策略合约
	IFeePolicy public feePolicy;

	// 累计手续费（token => amount），token 为 address(0) 表示 ETH
	mapping(address => uint256) public accruedFees;

	// ============================== 事件 ==============================
	// 事件：拍卖创建
	event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 startPrice);

	// 事件：新的最高出价
	event NewHighestBid(uint256 indexed auctionId, address indexed bidder, uint256 amount, address tokenAddress);

	// 事件：拍卖结束
	event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 finalPrice);

	// 事件：手续费策略/提取
	event FeePolicyUpdated(address indexed newPolicy);
	event FeeAccrued(uint256 indexed auctionId, address indexed token, address indexed recipient, uint256 amount);
	event FeeWithdrawn(address indexed token, address indexed to, uint256 amount);

	// ============================== 函数 ==============================
	/**
	 * @notice 初始化函数
	 * @dev 初始化函数，只能被管理员调用
	 */
	function initialize() initializer public {
		__ERC721Holder_init();
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		admin = msg.sender;
	}

	/**
	 * @notice 创建拍卖，允许任何 NFT 所有者创建拍卖
	 * @param _nftContract NFT 合约地址
	 * @param _tokenId NFT ID
	 * @param _startPrice 起始价格
	 * @param _duration 拍卖持续时间
	 */
	function createAuction(
		address _priceOracleReader,
		address _nftContract,
		uint256 _tokenId,
		uint256 _startPrice,
		uint256 _duration
	) public {
		if (_priceOracleReader == address(0)) {
			revert InvalidPriceOracleReaderAddress();
		}
		if (_nftContract == address(0)) {
			revert InvalidNFTContractAddress();
		}
		// 验证调用者是 NFT 所有者
		if (IERC721(_nftContract).ownerOf(_tokenId) != msg.sender) {
			revert OnlyNFTOwnerCanCreateAuction();
		}
		// 拍卖持续时间至少 10 分钟
		if (_duration <= 10 minutes) {
			revert DurationTooShort();
		}
		if (_startPrice == 0) {
			revert StartPriceMustBeGreaterThanZero();
		}

		// 转移 NFT 所有权到合约（NFT 所有者需要在此之前先授权给调用者）
		IERC721(_nftContract).safeTransferFrom(msg.sender, address(this), _tokenId);

		uint256 auctionId = nextAuctionId;
		// 创建拍卖
		auctions[auctionId] = Auction({
			ended: false,
			priceOracleReader: _priceOracleReader,
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

		++nextAuctionId;

		// 触发拍卖创建事件
		emit AuctionCreated(auctionId, msg.sender, _startPrice);
	}

	/**
	 * @notice 验证竞价的基本条件
	 * @param auction 拍卖信息
	 * @param seller 卖家地址
	 */
	function _validateBidConditions(Auction storage auction, address seller) private view {
		if (seller == address(0)) {
			revert AuctionDoesNotExist();
		}
		// 卖家不能竞拍自己的拍卖
		if (msg.sender == seller) {
			revert SellerCannotBidOnOwnAuction();
		}
		if (auction.ended) {
			revert AuctionAlreadyEnded();
		}
		if (auction.startTime + auction.duration <= block.timestamp) {
			revert AuctionExpired();
		}
	}

	/**
	 * @notice 计算 ETH 竞价的美元价值
	 * @return payValueInUSD 美元价值（8 位小数）
	 * @return bidAmount ETH 数量
	 */
	function _calculateETHBidValue(IPriceOracleReader oracle) private view returns (uint256 payValueInUSD, uint256 bidAmount) {
		if (msg.value == 0) {
			revert MustSendETH();
		}

		bidAmount = msg.value;
		payValueInUSD = oracle.getEthValueInUSD(bidAmount);
	}

	/**
	 * @notice 计算 ERC-20 竞价的美元价值
	 * @param tokenAddress 代币地址
	 * @param amount 代币数量
	 * @return payValueInUSD 美元价值（8位小数）
	 */
	function _calculateERC20BidValue(IPriceOracleReader oracle, address tokenAddress, uint256 amount) private view returns (uint256 payValueInUSD) {
		if (amount == 0) {
			revert AmountMustBeGreaterThanZero();
		}

		payValueInUSD = oracle.getTokenValueInUSD(tokenAddress, amount);
	}

	/**
	 * @dev 将代币数量转换为美元价值
	 * @param tokenAddress 代币地址（address(0) 表示 ETH）
	 * @param tokenAmount 代币数量
	 * @return 美元价值（8位小数）
	 */
	function _convertToUSDValue(IPriceOracleReader oracle, address tokenAddress, uint256 tokenAmount) private view returns (uint256) {
		// ETH
		if (tokenAddress == address(0)) {
			return oracle.getEthValueInUSD(tokenAmount);
		}

		// ERC-20 代币
		return oracle.getTokenValueInUSD(tokenAddress, tokenAmount);
	}

	/**
	 * @notice 获取拍卖绑定的价格读取器
	 */
	function _getPriceOracleReader(Auction storage auction) private view returns (IPriceOracleReader) {
		address oracle = auction.priceOracleReader;
		if (oracle == address(0)) {
			revert InvalidPriceOracleReaderAddress();
		}
		return IPriceOracleReader(oracle);
	}

	/**
	 * @notice 验证出价金额是否足够
	 * @param auction 拍卖信息
	 * @param payValueInUSD 当前出价的美元价值
	 * @param currentTokenAddress 当前最高出价使用的代币
	 * @param currentHighestBid 当前最高出价金额
	 */
	function _validateBidAmount(IPriceOracleReader oracle, Auction storage auction, uint256 payValueInUSD, address currentTokenAddress, uint256 currentHighestBid) private view {
		if (auction.highestBidder == address(0)) {
			// 第一次出价，与起始价格比较。startPrice 是 8 位小数的美元价值
			if (payValueInUSD < auction.startPrice) {
				revert BidMustBeAtLeastStartingPrice();
			}
		} else {
			// 后续出价，与当前最高价比较。需要将前一次出价转换为美元价值
			uint256 highestBidValueInUSD = _convertToUSDValue(oracle, currentTokenAddress, currentHighestBid);
			if (payValueInUSD <= highestBidValueInUSD) {
				revert BidMustBeHigherThanCurrentHighestBid();
			}
		}
	}

	/**
	 * @notice 计算手续费
	 * @param auctionId 拍卖 ID
	 * @param seller 卖家地址
	 * @param token 代币地址
	 * @param grossAmount 成交总额
	 * @return fee 手续费金额
	 * @return recipient 手续费归集地址
	 */
	function _computeFee(uint256 auctionId, address seller, address token, uint256 grossAmount) private view returns (uint256 fee, address recipient) {
		IFeePolicy policy = feePolicy;
		if (address(policy) == address(0)) {
			return (0, address(0));
		}
		(fee, recipient) = policy.computeFee(auctionId, seller, token, grossAmount);
		if (fee > grossAmount) {
			revert FeeExceedsProceeds();
		}
		if (recipient == address(0)) {
			recipient = admin;
		}
	}

	/**
	 * @notice 转移资金
	 * @param token 代币地址
	 * @param to 接收地址
	 * @param amount 金额
	 */
	function _transferOut(address token, address to, uint256 amount) private {
		if (amount == 0) {
			return;
		}
		if (token == address(0)) {
			(bool ok, ) = payable(to).call{ value: amount }("");
			if (!ok) {
				revert ETHTransferFailed();
			}
		} else {
			IERC20(token).safeTransfer(to, amount);
		}
	}

	/**
	 * @notice 退款给之前的最高出价者
	 * @param previousBidder 之前的出价者地址
	 * @param previousTokenAddress 之前的代币地址
	 * @param previousBid 之前的出价金额
	 */
	function _refundPreviousBidder(address previousBidder, address previousTokenAddress, uint256 previousBid) private {
		if (previousBidder == address(0)) {
			return;
		}

		_transferOut(previousTokenAddress, previousBidder, previousBid);
	}

	/**
	 * @notice 使用 ETH 竞价
	 * @param _auctionId 拍卖 ID
	 */
	function placeBidETH(uint256 _auctionId) public payable nonReentrant {
		Auction storage auction = auctions[_auctionId];
		_validateBidConditions(auction, auction.seller);
		IPriceOracleReader oracle = _getPriceOracleReader(auction);

		uint256 bidAmount; // ETH 数量
		uint256 payValue;  // 美元价值（8 位小数）
		(payValue, bidAmount) = _calculateETHBidValue(oracle);

		_validateBidAmount(oracle, auction, payValue, auction.tokenAddress, auction.highestBid);

		// 保存前一个出价者信息（用于退款）
		address previousBidder = auction.highestBidder;
		uint256 previousBid = auction.highestBid;
		address previousTokenAddress = auction.tokenAddress;

		// 先更新拍卖状态
		auction.tokenAddress = address(0);
		auction.highestBidder = msg.sender;
		auction.highestBid = bidAmount;

		// 退款给之前的出价者
		_refundPreviousBidder(previousBidder, previousTokenAddress, previousBid);

		emit NewHighestBid(_auctionId, msg.sender, bidAmount, address(0));
	}

	/**
	 * @notice 使用 ERC-20 代币竞价
	 * @param _auctionId 拍卖 ID
	 * @param _tokenAddress 代币地址
	 * @param amount 代币数量
	 */
	function placeBidToken(uint256 _auctionId, address _tokenAddress, uint256 amount) public nonReentrant {
		Auction storage auction = auctions[_auctionId];
		_validateBidConditions(auction, auction.seller);
		IPriceOracleReader oracle = _getPriceOracleReader(auction);

		uint256 payValue;  // 美元价值（8 位小数）
		payValue = _calculateERC20BidValue(oracle, _tokenAddress, amount);

		_validateBidAmount(oracle, auction, payValue, auction.tokenAddress, auction.highestBid);

		// 保存前一个出价者信息（用于退款）
		address previousBidder = auction.highestBidder;
		uint256 previousBid = auction.highestBid;
		address previousTokenAddress = auction.tokenAddress;

		// 把代币从用户（买家）转移到拍卖合约中托管
		IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), amount);

		// 先更新拍卖状态
		auction.tokenAddress = _tokenAddress;
		auction.highestBidder = msg.sender;
		auction.highestBid = amount;

		// 退款给之前的出价者
		_refundPreviousBidder(previousBidder, previousTokenAddress, previousBid);

		emit NewHighestBid(_auctionId, msg.sender, amount, _tokenAddress);
	}

	/**
	 * @notice 设置手续费策略（仅管理员）
	 * @param _policy 手续费策略地址
	 */
	function setFeePolicy(address _policy) external {
		if (msg.sender != admin) {
			revert OnlyAdminCanUpgrade();
		}
		feePolicy = IFeePolicy(_policy);
		emit FeePolicyUpdated(_policy);
	}

	/**
	 * @notice 管理员提取累计手续费
	 * @param token 代币地址
	 * @param to 接收地址
	 * @param amount 金额
	 */
	function withdrawFees(address token, address to, uint256 amount) external nonReentrant {
		if (msg.sender != admin) {
			revert OnlyAdminCanUpgrade();
		}
		if (to == address(0)) {
			revert InvalidNFTContractAddress();
		}
		uint256 balance = accruedFees[token];
		if (amount == 0) {
			revert AmountMustBeGreaterThanZero();
		}
		if (amount > balance) {
			revert FeeExceedsProceeds();
		}
		accruedFees[token] = balance - amount;
		_transferOut(token, to, amount);
		emit FeeWithdrawn(token, to, amount);
	}

	/**
	 * @notice 结束拍卖
	 * @param _auctionId 拍卖 ID
	 */
	function endAuction(uint256 _auctionId) external nonReentrant {
		Auction storage auction = auctions[_auctionId];
		if (auction.ended) {
			revert AuctionAlreadyEnded();
		}
		if (block.timestamp <= auction.startTime + auction.duration) {
			revert AuctionHasNotEndedYet();
		}
		if (msg.sender != auction.seller && msg.sender != admin) {
			revert OnlySellerOrAdminCanEndAuction();
		}

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

			// 计算手续费（按策略）
			(uint256 feeAmount, address feeReceiver) = _computeFee(_auctionId, auction.seller, tokenAddress, highestBid);
			uint256 sellerAmount = highestBid - feeAmount;

			// 卖家结算
			_transferOut(tokenAddress, auction.seller, sellerAmount);

			// 累计手续费，等待管理员提取
			if (feeAmount > 0) {
				accruedFees[tokenAddress] += feeAmount;
				emit FeeAccrued(_auctionId, tokenAddress, feeReceiver, feeAmount);
			}
		}

		emit AuctionEnded(_auctionId, highestBidder, highestBid);
	}

	/**
	 * @notice 拒绝直接接收 ETH，要求使用 placeBidETH() 或者 placeBidToken() 函数
	 */
    receive() external payable {
        revert("Please use placeBidETH() or placeBidToken() to participate in auction");
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
		if (msg.sender != admin) revert OnlyAdminCanUpgrade();
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

	/**
	 * @notice 获取单个拍卖详情及剩余时间
	 */
	function getAuctionDetail(uint256 _auctionId) external view returns (Auction memory auction, uint256 remainingTime) {
		auction = auctions[_auctionId];
		if (auction.seller == address(0)) {
			revert AuctionDoesNotExist();
		}
		remainingTime = getRemainingTime(_auctionId);
	}

	/**
	 * @notice 批量获取拍卖详情及剩余时间
	 */
	function getAuctionsDetail(uint256[] calldata auctionIds) external view returns (Auction[] memory auctionList, uint256[] memory remainingTimes) {
		uint256 len = auctionIds.length;
		auctionList = new Auction[](len);
		remainingTimes = new uint256[](len);
		for (uint256 i = 0; i < len; ) {
			uint256 id = auctionIds[i];
			Auction memory auction = auctions[id];
			if (auction.seller == address(0)) {
				revert AuctionDoesNotExist();
			}
			auctionList[i] = auction;
			remainingTimes[i] = getRemainingTime(id);
			unchecked { ++i; }
		}
	}
}
