const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function (db) {
    const router = express.Router();

    function parseRows(result) {
        if (!result || result.length === 0) return [];
        const cols = result[0].columns;
        return result[0].values.map(row => {
            const obj = {};
            cols.forEach((col, i) => (obj[col] = row[i]));
            return obj;
        });
    }

    // POST /api/coordinators/request — coordinator requests verification for a club
    router.post('/request', authenticateToken, requireRole('coordinator'), (req, res) => {
        try {
            const { club_id } = req.body;
            if (!club_id) {
                return res.status(400).json({ error: 'Club ID is required.' });
            }

            // Check if already requested
            const existing = parseRows(db.exec(
                "SELECT * FROM CoordinatorRequests WHERE student_id = ? AND club_id = ?",
                [req.user.id, club_id]
            ));

            if (existing.length > 0) {
                return res.status(400).json({ error: 'You already have a request for this club.' });
            }

            db.run(
                "INSERT INTO CoordinatorRequests (student_id, club_id, request_status) VALUES (?, ?, 'pending')",
                [req.user.id, club_id]
            );

            res.status(201).json({ message: 'Verification request submitted!' });
        } catch (err) {
            console.error('Coordinator request error:', err);
            res.status(500).json({ error: 'Failed to submit request.' });
        }
    });

    // GET /api/coordinators/requests — faculty views pending requests
    router.get('/requests', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const requests = parseRows(db.exec(`
        SELECT cr.*, u.name as student_name, u.email as student_email, c.club_name 
        FROM CoordinatorRequests cr 
        JOIN Users u ON cr.student_id = u.id 
        JOIN Clubs c ON cr.club_id = c.id 
        ORDER BY cr.request_status ASC, cr.id DESC
      `));
            res.json(requests);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch requests.' });
        }
    });

    // GET /api/coordinators/my-requests — coordinator sees own requests
    router.get('/my-requests', authenticateToken, requireRole('coordinator'), (req, res) => {
        try {
            const requests = parseRows(db.exec(`
        SELECT cr.*, c.club_name 
        FROM CoordinatorRequests cr 
        JOIN Clubs c ON cr.club_id = c.id 
        WHERE cr.student_id = ?
        ORDER BY cr.id DESC
      `, [req.user.id]));
            res.json(requests);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch your requests.' });
        }
    });

    // PUT /api/coordinators/requests/:id — faculty approves/rejects
    router.put('/requests/:id', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const { status } = req.body; // 'approved' or 'rejected'
            if (!['approved', 'rejected'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status.' });
            }

            const requests = parseRows(db.exec("SELECT * FROM CoordinatorRequests WHERE id = ?", [req.params.id]));
            if (requests.length === 0) {
                return res.status(404).json({ error: 'Request not found.' });
            }

            db.run(
                "UPDATE CoordinatorRequests SET request_status = ?, verified_by = ? WHERE id = ?",
                [status, req.user.id, req.params.id]
            );

            // If approved, mark the user as verified
            if (status === 'approved') {
                db.run("UPDATE Users SET verified = 1 WHERE id = ?", [requests[0].student_id]);
            }

            res.json({ message: `Coordinator request ${status}.` });
        } catch (err) {
            console.error('Update coordinator request error:', err);
            res.status(500).json({ error: 'Failed to update request.' });
        }
    });

    // GET /api/coordinators/my-clubs — coordinator's approved clubs
    router.get('/my-clubs', authenticateToken, requireRole('coordinator'), (req, res) => {
        try {
            const clubs = parseRows(db.exec(`
        SELECT c.id, c.club_name FROM CoordinatorRequests cr
        JOIN Clubs c ON cr.club_id = c.id
        WHERE cr.student_id = ? AND cr.request_status = 'approved'
      `, [req.user.id]));
            res.json(clubs);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch your clubs.' });
        }
    });

    return router;
};
