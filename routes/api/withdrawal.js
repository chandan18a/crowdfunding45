const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { getCampaignFromBlockchain, canWithdrawFunds } = require('../../utils/blockchain');
const { checkWithdrawalEligibility, formatWithdrawalInstructions } = require('../../utils/withdrawalHelper');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// @route   GET api/withdrawal/check/:campaignId
// @desc    Check if campaign is eligible for withdrawal
// @access  Private (Fundraiser only)
router.get('/check/:campaignId', auth, async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    
    // Get campaign from database
    db.get(
      'SELECT * FROM campaigns WHERE id = ? AND creator_id = ?',
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
          // Check blockchain conditions using helper
          const result = await checkWithdrawalEligibility(campaign.blockchain_campaign_id);
          
          res.json({
            campaign: {
              id: campaign.id,
              title: campaign.title,
              goal: campaign.goal,
              blockchainId: campaign.blockchain_campaign_id
            },
            blockchain: result.campaign,
            withdrawal: result.withdrawalStatus,
            message: result.message
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
          // Check if withdrawal is allowed using helper
          const result = await checkWithdrawalEligibility(campaign.blockchain_campaign_id);
          
          if (!result.withdrawalStatus.canWithdraw) {
            return res.status(400).json({ 
              message: 'Withdrawal not allowed',
              details: result.withdrawalStatus
            });
          }

          // Return withdrawal instructions using helper
          const instructions = formatWithdrawalInstructions(campaign, campaign.wallet_address);
          
          res.json({
            ...instructions,
            blockchain: result.campaign
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