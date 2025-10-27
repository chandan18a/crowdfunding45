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
    }

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public contributions;

    event CampaignCreated(uint256 indexed id, address indexed creator, uint256 goal, uint256 deadline);
    event DonationReceived(uint256 indexed id, address indexed donor, uint256 indexed amount);
    event Withdraw(uint256 indexed id, address indexed creator, uint256 amount);
    event Refund(uint256 indexed id, address indexed donor, uint256 amount);

    modifier campaignExists(uint256 _id) {
        require(campaigns[_id].exists, "Campaign does not exist");
        _;
    }

    /**
     * @dev Creates a new campaign.
     * @param _title Campaign title.
     * @param _description Campaign description.
     * @param _goal Funding goal (ETH).
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
        require(_deadline != 0, "Invalid deadline"); // Prevent overflow edge cases

        uint256 id = ++campaignCount; // Safe due to Solidity 0.8.x checks
        campaigns[id] = Campaign({
            creator: payable(msg.sender),
            title: _title,
            description: _description,
            goal: _goal,
            pledged: 0,
            deadline: _deadline,
            exists: true,
            withdrawn: false
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

        // Cache to save gas (avoids SLOAD for `pledged` twice)
        uint256 newPledged = c.pledged + msg.value;
        c.pledged = newPledged;
        contributions[_id][msg.sender] += msg.value;

        emit DonationReceived(_id, msg.sender, msg.value);
    }

    /**
     * @dev Withdraws funds if the goal is met and deadline passed.
     * @param _id Campaign ID.
     */
    function withdraw(uint256 _id) external nonReentrant campaignExists(_id) {
        Campaign storage c = campaigns[_id];
        require(msg.sender == c.creator, "Not campaign creator");
        require(!c.withdrawn, "Already withdrawn");
        require(c.pledged >= c.goal, "Goal not reached");
        require(block.timestamp > c.deadline, "Deadline not yet reached");

        c.withdrawn = true;
        uint256 amount = c.pledged;

        // Use low-level call with gas stipend (2300 gas)
        (bool sent, ) = c.creator.call{value: amount}("");
        if (!sent) {
            c.withdrawn = false; // Revert state on failure
            revert("Failed to send funds");
        }

        emit Withdraw(_id, c.creator, amount);
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

        // Update state **before** external call
        contributions[_id][msg.sender] = 0;
        c.pledged -= contribution;

        (bool sent, ) = msg.sender.call{value: contribution}("");
        if (!sent) {
            contributions[_id][msg.sender] = contribution; // Revert state
            c.pledged += contribution;
            revert("Failed to send refund");
        }

        emit Refund(_id, msg.sender, contribution);
    }
}