// Utility functions for withdrawal operations
const { getCampaignFromBlockchain, canWithdrawFunds } = require('./blockchain');

/**
 * Check if a campaign is eligible for withdrawal
 * @param {string} blockchainCampaignId - The blockchain campaign ID
 * @returns {Object} Withdrawal eligibility status
 */
async function checkWithdrawalEligibility(blockchainCampaignId) {
  try {
    const campaign = await getCampaignFromBlockchain(blockchainCampaignId);
    const now = new Date();
    
    // Parse values ensuring they're numbers
    const amountRaised = typeof campaign.amountRaised === 'string' ? 
      parseFloat(campaign.amountRaised) : campaign.amountRaised;
    const goal = typeof campaign.goal === 'string' ? 
      parseFloat(campaign.goal) : campaign.goal;
    
    const withdrawalStatus = {
      goalReached: amountRaised >= goal,
      deadlinePassed: now >= campaign.deadline,
      isWithdrawn: campaign.isWithdrawn,
      canWithdraw: (amountRaised >= goal) && (now >= campaign.deadline) && !campaign.isWithdrawn
    };
    
    return {
      campaign,
      withdrawalStatus,
      message: withdrawalStatus.canWithdraw 
        ? 'Campaign is eligible for withdrawal!' 
        : 'Campaign is not yet eligible for withdrawal'
    };
  } catch (error) {
    throw new Error(`Failed to check withdrawal eligibility: ${error.message}`);
  }
}

/**
 * Format withdrawal instructions for the user
 * @param {Object} campaign - The campaign data
 * @param {string} userWallet - The user's wallet address
 * @returns {Object} Formatted instructions
 */
function formatWithdrawalInstructions(campaign, userWallet) {
  return {
    message: 'Withdrawal is allowed! Use MetaMask to call the smart contract.',
    instructions: {
      contractAddress: process.env.CONTRACT_ADDRESS,
      function: 'withdrawFunds',
      campaignId: campaign.blockchain_campaign_id,
      yourWallet: userWallet,
      steps: [
        '1. Open MetaMask and connect to the correct network',
        '2. Go to a blockchain explorer or Web3 interface',
        `3. Call withdrawFunds(${campaign.blockchain_campaign_id}) on the smart contract`,
        '4. Confirm the transaction in MetaMask',
        '5. Funds will be transferred to your wallet'
      ]
    }
  };
}

module.exports = {
  checkWithdrawalEligibility,
  formatWithdrawalInstructions
};