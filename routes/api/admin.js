const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { createNotification } = require('./notifications');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Middleware to check if user is admin
const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied. Admin only.' });
  }
  next();
};

// @route   GET api/admin/stats
// @desc    Get platform statistics
// @access  Private/Admin
router.get('/stats', [auth, adminAuth], (req, res) => {
  try {
    // Compute statistics with accurate definitions
    // activeCampaigns: approved/active, not withdrawn, and deadline in the future (or not set)
    // totalDonations: sum of current_amount from campaigns (actual raised amounts) for non-withdrawn campaigns
    const sql = `
      WITH campaign_base AS (
        SELECT * FROM campaigns
      ),
      active AS (
        SELECT COUNT(*) AS cnt
        FROM campaign_base
        WHERE status IN ('approved','active')
          AND COALESCE(is_withdrawn, 0) = 0
          AND (
            deadline IS NULL OR deadline = '' OR datetime(deadline) > CURRENT_TIMESTAMP
          )
      ),
      pending AS (
        SELECT COUNT(*) AS cnt FROM campaign_base WHERE status = 'pending'
      ),
      completed AS (
        SELECT COUNT(*) AS cnt FROM campaign_base WHERE status = 'completed'
      ),
      totals AS (
        SELECT COUNT(*) AS cnt FROM campaign_base
      ),
      donation_sum AS (
        SELECT COALESCE(SUM(current_amount), 0) AS total
        FROM campaign_base
        WHERE COALESCE(is_withdrawn, 0) = 0
      )
      SELECT 
        (SELECT cnt FROM totals) AS totalCampaigns,
        (SELECT cnt FROM pending) AS pendingCampaigns,
        (SELECT cnt FROM active) AS activeCampaigns,
        (SELECT cnt FROM completed) AS completedCampaigns,
        (SELECT total FROM donation_sum) AS totalDonations
    `;

    db.get(sql, (err, stats) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ message: 'Server error' });
      }

      res.json({
        totalCampaigns: stats?.totalCampaigns || 0,
        pendingCampaigns: stats?.pendingCampaigns || 0,
        activeCampaigns: stats?.activeCampaigns || 0,
        completedCampaigns: stats?.completedCampaigns || 0,
        totalDonations: stats?.totalDonations || 0
      });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT api/admin/campaigns/:id/approve
// @desc    Approve a campaign (no blockchain deployment). Fundraiser will deploy.
// @access  Private/Admin
router.put('/campaigns/:id/approve', [auth, adminAuth], async (req, res) => {
  console.log('🚨 DEBUG: Starting campaign approval process...');
  console.log('- Campaign ID:', req.params.id);
  console.log('- Admin User ID:', req.user.id);
  console.log('- Test Mode:', process.env.TEST_MODE);
  
  try {
    // First, get campaign details
    console.log('🚨 DEBUG: Fetching campaign from database...');
    db.get(
      'SELECT c.*, u.wallet_address as creator_wallet FROM campaigns c JOIN users u ON c.creator_id = u.id WHERE c.id = ?',
      [req.params.id],
      async (err, campaign) => {
        console.log('🚨 DEBUG: Database query result:', { err: err?.message, campaign: campaign ? 'found' : 'not found' });
        
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        if (!campaign) {
          console.log('🚨 DEBUG: Campaign not found in database');
          return res.status(404).json({ message: 'Campaign not found' });
        }
        
        console.log('🚨 DEBUG: Campaign details:', {
          id: campaign.id,
          title: campaign.title,
          status: campaign.status,
          creator_wallet: campaign.creator_wallet,
          goal: campaign.goal,
          deadline: campaign.deadline
        });

        if (campaign.status !== 'pending') {
          return res.status(400).json({ message: 'Campaign is not pending approval' });
        }

        if (!campaign.creator_wallet) {
          return res.status(400).json({ message: 'Creator must have a wallet address before approval' });
        }

        // Only update DB to approved; fundraiser will deploy from UI
        db.run(
          'UPDATE campaigns SET status = ?, approved_by = ? WHERE id = ? AND status = "pending"',
          ['approved', req.user.id, req.params.id],
          async function(err) {
            if (err) {
              console.error('Database update error:', err.message);
              return res.status(500).json({ message: 'Failed to update campaign status' });
            }

            if (this.changes === 0) {
              return res.status(400).json({ message: 'Campaign already processed' });
            }

            // Notify fundraiser to deploy from their dashboard
            try {
              await createNotification(
                campaign.creator_id,
                campaign.id,
                'campaign_approved',
                '✅ Campaign Approved!',
                `Your campaign "${campaign.title}" has been approved by admin. Please connect your MetaMask wallet and deploy it to the blockchain from your dashboard to go live and start receiving donations.`
              );
              console.log('✅ Approval notification sent to fundraiser');
            } catch (notificationError) {
              console.error('⚠️ Failed to send notification:', notificationError.message);
            }

            return res.json({ 
              message: 'Campaign approved successfully! Fundraiser has been notified to deploy to blockchain using MetaMask from their dashboard.'
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('Route error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT api/admin/campaigns/:id/reject
// @desc    Reject a campaign
// @access  Private/Admin
router.put('/campaigns/:id/reject', [auth, adminAuth], async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Get campaign details first
    db.get(
      'SELECT c.*, u.name as creator_name FROM campaigns c JOIN users u ON c.creator_id = u.id WHERE c.id = ?',
      [req.params.id],
      async (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found' });
        }
        
        db.run(
          'UPDATE campaigns SET status = ?, approved_by = ? WHERE id = ?',
          ['rejected', req.user.id, req.params.id],
          async function(err) {
            if (err) {
              console.error(err.message);
              return res.status(500).json({ message: 'Server error' });
            }

            if (this.changes === 0) {
              return res.status(404).json({ message: 'Campaign not found' });
            }

            // Send rejection notification to fundraiser
            try {
              const rejectionMessage = reason 
                ? `Unfortunately, your campaign "${campaign.title}" has been rejected by the admin. Reason: ${reason}. You can edit and resubmit your campaign after addressing the concerns.`
                : `Unfortunately, your campaign "${campaign.title}" has been rejected by the admin. Please review the campaign guidelines and resubmit after making necessary changes.`;
              
              await createNotification(
                campaign.creator_id,
                campaign.id,
                'campaign_rejected',
                '❌ Campaign Rejected',
                rejectionMessage
              );
              console.log('✅ Rejection notification sent to fundraiser');
            } catch (notificationError) {
              console.error('⚠️ Failed to send notification:', notificationError.message);
            }

            res.json({ message: 'Campaign rejected successfully. Notification sent to fundraiser.', reason });
          }
        );
      }
    );
  } catch (err) {
    console.error('Route error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/admin/campaigns/:id/delete
// @desc    Delete a campaign (admin only)
// @access  Private/Admin
router.delete('/campaigns/:id/delete', [auth, adminAuth], async (req, res) => {
  try {
    db.run(
      'DELETE FROM campaigns WHERE id = ?',
      [req.params.id],
      function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: 'Campaign not found' });
        }

        res.json({ message: 'Campaign deleted successfully' });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/admin/campaigns
// @desc    Get all campaigns with optional status filter
// @access  Private/Admin
router.get('/campaigns', [auth, adminAuth], (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT c.*, u.name as creator_name FROM campaigns c JOIN users u ON c.creator_id = u.id';
    const params = [];
    
    if (status) {
      sql += ' WHERE c.status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY c.created_at DESC';
    
    db.all(sql, params, (err, campaigns) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ message: 'Server error' });
      }

      res.json({ campaigns });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/admin/users
// @desc    Get all users
// @access  Private/Admin
router.get('/users', [auth, adminAuth], (req, res) => {
  try {
    db.all(
      'SELECT id, name, email, role, wallet_address, created_at FROM users ORDER BY created_at DESC',
      (err, users) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        res.json({ users });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/admin/create-blockchain-campaign
// @desc    DISABLED - Fundraisers now deploy via MetaMask
// @access  Private/Admin
router.post('/create-blockchain-campaign', [auth, adminAuth], async (req, res) => {
  res.status(410).json({ 
    message: 'This endpoint is disabled. Fundraisers now deploy campaigns to blockchain using MetaMask from their dashboard.',
    newWorkflow: 'Admin approves → Fundraiser deploys via MetaMask'
  });
});

module.exports = router;
