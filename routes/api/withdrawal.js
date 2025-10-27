const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { getCampaignFromBlockchain, canWithdrawFunds } = require('../../utils/blockchain');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// @route   GET api/withdrawal/check/:campaignId
// @desc    Check if campaign is eligible for withdrawal
// @access  Private (Fundraiser only)
router.get('/check/:campaignId', auth, async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    
    // Get campaign from database with creator's wallet address
    db.get(
      'SELECT c.*, u.wallet_address FROM campaigns c JOIN users u ON c.creator_id = u.id WHERE c.id = ? AND c.creator_id = ?',
      [campaignId, req.user.id],
      async (err, campaign) => {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or you are not the creator' });
        }

        if (!campaign.blockchain_campaign_id) {
          return res.status(400).json({ message: 'Campaign is not on blockchain' });
        }

        try {
          // Get campaign data from blockchain
          const blockchainCampaign = await getCampaignFromBlockchain(parseInt(campaign.blockchain_campaign_id));
          
          // Check withdrawal eligibility using proper blockchain logic
          const withdrawalEligibility = await canWithdrawFunds(parseInt(campaign.blockchain_campaign_id));
          
          res.json({
            campaign: {
              id: campaign.id,
              title: campaign.title,
              goal: campaign.goal,
              blockchainId: campaign.blockchain_campaign_id
            },
            blockchain: blockchainCampaign,
            withdrawal: withdrawalEligibility,
            wallet_address: campaign.wallet_address,
            message: withdrawalEligibility.canWithdraw ? 'Campaign eligible for withdrawal' : 'Campaign not eligible for withdrawal'
          });
          
        } catch (blockchainError) {
          console.error('Blockchain error:', blockchainError.message);
          return res.status(500).json({ 
            message: 'Failed to check blockchain status', 
            error: blockchainError.message 
          });
        }
      }
    );
  } catch (err) {
    console.error('Route error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/withdrawal/request/:campaignId
// @desc    Request withdrawal (returns withdrawal instructions)
// @access  Private (Fundraiser only)
router.post('/request/:campaignId', auth, async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    
    // Get campaign from database
    db.get(
      'SELECT c.*, u.wallet_address FROM campaigns c JOIN users u ON c.creator_id = u.id WHERE c.id = ? AND c.creator_id = ?',
      [campaignId, req.user.id],
      async (err, campaign) => {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or you are not the creator' });
        }

        if (!campaign.blockchain_campaign_id) {
          return res.status(400).json({ message: 'Campaign is not on blockchain' });
        }

        if (!campaign.wallet_address) {
          return res.status(400).json({ message: 'Creator wallet address not found' });
        }

        try {
          // Check withdrawal eligibility using proper blockchain logic
          const withdrawalEligibility = await canWithdrawFunds(parseInt(campaign.blockchain_campaign_id));
          
          if (!withdrawalEligibility.canWithdraw) {
            return res.status(400).json({ 
              message: 'Withdrawal not allowed',
              details: withdrawalEligibility
            });
          }

          // Simple withdrawal instructions
          const instructions = {
            message: 'Withdrawal instructions',
            campaign: {
              id: campaign.id,
              title: campaign.title,
              goal: campaign.goal,
              current_amount: campaign.current_amount,
              deadline: campaign.deadline
            },
            wallet_address: campaign.wallet_address,
            withdrawal_steps: [
              'Connect your wallet to the platform',
              'Navigate to your campaign dashboard',
              'Click the "Withdraw Funds" button',
              'Confirm the transaction in your wallet'
            ]
          };
          
          // Get blockchain campaign data for response
          const blockchainCampaign = await getCampaignFromBlockchain(parseInt(campaign.blockchain_campaign_id));
          
          res.json({
            ...instructions,
            blockchain: blockchainCampaign,
            withdrawal: withdrawalEligibility
          });
          
        } catch (blockchainError) {
          console.error('Blockchain error:', blockchainError.message);
          return res.status(500).json({ 
            message: 'Failed to check blockchain status', 
            error: blockchainError.message 
          });
        }
      }
    );
  } catch (err) {
    console.error('Route error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;