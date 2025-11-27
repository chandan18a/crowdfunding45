const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// @route   GET api/withdrawal-requests/:campaignId
// @desc    Get withdrawal requests for a campaign
// @access  Public
router.get('/:campaignId', (req, res) => {
    const { campaignId } = req.params;
    db.all(
        `SELECT 
      id, 
      campaign_id as campaignId, 
      request_id as requestId, 
      amount, 
      usage_details as usageDetails, 
      transaction_hash as transactionHash, 
      executed, 
      created_at as createdAt,
      document_url as documentUrl
     FROM withdrawal_requests 
     WHERE campaign_id = ? 
     ORDER BY request_id DESC`,
        [campaignId],
        (err, rows) => {
            if (err) {
                console.error('Error fetching withdrawal requests:', err);
                return res.status(500).json({ message: 'Server error' });
            }
            res.json(rows);
        }
    );
});

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// @route   POST api/withdrawal-requests
// @desc    Create a new withdrawal request (after blockchain submission)
// @access  Private
router.post('/', [auth, upload.single('bill')], (req, res) => {
    const { campaignId, requestId, amount, usageDetails, transactionHash } = req.body;
    const documentUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!campaignId || requestId === undefined || requestId === null || !amount || !usageDetails) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    db.run(
        `INSERT INTO withdrawal_requests (campaign_id, request_id, amount, usage_details, transaction_hash, document_url) 
     VALUES (?, ?, ?, ?, ?, ?)`,
        [campaignId, requestId, amount, usageDetails, transactionHash, documentUrl],
        function (err) {
            if (err) {
                console.error('Error creating withdrawal request:', err);
                return res.status(500).json({ message: 'Server error' });
            }
            res.json({ id: this.lastID, message: 'Withdrawal request recorded', documentUrl });
        }
    );
});

// @route   PUT api/withdrawal-requests/:requestId/execute
// @desc    Mark a withdrawal request as executed
// @access  Private
router.put('/:requestId/execute', auth, (req, res) => {
    const { requestId } = req.params;
    const { campaignId, transactionHash } = req.body;

    if (!campaignId) {
        return res.status(400).json({ message: 'Campaign ID is required' });
    }

    db.run(
        `UPDATE withdrawal_requests 
         SET executed = 1, transaction_hash = ? 
         WHERE request_id = ? AND campaign_id = ?`,
        [transactionHash || null, requestId, campaignId],
        function (err) {
            if (err) {
                console.error('Error updating withdrawal request:', err);
                return res.status(500).json({ message: 'Server error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ message: 'Withdrawal request not found' });
            }

            res.json({ message: 'Withdrawal request marked as executed' });
        }
    );
});

module.exports = router;
