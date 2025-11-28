const express = require('express');
const router = express.Router();
const passport = require('../../config/passport');
const jwt = require('jsonwebtoken');

// @route   GET /api/auth/google
// @desc    Initiate Google OAuth
// @access  Public
router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false
    })
);

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login',
        session: false
    }),
    (req, res) => {
        try {
            // Create JWT token
            const payload = {
                user: {
                    id: req.user.id,
                    role: req.user.role
                }
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET || 'crowdfunding-platform-secure-jwt-secret-2023',
                { expiresIn: '7d' },
                (err, token) => {
                    if (err) throw err;

                    // Redirect to frontend with token
                    // Pass isNewUser flag via URL parameter
                    const redirectUrl = `http://localhost:3004/oauth-callback?token=${token}&role=${req.user.role}&needsWallet=${!req.user.wallet_address}&isNewUser=${req.user.isNewUser || false}`;
                    res.redirect(redirectUrl);
                }
            );
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.redirect('/login?error=oauth_failed');
        }
    }
);

// @route   GET /api/auth/google/logout
// @desc    Logout user
// @access  Public
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

module.exports = router;
