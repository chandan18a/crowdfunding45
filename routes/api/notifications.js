const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');

// Database connection
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Create notifications table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  campaign_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('campaign_approved', 'campaign_rejected', 'admin_message')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_status INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
)`);

// @route   GET api/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', auth, (req, res) => {
  try {
    db.all(
      `SELECT n.*, c.title as campaign_title 
       FROM notifications n 
       LEFT JOIN campaigns c ON n.campaign_id = c.id 
       WHERE n.user_id = ? 
       ORDER BY n.created_at DESC`,
      [req.user.id],
      (err, notifications) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        res.json({ notifications });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', auth, (req, res) => {
  try {
    db.run(
      'UPDATE notifications SET read_status = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
      function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ message: 'Notification not found' });
        }
        
        res.json({ message: 'Notification marked as read' });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/notifications/unread-count
// @desc    Get unread notifications count
// @access  Private
router.get('/unread-count', auth, (req, res) => {
  try {
    db.get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_status = 0',
      [req.user.id],
      (err, result) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ message: 'Server error' });
        }
        res.json({ count: result.count });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to create notification
const createNotification = (userId, campaignId, type, title, message) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO notifications (user_id, campaign_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
      [userId, campaignId, type, title, message],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

module.exports = { router, createNotification };