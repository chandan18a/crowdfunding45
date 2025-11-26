const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: './.env' });

const CATEGORY_OPTIONS = ['TREATMENT', 'MEDICATIONS', 'TESTS', 'HOSPITAL_STAY', 'OTHER'];
const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED', 'SPENT'];

const usageUploadDir = path.join(process.cwd(), 'uploads', 'usage');
if (!fs.existsSync(usageUploadDir)) {
  fs.mkdirSync(usageUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, usageUploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row || null);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});

const optionalAuth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return next();
  }

  const secret = process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_development';
  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    return next();
  }

  db.get(
    'SELECT id, username, role, wallet_address FROM users WHERE id = ?',
    [decoded.user.id],
    (err, user) => {
      if (!err && user) {
        req.viewer = {
          id: user.id,
          role: user.role,
          wallet_address: user.wallet_address
        };
      }
      return next();
    }
  );
};

const normalizeNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeCategory = (category = 'OTHER') => {
  const upper = String(category).toUpperCase();
  return CATEGORY_OPTIONS.includes(upper) ? upper : 'OTHER';
};

const fetchCampaign = async (campaignId) => {
  const campaign = await dbGet('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }
  return campaign;
};

const fetchUsageRequest = async (requestId) => {
  const request = await dbGet('SELECT * FROM usage_requests WHERE id = ?', [requestId]);
  if (!request) {
    const error = new Error('Usage request not found');
    error.status = 404;
    throw error;
  }
  return request;
};

const getDonationSummary = async (campaignId) => {
  const row = await dbGet(
    `SELECT COUNT(DISTINCT donor_id) as totalDonors, COALESCE(SUM(amount), 0) as totalAmount
     FROM donations
     WHERE campaign_id = ?`,
    [campaignId]
  );
  return {
    totalDonors: row?.totalDonors || 0,
    totalAmount: row?.totalAmount || 0
  };
};

const isCampaignDonor = async (userId, campaignId) => {
  if (!userId) return false;
  const row = await dbGet(
    `SELECT COALESCE(SUM(amount), 0) as donated
     FROM donations
     WHERE campaign_id = ? AND donor_id = ?`,
    [campaignId, userId]
  );
  return (row?.donated || 0) > 0;
};

const calculateUsageFinancials = async (campaignId) => {
  const campaign = await fetchCampaign(campaignId);
  const usageRows = await dbAll(
    `SELECT * FROM usage_requests
     WHERE campaign_id = ?
     ORDER BY datetime(created_at) DESC`,
    [campaignId]
  );

  const summary = {
    totalRaised: normalizeNumber(campaign.current_amount),
    totalSpent: 0,
    totalApproved: 0,
    totalPending: 0,
    outstandingApproved: 0,
    remainingBalance: 0,
    categoryTotals: CATEGORY_OPTIONS.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), { OTHER: 0 })
  };

  usageRows.forEach((row) => {
    const requested = normalizeNumber(row.requested_amount);
    const actual = row.actual_amount != null ? normalizeNumber(row.actual_amount) : requested;
    const category = normalizeCategory(row.category);

    if (row.status === 'SPENT') {
      summary.totalSpent += actual;
      summary.totalApproved += requested;
      summary.categoryTotals[category] = (summary.categoryTotals[category] || 0) + actual;
    } else if (row.status === 'APPROVED') {
      summary.totalApproved += requested;
    } else if (row.status === 'PENDING') {
      summary.totalPending += requested;
    }
  });

  summary.outstandingApproved = Math.max(summary.totalApproved - summary.totalSpent, 0);
  const committed = summary.totalSpent + summary.outstandingApproved + summary.totalPending;
  summary.remainingBalance = Math.max(summary.totalRaised - committed, 0);

  return { campaign, usageRows, summary };
};

const mapRequestsWithStats = async (requests, campaignId, viewerId) => {
  if (!requests.length) {
    return [];
  }

  const ids = requests.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  const voteStatsRows = await dbAll(
    `SELECT usage_request_id,
            SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) as approvals,
            SUM(CASE WHEN vote = 0 THEN 1 ELSE 0 END) as rejections,
            COUNT(*) as total_votes,
            COALESCE(SUM(donated_amount), 0) as total_weighted,
            COALESCE(SUM(CASE WHEN vote = 1 THEN donated_amount ELSE 0 END), 0) as approved_weighted
     FROM usage_votes
     WHERE usage_request_id IN (${placeholders})
     GROUP BY usage_request_id`,
    ids
  );

  const statsMap = voteStatsRows.reduce((acc, row) => {
    acc[row.usage_request_id] = row;
    return acc;
  }, {});

  let viewerVotes = {};
  if (viewerId) {
    const viewerVoteRows = await dbAll(
      `SELECT usage_request_id, vote
       FROM usage_votes
       WHERE donor_id = ?
         AND usage_request_id IN (${placeholders})`,
      [viewerId, ...ids]
    );
    viewerVoteRows.forEach((row) => {
      viewerVotes[row.usage_request_id] = row.vote === 1;
    });
  }

  const { totalDonors, totalAmount } = await getDonationSummary(campaignId);

  return requests.map((row) => {
    const stats = statsMap[row.id] || {};
    const approvals = stats.approvals || 0;
    const rejections = stats.rejections || 0;
    const totalVotes = stats.total_votes || 0;
    const approvalRate = totalDonors > 0 ? approvals / totalDonors : 0;
    const weightedRate = totalAmount > 0 ? (stats.approved_weighted || 0) / totalAmount : 0;

    return {
      ...row,
      approvals: {
        approve_count: approvals,
        reject_count: rejections,
        total_votes: totalVotes,
        approval_rate: Number(approvalRate.toFixed(4)),
        weighted_rate: Number(weightedRate.toFixed(4)),
        total_donors: totalDonors
      },
      user_vote: viewerVotes.hasOwnProperty(row.id) ? viewerVotes[row.id] : null
    };
  });
};

