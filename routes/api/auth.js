const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');

// Database connection - Fixed path to correct database file
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post(
  '/register',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('username', 'Username is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check(
      'password',
      'Please enter a password with 6 or more characters'
    ).isLength({ min: 6 }),
    check('role', 'Role is required').isIn(['donor', 'fundraiser', 'admin']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role, walletAddress, adminSecret, name } = req.body;

    try {
      // Check admin secret for admin registration
      if (role === 'admin' && adminSecret !== process.env.ADMIN_SECRET) {
        return res
          .status(403)
          .json({ errors: [{ msg: 'Invalid admin secret key' }] });
      }

      // Check if user already exists
      db.get(
        'SELECT * FROM users WHERE email = ? OR username = ?',
        [email, username],
        async (err, user) => {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          if (user) {
            return res
              .status(400)
              .json({ errors: [{ msg: 'User already exists' }] });
          }

          // Hash password
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);

          // Create user
          db.run(
            'INSERT INTO users (username, email, password, role, wallet_address, name) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, role, walletAddress || null, name],
            function (err) {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              // Create JWT payload
              const payload = {
                user: {
                  id: this.lastID,
                  role: role,
                },
              };

              // Sign token
              jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '5 days' },
                (err, token) => {
                  if (err) throw err;
                  res.json({ token });
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

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        async (err, user) => {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          if (!user) {
            return res
              .status(400)
              .json({ errors: [{ msg: 'Invalid credentials' }] });
          }

          // Check password
          const isMatch = await bcrypt.compare(password, user.password);

          if (!isMatch) {
            return res
              .status(400)
              .json({ errors: [{ msg: 'Invalid credentials' }] });
          }

          // Create JWT payload
          const payload = {
            user: {
              id: user.id,
              role: user.role,
            },
          };

          // Sign token
          jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '5 days' },
            (err, token) => {
              if (err) throw err;
              res.json({
                token,
                user: {
                  id: user.id,
                  username: user.username,
                  email: user.email,
                  role: user.role,
                  walletAddress: user.wallet_address,
                },
              });
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

// @route   GET api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, (req, res) => {
  try {
    db.get(
      'SELECT id, username, email, wallet_address, role, created_at FROM users WHERE id = ?',
      [req.user.id],
      (err, user) => {
        if (err) {
          console.error(err.message);
          return res.status(500).send('Server error');
        }

        if (!user) {
          return res.status(404).json({ msg: 'User not found' });
        }

        res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          walletAddress: user.wallet_address,
          createdAt: user.created_at,
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/auth/wallet
// @desc    Update user wallet address
// @access  Private
router.put(
  '/wallet',
  auth,
  [check('walletAddress', 'Wallet address is required').not().isEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { walletAddress } = req.body;

    try {
      db.run(
        'UPDATE users SET wallet_address = ? WHERE id = ?',
        [walletAddress, req.user.id],
        function (err) {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          if (this.changes === 0) {
            return res.status(404).json({ msg: 'User not found' });
          }

          res.json({ msg: 'Wallet address updated' });
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

module.exports = router;
