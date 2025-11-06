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
// @desc    Create a campaign (multipart form data) - AUTO DEPLOY TO BLOCKCHAIN
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

    console.log('🚀 Creating campaign (pending admin approval)...');
    console.log(`- Title: ${title}`);
    console.log(`- Goal: ${goal} ETH`);
    console.log(`- Deadline: ${deadline}`);
    console.log(`- Creator: ${req.user.email}`);

    // Create campaign as pending (no blockchain deployment yet)
    let blockchainCampaignId = '';
    let transactionHash = '';
    let status = 'pending'; // Always pending until admin approves and fundraiser confirms deployment

    console.log('📝 Campaign created in database - pending admin approval');

    // Create campaign in database
    db.run(
      `INSERT INTO campaigns (title, description, goal, deadline, creator_id, wallet_address, image_url, document_url, status, category, blockchain_campaign_id, transaction_hash) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, goal, deadline, req.user.id, walletAddress, imageUrl, documentUrl, status, category || 'general', blockchainCampaignId, transactionHash],
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

            const message = 'Campaign created successfully! Your campaign is now pending admin approval. You will be notified once it\'s approved and ready for blockchain deployment.';

            res.json({ 
              message,
              campaign,
              blockchainDetails: {
                campaignId: blockchainCampaignId,
                transactionHash: transactionHash,
                deployed: false // Not deployed yet - pending admin approval
              }
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

// @route   POST api/campaigns/json
// @desc    Create a campaign (JSON data)
// @access  Private
router.post('/json', [
  auth,
  express.json(), // Parse JSON body
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
    const { title, description, goal, deadline, walletAddress, category, blockchainCampaignId, transactionHash } = req.body;

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

    // Determine campaign status - if blockchainCampaignId is provided, set to active, otherwise pending
    const status = blockchainCampaignId ? 'active' : 'pending';

    db.run(
      `INSERT INTO campaigns (title, description, goal, deadline, creator_id, wallet_address, status, category, blockchain_campaign_id, transaction_hash) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, goal, deadline, req.user.id, walletAddress, status, category || 'general', blockchainCampaignId || '', transactionHash || ''],
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
              message: blockchainCampaignId ? 'Campaign created and deployed to blockchain successfully!' : 'Campaign created successfully and submitted for admin approval', 
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
    console.log('🔍 Fetching campaigns for user ID:', req.user.id);
    db.all(
      `SELECT c.*, u.name as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.creator_id = ? 
         AND c.title NOT IN ('hp', 'mech', 'test')
         AND c.title NOT LIKE 'Blockchain Campaign #%'
         AND c.description NOT LIKE 'Campaign created directly on blockchain%'
       ORDER BY c.created_at DESC`,
      [req.user.id],
      (err, campaigns) => {
        if (err) {
          console.error('❌ Database error:', err.message);
          return res.status(500).json({ message: 'Server error' });
        }

        console.log('✅ Found campaigns:', campaigns ? campaigns.length : 0);
        console.log('📊 Campaigns data:', campaigns);
        res.json(campaigns);
      }
    );
  } catch (err) {
    console.error('❌ Route error:', err.message);
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
       WHERE c.status IN ('approved', 'active')
         AND COALESCE(c.is_withdrawn, 0) = 0
         AND (
           c.deadline IS NULL OR c.deadline = '' OR datetime(c.deadline) > CURRENT_TIMESTAMP
         )
         AND c.title NOT LIKE 'Blockchain Campaign #%'
         AND c.description NOT LIKE 'Campaign created directly on blockchain%'
         AND c.title NOT LIKE 'Properly Integrated Campaign%'
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
// @desc    Get all campaigns (including pending for admin)
// @access  Public
router.get('/', (req, res) => {
  try {
    db.all(
      `SELECT c.*, u.username as creator_name 
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.title NOT IN ('hp', 'mech', 'test')
         AND c.title NOT LIKE 'Blockchain Campaign #%'
         AND c.description NOT LIKE 'Campaign created directly on blockchain%'
         AND c.title NOT LIKE 'Properly Integrated Campaign%'
       ORDER BY c.created_at DESC`,
      (err, campaigns) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        // Additional filtering in case some slip through
        const filteredCampaigns = campaigns.filter(c => {
          return !c.title.includes('Blockchain Campaign #') &&
                 !c.description.includes('Campaign created directly on blockchain');
        });

        res.json(filteredCampaigns);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/campaigns/health
// @desc    Health check for campaigns API
// @access  Public
router.get('/health', (req, res) => {
  try {
    res.json({ 
      status: 'ok', 
      message: 'Campaigns API is working',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Campaigns API health check failed',
      error: err.message
    });
  }
});

// @route   GET api/campaigns/optimized
// @desc    Get campaigns with optimized data for donor dashboard
// @access  Public
router.get('/optimized', (req, res) => {
  try {
    console.log('Fetching optimized campaigns...');
    db.all(
      `SELECT c.id, c.title, c.description, c.goal, c.current_amount, c.deadline, 
              c.image_url, c.status, c.is_withdrawn, c.blockchain_campaign_id, c.wallet_address,
              u.username as creator_name,
              c.status as campaign_status
       FROM campaigns c 
       JOIN users u ON c.creator_id = u.id 
       WHERE c.status IN ('approved', 'active', 'completed')
         AND c.title NOT IN ('hp', 'mech', 'test')
         AND c.title NOT LIKE 'Blockchain Campaign #%'
         AND c.description NOT LIKE 'Campaign created directly on blockchain%'
         AND c.title NOT LIKE 'Properly Integrated Campaign%'
       ORDER BY c.created_at DESC`,
      (err, campaigns) => {
        if (err) {
          console.error('Database error in /optimized:', err.message);
          console.error('Full error:', err);
          return res.status(500).json({ 
            message: 'Database error', 
            error: err.message,
            details: 'Failed to fetch campaigns from database'
          });
        }

        console.log(`Successfully fetched ${campaigns?.length || 0} campaigns`);
        res.json(campaigns || []);
      }
    );
  } catch (err) {
    console.error('Unexpected error in /optimized:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      details: 'Unexpected server error occurred'
    });
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

          // Get the actual withdrawal amount from blockchain
          let actualWithdrawalAmount = 0;
          try {
            const blockchainCampaign = await getCampaignFromBlockchain(campaign.blockchain_campaign_id);
            actualWithdrawalAmount = blockchainCampaign.amountRaised || 0;
            console.log('💰 Actual withdrawal amount from blockchain:', actualWithdrawalAmount, 'ETH');
          } catch (blockchainError) {
            console.warn('Could not fetch withdrawal amount from blockchain:', blockchainError.message);
          }

          // Update campaign to withdrawn with actual amount
          db.run(
            'UPDATE campaigns SET is_withdrawn = 1, status = "completed", current_amount = ? WHERE id = ?',
            [actualWithdrawalAmount, req.params.id],
            function(err) {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              res.json({ 
                msg: 'Campaign marked as withdrawn successfully!',
                withdrawalAmount: actualWithdrawalAmount,
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
router.put('/:id/confirm-deployment', auth, async (req, res) => {
  try {
    const { blockchainCampaignId, transactionHash, gasUsed } = req.body;
    
    // Verify the campaign exists and user is authorized (admin can update any campaign)
    const whereClause = req.user.role === 'admin' ? 'WHERE id = ?' : 'WHERE id = ? AND creator_id = ?';
    const params = req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id];
    
    db.get(
      `SELECT * FROM campaigns ${whereClause}`,
      params,
      async (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or not authorized for deployment confirmation' });
        }

        let resolvedBlockchainId = blockchainCampaignId;

        // If blockchainCampaignId not provided, try to decode from tx hash
        if ((!resolvedBlockchainId || resolvedBlockchainId === '0' || resolvedBlockchainId === '') && transactionHash) {
          try {
            const { initBlockchain } = require('../../utils/blockchain');
            const { web3 } = initBlockchain();
            if (!web3) {
              console.warn('Blockchain not initialized; cannot decode tx to derive campaign id');
            } else {
              const receipt = await web3.eth.getTransactionReceipt(transactionHash);
              if (receipt && receipt.logs && receipt.logs.length) {
                // Topic[0] is the event signature
                const signature = web3.utils.sha3('CampaignCreated(uint256,address,uint256,uint256)');
                const createdLog = receipt.logs.find(l => l.topics && l.topics[0] === signature);
                if (createdLog && createdLog.topics && createdLog.topics[1]) {
                  // campaignId indexed -> topics[1]
                  resolvedBlockchainId = web3.utils.hexToNumberString(createdLog.topics[1]);
                  console.log(`🧩 Derived blockchain campaign ID from tx ${transactionHash}: ${resolvedBlockchainId}`);
                }
              }
            }
          } catch (decodeErr) {
            console.warn('Could not decode CampaignCreated from transaction:', decodeErr.message);
          }
        }
        
        // Validate that we have a blockchain campaign ID
        if (!resolvedBlockchainId || resolvedBlockchainId === '0' || resolvedBlockchainId === '') {
          return res.status(400).json({ 
            message: 'Blockchain campaign ID is required for deployment confirmation',
            details: 'The campaign ID was not properly extracted from the blockchain transaction. Please check the transaction on Etherscan and try again.'
          });
        }
        
        // Update campaign with blockchain details and mark as active
        console.log('🔄 Updating campaign in database with blockchain details...');
        console.log(`- Campaign ID: ${req.params.id}`);
        console.log(`- Blockchain ID: ${resolvedBlockchainId}`);
        console.log(`- Transaction Hash: ${transactionHash || campaign.transaction_hash || ''}`);
        
        db.run(
          'UPDATE campaigns SET status = "active", blockchain_campaign_id = ?, transaction_hash = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?',
          [resolvedBlockchainId, transactionHash || campaign.transaction_hash || '', req.params.id],
          function(err) {
            if (err) {
              console.error('❌ Database update error:', err.message);
              console.error('❌ Error details:', err);
              return res.status(500).json({ 
                message: 'Database error while updating campaign',
                error: err.message,
                details: 'Failed to update campaign with blockchain details'
              });
            }
            
            console.log(`✅ Database updated successfully. Changes: ${this.changes}`);
            
            if (this.changes === 0) {
              console.error('❌ No rows updated - campaign not found');
              return res.status(404).json({ message: 'Campaign not found or already updated' });
            }
            
            console.log(`✅ Campaign "${campaign.title}" confirmed and deployed by fundraiser`);
            console.log(`- Blockchain ID: ${resolvedBlockchainId}`);
            console.log(`- Transaction: ${transactionHash}`);
            
            // Create notification for successful deployment
            (async () => {
              try {
                const { createNotification } = require('./notifications');
                await createNotification(
                  campaign.creator_id,
                  campaign.id,
                  'campaign_deployed',
                  '🚀 Campaign Deployed Successfully!',
                  `Your campaign "${campaign.title}" has been successfully deployed to the blockchain! Blockchain ID: ${resolvedBlockchainId}. Your campaign is now live and ready to receive donations.`
                );
                console.log('✅ Deployment notification sent to fundraiser');
              } catch (notificationError) {
                console.error('⚠️ Failed to send deployment notification:', notificationError.message);
              }
            })();
            
            res.json({ 
              message: 'Campaign deployment confirmed successfully! Your campaign is now live on the blockchain.',
              success: true,
              campaign: {
                id: campaign.id,
                title: campaign.title,
                status: 'active'
              },
              blockchainDetails: {
                campaignId: resolvedBlockchainId,
                transactionHash: transactionHash || campaign.transaction_hash || '',
                gasUsed: gasUsed,
                etherscanUrl: `https://sepolia.etherscan.io/tx/${transactionHash || campaign.transaction_hash || ''}`
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

// @route   POST api/campaigns/:id/updateBlockchainId
// @desc    Update campaign with blockchain ID and transaction hash after creation
// @access  Private
router.post('/:id/updateBlockchainId', auth, (req, res) => {
  try {
    const { blockchainId, txHash } = req.body;
    
    // Verify the campaign belongs to the user
    db.get(
      'SELECT * FROM campaigns WHERE id = ? AND creator_id = ?',
      [req.params.id, req.user.id],
      (err, campaign) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (!campaign) {
          return res.status(404).json({ message: 'Campaign not found or not authorized' });
        }
        
        // Update campaign with blockchain details
        db.run(
          'UPDATE campaigns SET blockchain_campaign_id = ?, transaction_hash = ? WHERE id = ?',
          [blockchainId, txHash, req.params.id],
          function(err) {
            if (err) {
              console.error(err.message);
              return res.status(500).json({ message: 'Server error' });
            }
            
            if (this.changes === 0) {
              return res.status(404).json({ message: 'Campaign not found' });
            }
            
            console.log(`✅ Campaign "${campaign.title}" updated with blockchain ID: ${blockchainId}`);
            console.log(`- Transaction: ${txHash}`);
            
            res.json({ 
              message: 'Campaign updated with blockchain details successfully!',
              blockchainDetails: {
                campaignId: blockchainId,
                transactionHash: txHash
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

// Donation route
router.post('/:id/donate', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, donor_address } = req.body;
    
    console.log('💰 Donation request:', { campaignId: id, amount, donor_address });
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid donation amount' });
    }
    
    // Get campaign details
    db.get('SELECT * FROM campaigns WHERE id = ?', [id], (err, campaign) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Database error' });
      }
      
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      
      // Update campaign with new donation
      const newAmount = (campaign.current_amount || 0) + parseFloat(amount);
      
      db.run(
        'UPDATE campaigns SET current_amount = ? WHERE id = ?',
        [newAmount, id],
        function(err) {
          if (err) {
            console.error('Update error:', err);
            return res.status(500).json({ message: 'Failed to update campaign' });
          }
          
          // Insert donation record
          db.run(
            'INSERT INTO donations (campaign_id, donor_address, amount, created_at) VALUES (?, ?, ?, datetime("now"))',
            [id, donor_address || 'anonymous', amount],
            function(err) {
              if (err) {
                console.error('Donation record error:', err);
                return res.status(500).json({ message: 'Failed to record donation' });
              }
              
              console.log('✅ Donation successful:', { campaignId: id, amount, newTotal: newAmount });
              res.json({ 
                message: 'Donation successful', 
                amount: amount,
                newTotal: newAmount,
                campaignId: id
              });
            }
          );
        }
      );
    });
    
  } catch (err) {
    console.error('Donation error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Withdrawal route
router.post('/:id/withdraw', async (req, res) => {
  try {
    const { id } = req.params;
    const { withdrawer_address } = req.body;
    
    console.log('💸 Withdrawal request:', { campaignId: id, withdrawer_address });
    
    // Get campaign details
    db.get('SELECT * FROM campaigns WHERE id = ?', [id], (err, campaign) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Database error' });
      }
      
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      
      // Check if campaign goal is met
      if (campaign.current_amount < campaign.goal) {
        return res.status(400).json({ message: 'Campaign goal not met yet' });
      }
      
      // Mark campaign as withdrawn
      db.run(
        'UPDATE campaigns SET is_withdrawn = 1 WHERE id = ?',
        [id],
        function(err) {
          if (err) {
            console.error('Withdrawal error:', err);
            return res.status(500).json({ message: 'Failed to process withdrawal' });
          }
          
          console.log('✅ Withdrawal successful:', { campaignId: id, amount: campaign.current_amount });
          res.json({ 
            message: 'Withdrawal successful', 
            amount: campaign.current_amount,
            campaignId: id
          });
        }
      );
    });
    
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;