const maybeAutoApprove = async (requestId) => {
  const request = await fetchUsageRequest(requestId);
  if (request.status !== 'PENDING') {
    return request;
  }

  const { totalDonors, totalAmount } = await getDonationSummary(request.campaign_id);
  if (totalDonors === 0) {
    return request;
  }

  const stats = await dbGet(
    `SELECT 
        SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) as approvals,
        SUM(CASE WHEN vote = 0 THEN 1 ELSE 0 END) as rejections,
        COALESCE(SUM(donated_amount), 0) as total_weighted,
        COALESCE(SUM(CASE WHEN vote = 1 THEN donated_amount ELSE 0 END), 0) as approved_weighted
     FROM usage_votes
     WHERE usage_request_id = ?`,
    [requestId]
  ) || { approvals: 0, total_weighted: 0, approved_weighted: 0 };

  const donorApprovalRate = totalDonors > 0 ? (stats.approvals || 0) / totalDonors : 0;
  const donationApprovalRate = totalAmount > 0 ? (stats.approved_weighted || 0) / totalAmount : 0;

  if (donorApprovalRate > 0.5 || donationApprovalRate > 0.5) {
    await dbRun(
      `UPDATE usage_requests 
       SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [requestId]
    );
    return fetchUsageRequest(requestId);
  }

  return request;
};

const buildRequestResponse = async (requestId, viewerId) => {
  const request = await fetchUsageRequest(requestId);
  const enriched = await mapRequestsWithStats([request], request.campaign_id, viewerId);
  return enriched[0];
};

// @route   POST /api/usage-requests
// @desc    Create a usage request (campaign owner only)
// @access  Private
router.post(
  '/',
  auth,
  (req, res, next) => {
    upload.single('supportingDoc')(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: 'File upload error', detail: err.message });
      } else if (err) {
        return res.status(500).json({ message: 'Unexpected file upload error', detail: err.message });
      }
      next();
    });
  },
  [
    check('campaignId', 'Campaign ID is required').not().isEmpty(),
    check('title', 'Title is required').not().isEmpty(),
    check('requestedAmount', 'Requested amount must be a positive number').isFloat({ gt: 0 }),
    check('category', 'Category is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const campaignId = parseInt(req.body.campaignId, 10);
      if (Number.isNaN(campaignId)) {
        return res.status(400).json({ message: 'Invalid campaign ID' });
      }

      const campaign = await fetchCampaign(campaignId);
      if (campaign.creator_id !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: 'Only the campaign owner can create usage requests' });
      }

      const category = normalizeCategory(req.body.category);
      const requestedAmount = normalizeNumber(req.body.requestedAmount);
      const { summary } = await calculateUsageFinancials(campaignId);

      if (requestedAmount > summary.remainingBalance) {
        return res.status(400).json({
          message: 'Requested amount exceeds remaining available funds',
          remainingBalance: summary.remainingBalance
        });
      }

      const supportingDocsUrl = req.file ? `/uploads/usage/${req.file.filename}` : null;

      const { lastID } = await dbRun(
        `INSERT INTO usage_requests 
         (campaign_id, title, category, requested_amount, description, status, supporting_docs_url, created_by)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [
          campaignId,
          req.body.title,
          category,
          requestedAmount,
          req.body.description || '',
          supportingDocsUrl,
          req.user.id
        ]
      );

      const response = await buildRequestResponse(lastID, req.user.id);
      return res.json({
        message: 'Usage request created successfully',
        request: response
      });
    } catch (error) {
      console.error('Error creating usage request:', error);
      const status = error.status || 500;
      return res.status(status).json({ message: error.message || 'Server error' });
    }
  }
);

