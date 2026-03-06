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

    // GET /api/approvals/pending — faculty views pending event approvals
    router.get('/pending', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const events = parseRows(db.exec(`
        SELECT e.*, c.club_name, u.name as creator_name 
        FROM Events e 
        LEFT JOIN Clubs c ON e.club_id = c.id 
        LEFT JOIN Users u ON e.created_by = u.id 
        WHERE e.status = 'pending'
        ORDER BY e.created_at DESC
      `));
            res.json(events);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch pending events.' });
        }
    });

    // PUT /api/approvals/:eventId — faculty approves/rejects event
    router.put('/:eventId', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const { status } = req.body; // 'approved' or 'rejected'
            if (!['approved', 'rejected'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Use approved or rejected.' });
            }

            const events = parseRows(db.exec("SELECT * FROM Events WHERE id = ?", [req.params.eventId]));
            if (events.length === 0) {
                return res.status(404).json({ error: 'Event not found.' });
            }

            db.run("UPDATE Events SET status = ? WHERE id = ?", [status, req.params.eventId]);

            // Create approval record
            db.run(
                "INSERT INTO EventApprovals (event_id, approved_by, approval_status, approval_date) VALUES (?, ?, ?, datetime('now'))",
                [req.params.eventId, req.user.id, status]
            );

            res.json({ message: `Event ${status} successfully.` });
        } catch (err) {
            console.error('Approval error:', err);
            res.status(500).json({ error: 'Failed to update event status.' });
        }
    });

    return router;
};
