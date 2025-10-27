const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// @route   GET api/donations/test-mode
// @desc    Check if system is in test mode
// @access  Public
router.get('/test-mode', (req, res) => {
  try {
    const testMode = process.env.TEST_MODE === 'true';
    res.json({ testMode });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/donations
// @desc    Create a donation
// @access  Private
router.post('/', [
  auth,
  [
    check('campaignId', 'Campaign ID is required').not().isEmpty(),
    check('amount', 'Amount is required').isNumeric()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { campaignId, amount, transactionHash, donorAddress } = req.body;

  try {
    // Insert donation record
    db.run(
      `INSERT INTO donations (campaign_id, donor_id, amount, transaction_hash, donor_address) 
       VALUES (?, ?, ?, ?, ?)`,
      [campaignId, req.user.id, amount, transactionHash, donorAddress],
      function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error while creating donation' });
        }

        // Update campaign current_amount
        db.run(
          `UPDATE campaigns SET current_amount = COALESCE(current_amount, 0) + ? WHERE id = ?`,
          [amount, campaignId],
          function(updateErr) {
            if (updateErr) {
              console.error('Error updating campaign amount:', updateErr.message);
              // Don't fail the request, just log the error
            }

            // Get the created donation with campaign info
            db.get(
              `SELECT d.*, c.title as campaign_title, u.name as donor_name
               FROM donations d
               JOIN campaigns c ON d.campaign_id = c.id
               JOIN users u ON d.donor_id = u.id
               WHERE d.id = ?`,
              [this.lastID],
              (err, donation) => {
                if (err) {
                  console.error(err.message);
                  return res.status(500).json({ message: 'Server error while fetching created donation' });
                }

                res.json({ 
                  message: 'Donation created successfully', 
                  donation 
                });
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/donations/blockchain
// @desc    Create a blockchain donation
// @access  Private
router.post('/blockchain', [
  auth,
  [
    check('campaignId', 'Campaign ID is required').not().isEmpty(),
    check('amount', 'Amount is required').isNumeric(),
    check('transactionHash', 'Transaction hash is required').not().isEmpty(),
    check('donorAddress', 'Donor address is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { campaignId, amount, transactionHash, donorAddress, gasUsed } = req.body;

  try {
    console.log('💰 Processing blockchain donation...');
    console.log(`- Campaign ID: ${campaignId}`);
    console.log(`- Amount: ${amount} ETH`);
    console.log(`- Donor: ${donorAddress}`);
    console.log(`- Transaction: ${transactionHash}`);

    // Verify campaign exists and is on blockchain
    db.get(
      'SELECT * FROM campaigns WHERE id = ? AND blockchain_campaign_id IS NOT NULL AND blockchain_campaign_id != ""',
      [campaignId],
      (err, campaign) => {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ message: 'Server error while verifying campaign' });
        }

        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or not deployed on blockchain' });
        }

        // Insert blockchain donation record
        db.run(
          `INSERT INTO donations (campaign_id, donor_id, amount, transaction_hash, donor_address) 
           VALUES (?, ?, ?, ?, ?)`,
          [campaignId, req.user.id, amount, transactionHash, donorAddress],
          function(err) {
            if (err) {
              console.error('Database error:', err.message);
              return res.status(500).json({ message: 'Server error while creating donation record' });
            }

            // Update campaign current_amount
            db.run(
              `UPDATE campaigns SET current_amount = COALESCE(current_amount, 0) + ? WHERE id = ?`,
              [amount, campaignId],
              function(updateErr) {
                if (updateErr) {
                  console.error('Error updating campaign amount:', updateErr.message);
                  // Don't fail the request, just log the error
                }

                console.log('✅ Blockchain donation recorded successfully!');

                // Get the created donation with campaign info
                db.get(
                  `SELECT d.*, c.title as campaign_title, u.name as donor_name, c.blockchain_campaign_id
                   FROM donations d
                   JOIN campaigns c ON d.campaign_id = c.id
                   JOIN users u ON d.donor_id = u.id
                   WHERE d.id = ?`,
                  [this.lastID],
                  (err, donation) => {
                    if (err) {
                      console.error(err.message);
                      return res.status(500).json({ message: 'Server error while fetching created donation' });
                    }

                    res.json({ 
                      message: 'Blockchain donation recorded successfully!', 
                      donation,
                      blockchainDetails: {
                        campaignId: campaign.blockchain_campaign_id,
                        transactionHash: transactionHash,
                        gasUsed: gasUsed
                      }
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// @route   GET api/donations/user/:userId
// @desc    Get donations by user
// @access  Private
router.get('/user/:userId', auth, (req, res) => {
  try {
    // Check if user is requesting their own donations or is admin
    if (req.user.id !== parseInt(req.params.userId) && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    db.all(
      `SELECT d.*, c.title as campaign_title 
       FROM donations d
       JOIN campaigns c ON d.campaign_id = c.id
       WHERE d.donor_id = ?
       ORDER BY d.created_at DESC`,
      [req.params.userId],
      (err, donations) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        res.json(donations);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/donations/campaign/:campaignId
// @desc    Get donations for a campaign
// @access  Public
router.get('/campaign/:campaignId', (req, res) => {
  try {
    db.all(
      `SELECT d.*, u.name as donor_name
       FROM donations d
       JOIN users u ON d.donor_id = u.id
       WHERE d.campaign_id = ?
       ORDER BY d.created_at DESC`,
      [req.params.campaignId],
      (err, donations) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        res.json(donations);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/donations
// @desc    Get all donations (admin only)
// @access  Private/Admin
router.get('/', auth, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    db.all(
      `SELECT d.*, c.title as campaign_title, u.name as donor_name
       FROM donations d
       JOIN campaigns c ON d.campaign_id = c.id
       JOIN users u ON d.donor_id = u.id
       ORDER BY d.created_at DESC`,
      (err, donations) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        res.json(donations);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;