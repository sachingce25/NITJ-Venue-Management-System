const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// Replace with your actual Google OAuth Client ID
const GOOGLE_CLIENT_ID = '189035419390-phdmm2d6bbaibefdd934vsuhg2ns5sub.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

module.exports = function (db) {
    const router = express.Router();

    // POST /api/auth/google — Google Sign-In / Sign-Up
    router.post('/google', async (req, res) => {
        try {
            const { credential, role, club_id } = req.body;

            if (!credential) {
                return res.status(400).json({ error: 'Google credential is required.' });
            }

            // Verify the Google ID token
            let payload;
            try {
                const ticket = await googleClient.verifyIdToken({
                    idToken: credential,
                    audience: GOOGLE_CLIENT_ID,
                });
                payload = ticket.getPayload();
            } catch (err) {
                console.error('Google token verification failed:', err.message);
                return res.status(401).json({ error: 'Invalid Google credential.' });
            }

            const { email, name, picture, email_verified } = payload;

            if (!email_verified) {
                return res.status(400).json({ error: 'Google email is not verified.' });
            }

            // Validate college email domain
            if (!email.endsWith('@nitj.ac.in')) {
                return res.status(400).json({ error: 'Only @nitj.ac.in email addresses are allowed.' });
            }

            // Check if user already exists
            const existing = db.exec("SELECT * FROM Users WHERE email = ?", [email]);

            if (existing.length > 0 && existing[0].values.length > 0) {
                // --- LOGIN FLOW: user exists ---
                const cols = existing[0].columns;
                const row = existing[0].values[0];
                const user = {};
                cols.forEach((col, i) => (user[col] = row[i]));

                const token = jwt.sign(
                    { id: user.id, name: user.name, email: user.email, role: user.role, verified: user.verified },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                return res.json({
                    token,
                    user: { id: user.id, name: user.name, email: user.email, role: user.role, verified: user.verified }
                });
            }

            // --- SIGNUP FLOW: new user ---
            if (!role) {
                return res.status(400).json({ error: 'Please select a role to create your account.', needsRole: true });
            }

            if (!['student', 'coordinator', 'faculty'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role.' });
            }

            if (role === 'coordinator' && !club_id) {
                return res.status(400).json({ error: 'Please select a club to coordinate.', needsRole: true });
            }

            const verified = role === 'faculty' ? 1 : 0;

            db.run(
                "INSERT INTO Users (name, email, password, role, verified, created_at) VALUES (?, ?, NULL, ?, ?, datetime('now'))",
                [name, email, role, verified]
            );

            // If coordinator, auto-create a verification request
            if (role === 'coordinator' && club_id) {
                const newUser = db.exec("SELECT last_insert_rowid() as id");
                const userId = newUser[0].values[0][0];
                db.run(
                    "INSERT INTO CoordinatorRequests (student_id, club_id, request_status) VALUES (?, ?, 'pending')",
                    [userId, parseInt(club_id)]
                );
            }

            // Fetch the newly created user
            const newUserResult = db.exec("SELECT * FROM Users WHERE email = ?", [email]);
            const cols = newUserResult[0].columns;
            const row = newUserResult[0].values[0];
            const newUserObj = {};
            cols.forEach((col, i) => (newUserObj[col] = row[i]));

            const token = jwt.sign(
                { id: newUserObj.id, name: newUserObj.name, email: newUserObj.email, role: newUserObj.role, verified: newUserObj.verified },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.status(201).json({
                token,
                user: { id: newUserObj.id, name: newUserObj.name, email: newUserObj.email, role: newUserObj.role, verified: newUserObj.verified },
                message: role === 'coordinator'
                    ? 'Account created via Google! A verification request has been sent to faculty.'
                    : 'Account created via Google!'
            });

        } catch (err) {
            console.error('Google auth error:', err);
            res.status(500).json({ error: 'Server error during Google authentication.' });
        }
    });

    // POST /api/auth/signup
    router.post('/signup', async (req, res) => {
        try {
            const { name, email, password, role, club_id } = req.body;

            if (!name || !email || !password || !role) {
                return res.status(400).json({ error: 'All fields are required.' });
            }

            // Coordinators must select a club
            if (role === 'coordinator' && !club_id) {
                return res.status(400).json({ error: 'Please select a club to coordinate.' });
            }

            // Validate college email
            if (!email.endsWith('.edu') && !email.endsWith('.edu.in') && !email.endsWith('.ac.in')) {
                return res.status(400).json({ error: 'Please use your official college email ID.' });
            }

            if (!['student', 'coordinator', 'faculty'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role.' });
            }

            // Check existing user
            const existing = db.exec("SELECT id FROM Users WHERE email = ?", [email]);
            if (existing.length > 0 && existing[0].values.length > 0) {
                return res.status(400).json({ error: 'Email already registered.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const verified = role === 'faculty' ? 1 : 0;

            db.run(
                "INSERT INTO Users (name, email, password, role, verified, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
                [name, email, hashedPassword, role, verified]
            );

            // If coordinator, auto-create a verification request for faculty
            if (role === 'coordinator' && club_id) {
                const newUser = db.exec("SELECT last_insert_rowid() as id");
                const userId = newUser[0].values[0][0];
                db.run(
                    "INSERT INTO CoordinatorRequests (student_id, club_id, request_status) VALUES (?, ?, 'pending')",
                    [userId, parseInt(club_id)]
                );
            }

            const msg = role === 'coordinator'
                ? 'Account created! A verification request has been sent to faculty. Please login.'
                : 'Account created successfully! Please login.';

            res.status(201).json({ message: msg });
        } catch (err) {
            console.error('Signup error:', err);
            res.status(500).json({ error: 'Server error during signup.' });
        }
    });

    // POST /api/auth/login
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required.' });
            }

            const result = db.exec("SELECT * FROM Users WHERE email = ?", [email]);
            if (result.length === 0 || result[0].values.length === 0) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            const cols = result[0].columns;
            const row = result[0].values[0];
            const user = {};
            cols.forEach((col, i) => (user[col] = row[i]));

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email, role: user.role, verified: user.verified },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    verified: user.verified
                }
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Server error during login.' });
        }
    });

    // GET /api/auth/me
    router.get('/me', authenticateToken, (req, res) => {
        try {
            const result = db.exec("SELECT id, name, email, role, verified, created_at FROM Users WHERE id = ?", [req.user.id]);
            if (result.length === 0 || result[0].values.length === 0) {
                return res.status(404).json({ error: 'User not found.' });
            }
            const cols = result[0].columns;
            const row = result[0].values[0];
            const user = {};
            cols.forEach((col, i) => (user[col] = row[i]));
            res.json(user);
        } catch (err) {
            res.status(500).json({ error: 'Server error.' });
        }
    });

    return router;
};
