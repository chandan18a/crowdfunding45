const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
// Fixed database path - use relative path
const db = new sqlite3.Database('./crowdfunding.db');
require('dotenv').config({ path: './.env' });

module.exports = function(req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');

  // Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_development');
    
    // Fetch full user details from database
    db.get(
      'SELECT id, username, email, role, wallet_address FROM users WHERE id = ?',
      [decoded.user.id],
      (err, user) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ msg: 'Server error' });
        }
        
        if (!user) {
          return res.status(401).json({ msg: 'Token is not valid' });
        }
        
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          wallet_address: user.wallet_address,
          isAdmin: user.role === 'admin'
        };
        
        next();
      }
    );
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};