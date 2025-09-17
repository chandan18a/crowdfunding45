const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const { createNotification } = require('./notifications');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Configure multer for file uploads with better error handling
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File filter with better error handling
const fileFilter = (req, file, cb) => {
  // Allow all files for now, but validate in the route
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// For multiple file uploads (campaign creation)
const uploadMultiple = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'document', maxCount: 1 }]);

// @route   POST api/campaigns
// @desc    Create a campaign
// @access  Private
router.post('/', [
  auth,
  (req, res, next) => {
    // Handle multer upload with proper error handling
    uploadMultiple(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading
        console.error('Multer error:', err);
        return res.status(400).json({ message: 'File upload error: ' + err.message });
      } else if (err) {
        // An unknown error occurred when uploading
        console.error('Unknown file upload error:', err);
        return res.status(500).json({ message: 'Server error during file upload: ' + err.message });
      }
      // Everything went fine
      next();
    });
  },
  [
    check('title', 'Title is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('goal', 'Goal amount is required').isNumeric(),
    check('deadline', 'Deadline is required').isISO8601(),
    check('walletAddress', 'Wallet address is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Fix the file handling - safely check for file existence
    let imageUrl = null;
    let documentUrl = null;
    
    if (req.files) {
      if (req.files.image && req.files.image.length > 0) {
        imageUrl = `/uploads/${req.files.image[0].filename}`;
      }
      if (req.files.document && req.files.document.length > 0) {
        documentUrl = `/uploads/${req.files.document[0].filename}`;
      }
    }

    const { title, description, goal, deadline, walletAddress, category } = req.body;

    // Validate that goal is greater than 0
    if (parseFloat(goal) <= 0) {
      return res.status(400).json({ message: 'Goal amount must be greater than 0' });
    }

    // Validate that deadline is in the future
    const deadlineDate = new Date(deadline);
    const currentDate = new Date();
    if (deadlineDate <= currentDate) {
      return res.status(400).json({ message: 'Deadline must be in the future' });
    }

    // Calculate duration in seconds to validate it
    const diffMs = deadlineDate.getTime() - currentDate.getTime();
    const durationInSeconds = Math.floor(diffMs / 1000);
    
    // Ensure minimum duration of 1 day (86400 seconds)
    if (durationInSeconds < 86400) {
      return res.status(400).json({ message: 'Campaign duration must be at least 1 day' });
    }

    db.run(
      `INSERT INTO campaigns (title, description, goal, deadline, creator_id, wallet_address, image_url, document_url, status, category) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [title, description, goal, deadline, req.user.id, walletAddress, imageUrl, documentUrl, category || 'general'],
      function(err) {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ message: 'Server error while creating campaign: ' + err.message });
        }

        // Get the created campaign
        db.get(
          `SELECT c.*, u.username as creator_name 
           FROM campaigns c 
           JOIN users u ON c.creator_id = u.id 
           WHERE c.id = ?`,
          [this.lastID],
          (err, campaign) => {
            if (err) {
              console.error('Database error:', err.message);
              return res.status(500).json({ message: 'Server error while fetching created campaign: ' + err.message });
            }

            res.json({ 
              message: 'Campaign created successfully and submitted for admin approval', 
              campaign 
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// @route   GET api/campaigns/my-campaigns
// @desc    Get current user's campaigns
// @access  Private
router.get('/my-campaigns', auth, (req, res) => {
  try {
    db.all(
      `SELECT c.*, u.name as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.creator_id = ? 
       ORDER BY c.created_at DESC`,
      [req.user.id],
      (err, campaigns) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        res.json({ campaigns });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/campaigns/active
// @desc    Get active campaigns
// @access  Public
router.get('/active', (req, res) => {
  try {
    db.all(
      `SELECT c.*, u.name as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.status = 'approved'
       ORDER BY c.created_at DESC`,
      (err, campaigns) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        res.json(campaigns);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/campaigns
// @desc    Get all campaigns
// @access  Public
router.get('/', (req, res) => {
  try {
    db.all(
      `SELECT c.*, u.username as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       ORDER BY c.created_at DESC`,
      (err, campaigns) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        res.json(campaigns);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/campaigns/:id
// @desc    Get campaign by ID
// @access  Public
router.get('/:id', (req, res) => {
  try {
    db.get(
      `SELECT c.*, u.username as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.id = ?`,
      [req.params.id],
      (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        if (!campaign) {
          return res.status(404).json({ msg: 'Campaign not found' });
        }

        res.json(campaign);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/campaigns/:id
// @desc    Update campaign
// @access  Private
router.put('/:id', 
  auth,
  (req, res, next) => {
    // Handle single file upload for image updates
    upload.single('image')(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading
        console.error('Multer error:', err);
        return res.status(400).json({ message: 'File upload error: ' + err.message });
      } else if (err) {
        // An unknown error occurred when uploading
        console.error('Unknown file upload error:', err);
        return res.status(500).json({ message: 'Server error during file upload: ' + err.message });
      }
      // Everything went fine
      next();
    });
  },
  [
    check('title', 'Title is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('goal', 'Goal amount is required').isNumeric(),
    check('deadline', 'Deadline is required').isISO8601()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Check if campaign exists and belongs to user
      db.get(
        'SELECT * FROM campaigns WHERE id = ?',
        [req.params.id],
        (err, campaign) => {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          if (!campaign) {
            return res.status(404).json({ msg: 'Campaign not found' });
          }

          // Check if user is creator or admin
          if (campaign.creator_id !== req.user.id && !req.user.isAdmin) {
            return res.status(401).json({ msg: 'Not authorized' });
          }

          const { title, description, goal, deadline } = req.body;
          const image = req.file ? `/uploads/${req.file.filename}` : campaign.image_url;

          // Update campaign
          db.run(
            `UPDATE campaigns 
             SET title = ?, description = ?, goal = ?, deadline = ?, image_url = ? 
             WHERE id = ?`,
            [title, description, goal, deadline, image, req.params.id],
            function(err) {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              // Get updated campaign
              db.get(
                `SELECT c.*, u.username as creator_name 
                 FROM campaigns c 
                 JOIN users u ON c.creator_id = u.id 
                 WHERE c.id = ?`,
                [req.params.id],
                (err, updatedCampaign) => {
                  if (err) {
                    console.error(err.message);
                    return res.status(500).send('Server error');
                  }

                  res.json(updatedCampaign);
                }
              );
            }
          );
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   PUT api/campaigns/:id/status
// @desc    Update campaign status (admin only)
// @access  Private/Admin
router.put('/:id/status', [
  auth,
  check('status', 'Status is required').isIn(['pending', 'approved', 'rejected', 'completed'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    const { status } = req.body;

    // Update campaign status
    db.run(
      'UPDATE campaigns SET status = ? WHERE id = ?',
      [status, req.params.id],
      function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        if (this.changes === 0) {
          return res.status(404).json({ msg: 'Campaign not found' });
        }

        res.json({ msg: `Campaign status updated to ${status}` });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/campaigns/:id/withdraw
// @desc    Mark campaign as withdrawn
// @access  Private
router.put('/:id/withdraw', auth, async (req, res) => {
  try {
    // Check if campaign exists and belongs to user
    db.get(
      'SELECT * FROM campaigns WHERE id = ?',
      [req.params.id],
      async (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        if (!campaign) {
          return res.status(404).json({ msg: 'Campaign not found' });
        }

        // Check if user is creator
        if (campaign.creator_id !== req.user.id) {
          return res.status(401).json({ msg: 'Not authorized' });
        }

        // Check if campaign is on blockchain
        if (!campaign.blockchain_campaign_id || campaign.blockchain_campaign_id === '0') {
          return res.status(400).json({ msg: 'Campaign is not deployed on blockchain' });
        }

        try {
          // Import blockchain utilities
          const { getCampaignFromBlockchain, canWithdrawFunds } = require('../../utils/blockchain');
          
          // Check if withdrawal is allowed on blockchain
          const withdrawalStatus = await canWithdrawFunds(campaign.blockchain_campaign_id);
          
          if (!withdrawalStatus.canWithdraw) {
            return res.status(400).json({ 
              msg: 'Withdrawal conditions not met',
              details: withdrawalStatus
            });
          }

          // Update campaign to withdrawn
          db.run(
            'UPDATE campaigns SET is_withdrawn = 1, status = "completed" WHERE id = ?',
            [req.params.id],
            function(err) {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              res.json({ 
                msg: 'Campaign marked as withdrawn successfully!',
                blockchainStatus: withdrawalStatus
              });
            }
          );
        } catch (blockchainError) {
          console.error('Blockchain error:', blockchainError.message);
          return res.status(500).json({ 
            msg: 'Failed to verify blockchain withdrawal conditions',
            error: blockchainError.message 
          });
        }
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/campaigns/user/:userId
// @desc    Get campaigns by user ID
// @access  Public
router.get('/user/:userId', (req, res) => {
  try {
    db.all(
      `SELECT c.*, u.username as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.creator_id = ? 
       ORDER BY c.created_at DESC`,
      [req.params.userId],
      (err, campaigns) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        res.json(campaigns);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/campaigns/:id/confirm-deployment
// @desc    Confirm campaign deployment to blockchain (fundraiser pays gas)
// @access  Private (Fundraiser)
router.put('/:id/confirm-deployment', auth, (req, res) => {
  try {
    const { blockchainCampaignId, transactionHash, gasUsed } = req.body;
    
    // Verify the campaign belongs to the user and is approved
    db.get(
      'SELECT * FROM campaigns WHERE id = ? AND creator_id = ? AND status = "approved"',
      [req.params.id, req.user.id],
      (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or not authorized for deployment confirmation' });
        }
        
        // Update campaign with blockchain details and mark as active
        db.run(
          'UPDATE campaigns SET status = "active", blockchain_campaign_id = ?, transaction_hash = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?',
          [blockchainCampaignId, transactionHash, req.params.id],
          function(err) {
            if (err) {
              console.error(err.message);
              return res.status(500).json({ message: 'Server error' });
            }
            
            if (this.changes === 0) {
              return res.status(404).json({ message: 'Campaign not found' });
            }
            
            console.log(`✅ Campaign "${campaign.title}" confirmed and deployed by fundraiser`);
            console.log(`- Blockchain ID: ${blockchainCampaignId}`);
            console.log(`- Transaction: ${transactionHash}`);
            
            res.json({ 
              message: 'Campaign deployment confirmed successfully! Your campaign is now live on the blockchain.',
              blockchainDetails: {
                campaignId: blockchainCampaignId,
                transactionHash: transactionHash,
                gasUsed: gasUsed
              }
            });
          }
        );
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE api/campaigns/:id/delete
// @desc    Delete campaign by fundraiser (owner)
// @access  Private (Fundraiser)
router.delete('/:id/delete', auth, (req, res) => {
  try {
    // First check if campaign exists and user is the owner
    db.get(
      'SELECT * FROM campaigns WHERE id = ? AND creator_id = ?',
      [req.params.id, req.user.id],
      (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or you are not authorized to delete it' });
        }
        
        // Check if campaign has donations
        db.get(
          'SELECT COUNT(*) as donationCount FROM donations WHERE campaign_id = ?',
          [req.params.id],
          (err, result) => {
            if (err) {
              console.error(err.message);
              return res.status(500).json({ message: 'Server error' });
            }
            
            if (result.donationCount > 0) {
              return res.status(400).json({ 
                message: 'Cannot delete campaign with existing donations. Please contact admin for assistance.' 
              });
            }
            
            // Delete campaign
            db.run(
              'DELETE FROM campaigns WHERE id = ? AND creator_id = ?',
              [req.params.id, req.user.id],
              function(err) {
                if (err) {
                  console.error(err.message);
                  return res.status(500).json({ message: 'Server error' });
                }

                if (this.changes === 0) {
                  return res.status(404).json({ message: 'Campaign not found or already deleted' });
                }

                console.log(`✅ Campaign "${campaign.title}" deleted by fundraiser (ID: ${req.user.id})`);
                res.json({ message: 'Campaign deleted successfully' });
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

module.exports = router;