// @route   GET /api/usage-requests/:campaignId
// @desc    List usage requests for a campaign
// @access  Public (viewer auth optional)
router.get('/:campaignId', optionalAuth, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId, 10);
    if (Number.isNaN(campaignId)) {
      return res.status(400).json({ message: 'Invalid campaign ID' });
    }

    const { campaign, usageRows, summary } = await calculateUsageFinancials(campaignId);
    const viewerId = req.viewer?.id || null;
    const requests = await mapRequestsWithStats(usageRows, campaignId, viewerId);
    const { totalDonors } = await getDonationSummary(campaignId);
    const isOwner = viewerId ? viewerId === campaign.creator_id : false;
    const isDonor = viewerId ? await isCampaignDonor(viewerId, campaignId) : false;

    return res.json({
      campaign_id: campaignId,
      summary,
      total_donors: totalDonors,
      requests,
      viewer: {
        user_id: viewerId,
        is_owner: isOwner || req.viewer?.role === 'admin',
        is_donor: isDonor,
        role: req.viewer?.role || null
      }
    });
  } catch (error) {
    console.error('Error fetching usage requests:', error);
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/usage-requests/:id/vote
// @desc    Donor vote approve/reject
// @access  Private (donors only)
router.post(
  '/:id/vote',
  auth,
  [
    check('vote', 'Vote must be a boolean value').isBoolean()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const requestId = parseInt(req.params.id, 10);
      if (Number.isNaN(requestId)) {
        return res.status(400).json({ message: 'Invalid usage request ID' });
      }

      const request = await fetchUsageRequest(requestId);
      const donor = await isCampaignDonor(req.user.id, request.campaign_id);
      if (!donor && !req.user.isAdmin) {
        return res.status(403).json({ message: 'Only donors can vote on usage requests' });
      }

      const donationRow = await dbGet(
        `SELECT COALESCE(SUM(amount), 0) as donated
         FROM donations
         WHERE campaign_id = ? AND donor_id = ?`,
        [request.campaign_id, req.user.id]
      );
      const donatedAmount = donationRow?.donated || 0;

      const voteValue = typeof req.body.vote === 'boolean'
        ? req.body.vote
        : req.body.vote === 'true';

      await dbRun(
        `INSERT INTO usage_votes (usage_request_id, donor_id, donor_wallet_address, vote, donated_amount)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(usage_request_id, donor_id)
         DO UPDATE SET 
            vote = excluded.vote,
            donated_amount = excluded.donated_amount,
            donor_wallet_address = excluded.donor_wallet_address,
            updated_at = CURRENT_TIMESTAMP`,
        [
          requestId,
          req.user.id,
          req.user.wallet_address || '',
          voteValue ? 1 : 0,
          donatedAmount
        ]
      );

      await maybeAutoApprove(requestId);
      const response = await buildRequestResponse(requestId, req.user.id);

      return res.json({
        message: voteValue ? 'You approved this usage request' : 'You rejected this usage request',
        request: response
      });
    } catch (error) {
      console.error('Error recording vote:', error);
      const status = error.status || 500;
      return res.status(status).json({ message: error.message || 'Server error' });
    }
  }
);

// @route   PATCH /api/usage-requests/:id/mark-spent
// @desc    Mark request as spent with tx hash and docs
// @access  Private (campaign owner/admin)
router.patch(
  '/:id/mark-spent',
  auth,
  (req, res, next) => {
    upload.single('supportingDoc')(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: 'File upload error', detail: err.message });
      } else if (err) {
        return res.status(500).json({ message: 'Unexpected file upload error', detail: err.message });
      }
      next();
    });
  },
  [
    check('actualAmount', 'Actual amount must be a positive number').isFloat({ gt: 0 }),
    check('onchainTxHash', 'Transaction hash is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const requestId = parseInt(req.params.id, 10);
      if (Number.isNaN(requestId)) {
        return res.status(400).json({ message: 'Invalid usage request ID' });
      }

      const request = await fetchUsageRequest(requestId);
      const campaign = await fetchCampaign(request.campaign_id);

      const isOwner = campaign.creator_id === req.user.id;
      if (!isOwner && !req.user.isAdmin) {
        return res.status(403).json({ message: 'Only the campaign owner can mark spending' });
      }

      if (request.status !== 'APPROVED') {
        return res.status(400).json({ message: 'Only approved requests can be marked as spent' });
      }

      const actualAmount = normalizeNumber(req.body.actualAmount);
      const requestedAmount = normalizeNumber(request.requested_amount);
      if (actualAmount > requestedAmount) {
        return res.status(400).json({
          message: 'Actual amount cannot exceed the approved amount',
          requestedAmount
        });
      }

      const { summary } = await calculateUsageFinancials(request.campaign_id);
      const available = summary.remainingBalance + Math.max(requestedAmount - normalizeNumber(request.actual_amount), 0);

      if (actualAmount > available + 0.000001) {
        return res.status(400).json({
          message: 'Actual amount exceeds available funds',
          available
        });
      }

      const supportingDocsUrl = req.file
        ? `/uploads/usage/${req.file.filename}`
        : request.supporting_docs_url;

      await dbRun(
        `UPDATE usage_requests
         SET status = 'SPENT',
             actual_amount = ?,
             onchain_tx_hash = ?,
             supporting_docs_url = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          actualAmount,
          req.body.onchainTxHash,
          supportingDocsUrl,
          requestId
        ]
      );

      const response = await buildRequestResponse(requestId, req.user.id);
      return res.json({
        message: 'Usage request marked as spent',
        request: response
      });
    } catch (error) {
      console.error('Error marking request as spent:', error);
      const status = error.status || 500;
      return res.status(status).json({ message: error.message || 'Server error' });
    }
  }
);

module.exports = router;

