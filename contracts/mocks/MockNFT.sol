// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockNFT is ERC721, Ownable {
    uint256 private _tokenIdCounter;

    constructor()
        ERC721("MockNFT", "MNFT")
        Ownable(msg.sender)
    {}

    function mint(address to) public returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        _safeMint(to, tokenId);
        return tokenId;
    }
}
