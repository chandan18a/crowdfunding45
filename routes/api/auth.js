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
    console.log('Registration request received:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role, walletAddress, adminSecret, name } = req.body;

    try {
      console.log('Processing registration for:', { username, email, role, name });
      
      // Check admin secret for admin registration
      if (role === 'admin' && adminSecret !== process.env.ADMIN_SECRET) {
        console.log('Invalid admin secret provided');
        return res
          .status(403)
          .json({ errors: [{ msg: 'Invalid admin secret key' }] });
      }

      // Check if user already exists (email and username only, wallet address can be shared)
      console.log('Checking if user already exists...');
      db.get(
        'SELECT * FROM users WHERE email = ? OR username = ?',
        [email, username],
        async (err, user) => {
          if (err) {
            console.error('Database error checking existing user:', err.message);
            return res.status(500).json({ 
              error: 'Database error', 
              details: err.message 
            });
          }

          if (user) {
            console.log('User already exists:', user);
            let errorMessage = 'User already exists';
            if (user.email === email) {
              errorMessage = 'Email already registered';
            } else if (user.username === username) {
              errorMessage = 'Username already taken';
            }
            return res
              .status(400)
              .json({ errors: [{ msg: errorMessage }] });
          }

          console.log('User does not exist, proceeding with registration...');

          try {
            // Hash password
            console.log('Hashing password...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            console.log('Creating user in database...');
            // Create user
            db.run(
              'INSERT INTO users (username, email, password, role, wallet_address, name) VALUES (?, ?, ?, ?, ?, ?)',
              [username, email, hashedPassword, role, walletAddress || null, name],
              function (err) {
                if (err) {
                  console.error('Database error creating user:', err.message);
                  return res.status(500).json({ 
                    error: 'Database error creating user', 
                    details: err.message 
                  });
                }

                console.log('User created successfully with ID:', this.lastID);

                // Create JWT payload
                const payload = {
                  user: {
                    id: this.lastID,
                    role: role,
                  },
                };

                console.log('Creating JWT token...');
                // Sign token
                jwt.sign(
                  payload,
                  process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_development',
                  { expiresIn: '5 days' },
                  (err, token) => {
                    if (err) {
                      console.error('JWT signing error:', err.message);
                      return res.status(500).json({ 
                        error: 'JWT signing error', 
                        details: err.message 
                      });
                    }
                    
                    console.log('Registration successful, returning response');
                    res.json({ 
                      token,
                      user: {
                        id: this.lastID,
                        username,
                        email,
                        role,
                        wallet_address: walletAddress || null,
                        name
                      }
                    });
                  }
                );
              }
            );
          } catch (hashError) {
            console.error('Password hashing error:', hashError.message);
            return res.status(500).json({ 
              error: 'Password hashing error', 
              details: hashError.message 
            });
          }
        }
      );
    } catch (err) {
      console.error('Registration error:', err.message);
      res.status(500).json({ 
        error: 'Registration error', 
        details: err.message 
      });
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
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    try {
      // Check if user exists
      db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        async (err, user) => {
          if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ msg: 'Server error', error: err.message });
          }

          if (!user) {
            console.log('User not found for email:', email);
            return res
              .status(400)
              .json({ errors: [{ msg: 'Invalid credentials' }] });
          }

          // Check password
          const isMatch = await bcrypt.compare(password, user.password);

          if (!isMatch) {
            console.log('Password mismatch for email:', email);
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
            process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_development',
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
      'SELECT id, username, email, name, wallet_address, role, created_at FROM users WHERE id = ?',
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
          name: user.name,
          role: user.role,
          walletAddress: user.wallet_address,
          wallet_address: user.wallet_address,
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

// @route   PUT api/auth/profile
// @desc    Update user profile
// @access  Private
router.put(
  '/profile',
  auth,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('username', 'Username is required').not().isEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, username, wallet_address } = req.body;

    try {
      // Check if email or username is already taken by another user
      db.get(
        'SELECT * FROM users WHERE (email = ? OR username = ?) AND id != ?',
        [email, username, req.user.id],
        (err, existingUser) => {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          if (existingUser) {
            return res.status(400).json({ 
              msg: existingUser.email === email ? 'Email already exists' : 'Username already exists' 
            });
          }

          // Update user profile
          db.run(
            'UPDATE users SET name = ?, email = ?, username = ?, wallet_address = ? WHERE id = ?',
            [name, email, username, wallet_address || '', req.user.id],
            function (err) {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              if (this.changes === 0) {
                return res.status(404).json({ msg: 'User not found' });
              }

              res.json({ msg: 'Profile updated successfully' });
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

// @route   PUT api/auth/settings
// @desc    Update user settings
// @access  Private
router.put('/settings', auth, async (req, res) => {
  try {
    const settings = req.body;
    
    // For now, we'll just return success since settings are stored locally
    // In a real application, you might want to store these in the database
    res.json({ msg: 'Settings saved successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/auth/password
// @desc    Change user password
// @access  Private
router.put(
  '/password',
  auth,
  [
    check('currentPassword', 'Current password is required').not().isEmpty(),
    check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      // Get user from database
      db.get(
        'SELECT * FROM users WHERE id = ?',
        [req.user.id],
        async (err, user) => {
          if (err) {
            console.error(err.message);
            return res.status(500).send('Server error');
          }

          if (!user) {
            return res.status(404).json({ msg: 'User not found' });
          }

          // Check current password
          const isMatch = await bcrypt.compare(currentPassword, user.password);
          if (!isMatch) {
            return res.status(400).json({ msg: 'Current password is incorrect' });
          }

          // Hash new password
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(newPassword, salt);

          // Update password
          db.run(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, req.user.id],
            function (err) {
              if (err) {
                console.error(err.message);
                return res.status(500).send('Server error');
              }

              res.json({ msg: 'Password changed successfully' });
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

module.exports = router;
