const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// @route   POST api/comments/:campaignId
// @desc    Add a comment to a campaign
// @access  Private
router.post('/:campaignId', [
  auth,
  check('text', 'Text is required').not().isEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if campaign exists
    db.get('SELECT * FROM campaigns WHERE id = ?', [req.params.campaignId], (err, campaign) => {
      if (err) {
        console.error(err.message);
        return res.status(500).send('Server error');
      }

      if (!campaign) {
        return res.status(404).json({ msg: 'Campaign not found' });
      }

      // Add comment
      db.run(
        'INSERT INTO comments (campaign_id, user_id, text) VALUES (?, ?, ?)',
        [req.params.campaignId, req.user.id, req.body.text],
        function(err) {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          // Get the created comment with user info
          db.get(
            `SELECT c.*, u.username 
             FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.id = ?`,
            [this.lastID],
            (err, comment) => {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              res.json(comment);
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

// @route   GET api/comments/:campaignId
// @desc    Get all comments for a campaign
// @access  Public
router.get('/:campaignId', (req, res) => {
  try {
    db.all(
      `SELECT c.*, u.username 
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.campaign_id = ? 
       ORDER BY c.created_at DESC`,
      [req.params.campaignId],
      (err, comments) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        res.json(comments);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/comments/:id
// @desc    Delete a comment
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if comment exists and belongs to user
    db.get('SELECT * FROM comments WHERE id = ?', [req.params.id], (err, comment) => {
      if (err) {
        console.error(err.message);
        return res.status(500).send('Server error');
      }

      if (!comment) {
        return res.status(404).json({ msg: 'Comment not found' });
      }

      // Check if user is comment owner or admin
      if (comment.user_id !== req.user.id && !req.user.isAdmin) {
        return res.status(401).json({ msg: 'Not authorized' });
      }

      // Delete comment
      db.run('DELETE FROM comments WHERE id = ?', [req.params.id], function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        res.json({ msg: 'Comment removed' });
      });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;