const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

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

// @route   POST api/fund-usage-plans
// @desc    Create a fund usage plan item
// @access  Private (Fundraiser only)
router.post('/', [
    auth,
    upload.single('bill'),
    [
        check('campaignId', 'Campaign ID is required').not().isEmpty(),
        check('category', 'Category is required').not().isEmpty(),
        check('amount', 'Amount is required').isNumeric(),
        check('description', 'Description is required').not().isEmpty()
    ]
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { campaignId, category, amount, description } = req.body;
        const billUrl = req.file ? `/uploads/${req.file.filename}` : null;

        // Verify campaign ownership
        db.get('SELECT creator_id FROM campaigns WHERE id = ?', [campaignId], (err, campaign) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
            }
            if (!campaign) {
                return res.status(404).json({ msg: 'Campaign not found' });
            }
            if (campaign.creator_id !== req.user.id) {
                return res.status(401).json({ msg: 'Not authorized' });
            }

            // Insert usage plan
            db.run(
                `INSERT INTO fund_usage_plans (campaign_id, category, amount, description, bill_url, approval_status, withdrawal_status) 
         VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`,
                [campaignId, category, amount, description, billUrl],
                function (err) {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Server error');
                    }
                    res.json({
                        id: this.lastID,
                        campaignId,
                        category,
                        amount,
                        description,
                        billUrl,
                        approval_status: 'pending',
                        withdrawal_status: 'pending'
                    });
                }
            );
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/fund-usage-plans/:campaignId
// @desc    Get fund usage plans for a campaign with approval status
// @access  Public
router.get('/:campaignId', (req, res) => {
    try {
        db.all(
            `SELECT fup.*, 
                    COUNT(DISTINCT fpa.donor_id) as approval_count,
                    (SELECT COUNT(DISTINCT donor_id) FROM donations WHERE campaign_id = ?) as total_donors
             FROM fund_usage_plans fup
             LEFT JOIN fund_plan_approvals fpa ON fup.id = fpa.plan_id AND fpa.approved = 1
             WHERE fup.campaign_id = ?
             GROUP BY fup.id
             ORDER BY fup.created_at DESC`,
            [req.params.campaignId, req.params.campaignId],
            (err, plans) => {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send('Server error');
                }
                res.json(plans);
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST api/fund-usage-plans/:planId/approve
// @desc    Donor approves/rejects usage plan
// @access  Private (Donors only)
router.post('/:planId/approve', [auth], async (req, res) => {
    try {
        const { approved } = req.body; // true or false
        const planId = req.params.planId;
        const donorId = req.user.id;

        // Get plan to find campaignId
        db.get('SELECT campaign_id FROM fund_usage_plans WHERE id = ?', [planId], (err, plan) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
            }
            if (!plan) {
                return res.status(404).json({ msg: 'Plan not found' });
            }

            const campaignId = plan.campaign_id;

            // Check if user is a donor for this campaign
            db.get(
                'SELECT * FROM donations WHERE campaign_id = ? AND donor_id = ?',
                [campaignId, donorId],
                (err, donation) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Server error');
                    }
                    if (!donation) {
                        return res.status(403).json({ msg: 'You must be a donor to approve' });
                    }

                    // Insert or update approval
                    db.run(
                        `INSERT INTO fund_plan_approvals (plan_id, donor_id, approved) 
                         VALUES (?, ?, ?)
                         ON CONFLICT(plan_id, donor_id) 
                         DO UPDATE SET approved = ?, created_at = CURRENT_TIMESTAMP`,
                        [planId, donorId, approved ? 1 : 0, approved ? 1 : 0],
                        function (err) {
                            if (err) {
                                console.error(err.message);
                                return res.status(500).send('Server error');
                            }

                            // Update approval count and status in fund_usage_plans
                            db.get(
                                `SELECT COUNT(DISTINCT fpa.donor_id) as approval_count,
                                        (SELECT COUNT(DISTINCT donor_id) FROM donations WHERE campaign_id = ?) as total_donors
                                 FROM fund_plan_approvals fpa
                                 WHERE fpa.plan_id = ? AND fpa.approved = 1`,
                                [campaignId, planId],
                                (err, counts) => {
                                    if (err) {
                                        console.error(err.message);
                                        return res.status(500).send('Server error');
                                    }

                                    const approvalRate = counts.total_donors > 0
                                        ? counts.approval_count / counts.total_donors
                                        : 0;

                                    const newStatus = approvalRate >= 0.5 ? 'approved' : 'pending';

                                    db.run(
                                        `UPDATE fund_usage_plans 
                                         SET approval_status = ?, approved_by_count = ? 
                                         WHERE id = ?`,
                                        [newStatus, counts.approval_count, planId],
                                        (err) => {
                                            if (err) {
                                                console.error(err.message);
                                                return res.status(500).send('Server error');
                                            }
                                            res.json({
                                                msg: approved ? 'Plan approved' : 'Plan rejected',
                                                approved_by_count: counts.approval_count,
                                                total_donors: counts.total_donors,
                                                approval_status: newStatus
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST api/fund-usage-plans/:planId/mark-withdrawn
// @desc    Mark a specific plan as withdrawn
// @access  Private (Fundraiser only)
router.post('/:planId/mark-withdrawn', [auth], async (req, res) => {
    try {
        const { planId } = req.params;
        const { txHash } = req.body;

        // Get the plan and verify ownership
        db.get(
            `SELECT fup.*, c.creator_id 
             FROM fund_usage_plans fup
             JOIN campaigns c ON fup.campaign_id = c.id
             WHERE fup.id = ?`,
            [planId],
            (err, plan) => {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send('Server error');
                }
                if (!plan) {
                    return res.status(404).json({ msg: 'Plan not found' });
                }
                if (plan.creator_id !== req.user.id) {
                    return res.status(403).json({ msg: 'Not authorized' });
                }
                if (plan.approval_status !== 'approved') {
                    return res.status(400).json({ msg: 'Plan not approved yet' });
                }
                if (plan.withdrawal_status === 'withdrawn') {
                    return res.status(400).json({ msg: 'Plan already withdrawn' });
                }

                // Mark as withdrawn
                db.run(
                    `UPDATE fund_usage_plans 
                     SET withdrawal_status = 'withdrawn', 
                         withdrawn_at = CURRENT_TIMESTAMP,
                         withdrawal_tx_hash = ?
                     WHERE id = ?`,
                    [txHash, planId],
                    (err) => {
                        if (err) {
                            console.error(err.message);
                            return res.status(500).send('Server error');
                        }
                        res.json({ msg: 'Plan marked as withdrawn', planId, txHash });
                    }
                );
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
