// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts@4.9.3/utils/Counters.sol";
import "@openzeppelin/contracts@4.9.3/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts@4.9.3/utils/Address.sol";

contract CrowdFunding is ReentrancyGuard {
    using Counters for Counters.Counter;
    Counters.Counter private _campaignCount;

    struct Campaign {
        address payable creator;
        uint256 goal;
        uint256 deadline;
        uint256 amountRaised;
        bool isCompleted;
        bool isWithdrawn;
    }

    mapping(uint256 => Campaign) public campaigns;
    mapping(address => mapping(uint256 => uint256)) public contributions;

    uint256 public constant WITHDRAWAL_DELAY = 30 days;

    event CampaignCreated(uint256 indexed campaignId, address creator, uint256 goal, uint256 deadline);
    event Contributed(uint256 indexed campaignId, address contributor, uint256 amount);
    event Refunded(uint256 indexed campaignId, address refundee, uint256 amount);
    event Withdrawn(uint256 indexed campaignId, uint256 amount);

    function createCampaign(uint256 _goal, uint256 _duration) external {
        require(_goal > 0, "Goal must be > 0");
        require(_duration > 0, "Duration must be > 0");

        _campaignCount.increment();
        uint256 campaignId = _campaignCount.current();

        campaigns[campaignId] = Campaign({
            creator: payable(msg.sender),
            goal: _goal,
            deadline: block.timestamp + _duration,
            amountRaised: 0,
            isCompleted: false,
            isWithdrawn: false
        });

        emit CampaignCreated(campaignId, msg.sender, _goal, block.timestamp + _duration);
    }

    function contribute(uint256 _campaignId) external payable nonReentrant {
        Campaign storage campaign = campaigns[_campaignId];
        require(block.timestamp < campaign.deadline, "Campaign ended");
        require(!campaign.isCompleted, "Campaign completed");

        uint256 amount = msg.value;
        contributions[msg.sender][_campaignId] += amount;
        campaign.amountRaised += amount;

        emit Contributed(_campaignId, msg.sender, amount);
    }

    function checkCampaignStatus(uint256 _campaignId) public {
        if (block.timestamp >= campaigns[_campaignId].deadline && !campaigns[_campaignId].isCompleted) {
            campaigns[_campaignId].isCompleted = campaigns[_campaignId].amountRaised >= campaigns[_campaignId].goal;
        }
    }

    function withdrawFunds(uint256 _campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[_campaignId];
        require(block.timestamp >= campaign.deadline, "Campaign not ended");
        require(campaign.isCompleted, "Goal not reached");
        require(!campaign.isWithdrawn, "Funds withdrawn");
        require(block.timestamp <= campaign.deadline + WITHDRAWAL_DELAY, "Withdrawal expired");
        require(msg.sender == campaign.creator, "Only creator can withdraw");

        uint256 amount = campaign.amountRaised;
        campaign.isWithdrawn = true;

        Address.sendValue(payable(campaign.creator), amount);
        emit Withdrawn(_campaignId, amount);
    }

    function refund(uint256 _campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[_campaignId];
        require(block.timestamp >= campaign.deadline, "Campaign not ended");
        require(!campaign.isCompleted, "Campaign succeeded");
        require(!campaign.isWithdrawn, "Funds withdrawn");

        uint256 amount = contributions[msg.sender][_campaignId];
        require(amount > 0, "No contribution");

        contributions[msg.sender][_campaignId] = 0;
        campaign.amountRaised -= amount;

        Address.sendValue(payable(msg.sender), amount);
        emit Refunded(_campaignId, msg.sender, amount);
    }

    fallback() external payable { revert("Use contribute()"); }
    receive() external payable { revert("Use contribute()"); }
}