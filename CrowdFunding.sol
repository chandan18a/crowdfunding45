// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract CrowdFunding is ReentrancyGuard {
    uint256 public campaignCount;

    struct Campaign {
        address payable creator;
        string title;
        string description;
        uint256 goal;
        uint256 pledged;
        uint256 deadline;
        bool exists;
        bool withdrawn;
        uint256 totalWithdrawn; // Track total amount withdrawn via partial withdrawals
    }

    struct WithdrawalRequest {
        uint256 amount;
        string usageDetails;
        uint256 approvalThreshold; // Required approval amount (e.g., 51% of pledged)
        uint256 approvalsReceived; // Weighted by contribution amount
        uint256 rejectionReceived; // Weighted by contribution amount
        bool executed;
        bool exists;
        mapping(address => bool) hasVoted;
    }

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(uint256 => WithdrawalRequest)) public withdrawalRequests;
    mapping(uint256 => uint256) public withdrawalRequestCount;

    event CampaignCreated(uint256 indexed id, address indexed creator, uint256 goal, uint256 deadline);
    event DonationReceived(uint256 indexed id, address indexed donor, uint256 indexed amount);
    event Withdraw(uint256 indexed id, address indexed creator, uint256 amount);
    event Refund(uint256 indexed id, address indexed donor, uint256 amount);
    event WithdrawalRequested(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, string usageDetails, uint256 approvalThreshold);
    event WithdrawalApproved(uint256 indexed campaignId, uint256 indexed requestId, address indexed donor, uint256 contributionWeight);
    event WithdrawalRejected(uint256 indexed campaignId, uint256 indexed requestId, address indexed donor, uint256 contributionWeight);
    event PartialWithdrawal(uint256 indexed campaignId, uint256 indexed requestId, address indexed creator, uint256 amount);

    modifier campaignExists(uint256 _id) {
        require(campaigns[_id].exists, "Campaign does not exist");
        _;
    }

    /**
     * @dev Creates a new campaign.
     * @param _title Campaign title.
     * @param _description Campaign description.
     * @param _goal Funding goal (Wei).
     * @param _deadline Unix timestamp for campaign end.
     * @return id The new campaign ID.
     */
    function createCampaign(
        string calldata _title,
        string calldata _description,
        uint256 _goal,
        uint256 _deadline
    ) external returns (uint256) {
        require(_goal > 0, "Goal must be > 0");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(_deadline != 0, "Invalid deadline");

        uint256 id = ++campaignCount;
        campaigns[id] = Campaign({
            creator: payable(msg.sender),
            title: _title,
            description: _description,
            goal: _goal,
            pledged: 0,
            deadline: _deadline,
            exists: true,
            withdrawn: false,
            totalWithdrawn: 0
        });

        emit CampaignCreated(id, msg.sender, _goal, _deadline);
        return id;
    }

    /**
     * @dev Donates ETH to a campaign.
     * @param _id Campaign ID.
     */
    function donateToCampaign(uint256 _id) external payable campaignExists(_id) nonReentrant {
        Campaign storage c = campaigns[_id];
        require(block.timestamp <= c.deadline, "Campaign has ended");
        require(msg.value > 0, "Must send ETH");

        c.pledged += msg.value;
        contributions[_id][msg.sender] += msg.value;

        emit DonationReceived(_id, msg.sender, msg.value);
    }

    /**
     * @dev OLD FUNCTION: Withdraws ALL remaining funds (backward compatibility).
     * @param _id Campaign ID.
     */
    function withdraw(uint256 _id) external nonReentrant campaignExists(_id) {
        Campaign storage c = campaigns[_id];
        require(msg.sender == c.creator, "Not campaign creator");
        require(!c.withdrawn, "Already withdrawn");
        require(c.pledged >= c.goal, "Goal not reached");
        require(block.timestamp > c.deadline, "Deadline not yet reached");

        c.withdrawn = true;
        uint256 amount = c.pledged - c.totalWithdrawn;
        require(amount > 0, "No funds available");
        c.totalWithdrawn = c.pledged;

        (bool sent, ) = c.creator.call{value: amount}("");
        if (!sent) {
            c.withdrawn = false;
            c.totalWithdrawn -= amount;
            revert("Failed to send funds");
        }

        emit Withdraw(_id, c.creator, amount);
    }

    /**
     * @dev NEW: Request partial withdrawal with usage details and approval threshold.
     * @param _campaignId Campaign ID.
     * @param _amount Amount to withdraw (Wei).
     * @param _usageDetails Description of how funds will be used.
     * @param _minApprovalPercentage Minimum approval percentage (1-100, e.g., 51 for 51%).
     * @return requestId The withdrawal request ID.
     */
    function requestWithdrawal(
        uint256 _campaignId,
        uint256 _amount,
        string calldata _usageDetails,
        uint256 _minApprovalPercentage
    ) external campaignExists(_campaignId) returns (uint256) {
        Campaign storage c = campaigns[_campaignId];
        require(msg.sender == c.creator, "Not campaign creator");
        require(c.pledged >= c.goal, "Goal not reached");
        require(block.timestamp > c.deadline, "Deadline not yet reached");
        require(_amount > 0, "Amount must be > 0");
        require(_minApprovalPercentage > 0 && _minApprovalPercentage <= 100, "Invalid percentage");
        require(c.pledged - c.totalWithdrawn >= _amount, "Insufficient funds available");

        // Calculate approval threshold based on pledged amount at request time
        uint256 threshold = (c.pledged * _minApprovalPercentage) / 100;
        require(threshold > 0, "Threshold too low");

        uint256 requestId = ++withdrawalRequestCount[_campaignId];
        WithdrawalRequest storage request = withdrawalRequests[_campaignId][requestId];
        request.amount = _amount;
        request.usageDetails = _usageDetails;
        request.approvalThreshold = threshold;
        request.approvalsReceived = 0;
        request.rejectionReceived = 0;
        request.executed = false;
        request.exists = true;

        emit WithdrawalRequested(_campaignId, requestId, _amount, _usageDetails, threshold);
        return requestId;
    }

    /**
     * @dev NEW: Approve a withdrawal request (contribution-weighted voting).
     * @param _campaignId Campaign ID.
     * @param _requestId Withdrawal request ID.
     */
    function approveWithdrawal(uint256 _campaignId, uint256 _requestId) 
        external 
        campaignExists(_campaignId) 
    {
        uint256 contribution = contributions[_campaignId][msg.sender];
        require(contribution > 0, "Not a donor");
        
        WithdrawalRequest storage request = withdrawalRequests[_campaignId][_requestId];
        require(request.exists, "Request does not exist");
        require(!request.executed, "Request already executed");
        require(!request.hasVoted[msg.sender], "Already voted");

        request.hasVoted[msg.sender] = true;
        request.approvalsReceived += contribution; // Weighted by contribution

        emit WithdrawalApproved(_campaignId, _requestId, msg.sender, contribution);
    }

    /**
     * @dev NEW: Reject a withdrawal request (contribution-weighted voting).
     * @param _campaignId Campaign ID.
     * @param _requestId Withdrawal request ID.
     */
    function rejectWithdrawal(uint256 _campaignId, uint256 _requestId) 
        external 
        campaignExists(_campaignId) 
    {
        uint256 contribution = contributions[_campaignId][msg.sender];
        require(contribution > 0, "Not a donor");
        
        WithdrawalRequest storage request = withdrawalRequests[_campaignId][_requestId];
        require(request.exists, "Request does not exist");
        require(!request.executed, "Request already executed");
        require(!request.hasVoted[msg.sender], "Already voted");

        request.hasVoted[msg.sender] = true;
        request.rejectionReceived += contribution; // Weighted by contribution

        emit WithdrawalRejected(_campaignId, _requestId, msg.sender, contribution);
    }

    /**
     * @dev NEW: Execute approved withdrawal request.
     * @param _campaignId Campaign ID.
     * @param _requestId Withdrawal request ID.
     */
    function executeWithdrawal(uint256 _campaignId, uint256 _requestId) 
        external 
        nonReentrant 
        campaignExists(_campaignId) 
    {
        Campaign storage c = campaigns[_campaignId];
        require(msg.sender == c.creator, "Not campaign creator");
        
        WithdrawalRequest storage request = withdrawalRequests[_campaignId][_requestId];
        require(request.exists, "Request does not exist");
        require(!request.executed, "Request already executed");
        require(request.approvalsReceived >= request.approvalThreshold, "Insufficient approvals");
        
        // Slippage protection
        require(address(this).balance >= request.amount, "Insufficient contract balance");
        require(c.pledged - c.totalWithdrawn >= request.amount, "Insufficient campaign balance");

        request.executed = true;
        c.totalWithdrawn += request.amount;

        (bool sent, ) = c.creator.call{value: request.amount}("");
        if (!sent) {
            request.executed = false;
            c.totalWithdrawn -= request.amount;
            revert("Failed to send funds");
        }

        emit PartialWithdrawal(_campaignId, _requestId, c.creator, request.amount);
    }

    /**
     * @dev Get withdrawal request details.
     * @param _campaignId Campaign ID.
     * @param _requestId Withdrawal request ID.
     */
    function getWithdrawalRequest(uint256 _campaignId, uint256 _requestId) 
        external 
        view 
        returns (
            uint256 amount,
            string memory usageDetails,
            uint256 approvalThreshold,
            uint256 approvalsReceived,
            uint256 rejectionReceived,
            bool executed
        ) 
    {
        WithdrawalRequest storage request = withdrawalRequests[_campaignId][_requestId];
        require(request.exists, "Request does not exist");
        
        return (
            request.amount,
            request.usageDetails,
            request.approvalThreshold,
            request.approvalsReceived,
            request.rejectionReceived,
            request.executed
        );
    }

    /**
     * @dev Check if address has voted on a withdrawal request.
     * @param _campaignId Campaign ID.
     * @param _requestId Withdrawal request ID.
     * @param _voter Voter address.
     */
    function hasVoted(uint256 _campaignId, uint256 _requestId, address _voter) 
        external 
        view 
        returns (bool) 
    {
        return withdrawalRequests[_campaignId][_requestId].hasVoted[_voter];
    }

    /**
     * @dev Get available balance for withdrawal.
     * @param _campaignId Campaign ID.
     */
    function getAvailableBalance(uint256 _campaignId) 
        external 
        view 
        campaignExists(_campaignId) 
        returns (uint256) 
    {
        Campaign storage c = campaigns[_campaignId];
        return c.pledged - c.totalWithdrawn;
    }

    /**
     * @dev Refunds a donor if the campaign failed.
     * @param _id Campaign ID.
     */
    function refund(uint256 _id) external nonReentrant campaignExists(_id) {
        Campaign storage c = campaigns[_id];
        require(block.timestamp > c.deadline, "Deadline not passed");
        require(c.pledged < c.goal, "Goal was reached, no refunds");

        uint256 contribution = contributions[_id][msg.sender];
        require(contribution > 0, "No contribution to refund");

        contributions[_id][msg.sender] = 0;
        c.pledged -= contribution;

        (bool sent, ) = msg.sender.call{value: contribution}("");
        if (!sent) {
            contributions[_id][msg.sender] = contribution;
            c.pledged += contribution;
            revert("Failed to send refund");
        }

        emit Refund(_id, msg.sender, contribution);
    }
}