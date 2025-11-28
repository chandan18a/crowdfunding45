const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        done(err, user);
    });
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            db.get(
                'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
                ['google', profile.id],
                (err, existingUser) => {
                    if (err) {
                        return done(err);
                    }

                    if (existingUser) {
                        // User exists, log them in
                        return done(null, existingUser);
                    }

                    // Check if email already exists (user registered with email/password)
                    db.get(
                        'SELECT * FROM users WHERE email = ?',
                        [profile.emails[0].value],
                        (err, emailUser) => {
                            if (err) {
                                return done(err);
                            }

                            if (emailUser) {
                                // Link Google account to existing user
                                db.run(
                                    'UPDATE users SET oauth_provider = ?, oauth_id = ?, profile_picture = ? WHERE id = ?',
                                    ['google', profile.id, profile.photos[0]?.value, emailUser.id],
                                    (err) => {
                                        if (err) {
                                            return done(err);
                                        }
                                        return done(null, emailUser);
                                    }
                                );
                            } else {
                                // Create new user
                                const newUser = {
                                    name: profile.displayName,
                                    email: profile.emails[0].value,
                                    username: profile.emails[0].value.split('@')[0] + '_' + Date.now(),
                                    password: '', // No password for OAuth users
                                    role: 'donor', // Default role, can be changed later
                                    wallet_address: '', // Will be set when user connects wallet
                                    oauth_provider: 'google',
                                    oauth_id: profile.id,
                                    profile_picture: profile.photos[0]?.value || ''
                                };

                                db.run(
                                    `INSERT INTO users (name, email, username, password, role, wallet_address, oauth_provider, oauth_id, profile_picture) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        newUser.name,
                                        newUser.email,
                                        newUser.username,
                                        newUser.password,
                                        newUser.role,
                                        newUser.wallet_address,
                                        newUser.oauth_provider,
                                        newUser.oauth_id,
                                        newUser.profile_picture
                                    ],
                                    function (err) {
                                        if (err) {
                                            return done(err);
                                        }
                                        newUser.id = this.lastID;
                                        newUser.isNewUser = true; // Mark as new user for role selection
                                        return done(null, newUser);
                                    }
                                );
                            }
                        }
                    );
                }
            );
        } catch (error) {
            return done(error);
        }
    }
));

module.exports = passport;
