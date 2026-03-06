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

    // GET /api/clubs (public — needed for signup club selection)
    router.get('/', (req, res) => {
        try {
            const clubs = parseRows(db.exec(`
        SELECT c.*, u.name as faculty_name 
        FROM Clubs c 
        LEFT JOIN Users u ON c.faculty_id = u.id 
        ORDER BY c.club_name ASC
      `));
            res.json(clubs);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch clubs.' });
        }
    });

    // POST /api/clubs — faculty only
    router.post('/', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const { club_name, description } = req.body;
            if (!club_name) {
                return res.status(400).json({ error: 'Club name is required.' });
            }

            db.run(
                "INSERT INTO Clubs (club_name, description, faculty_id) VALUES (?, ?, ?)",
                [club_name, description || '', req.user.id]
            );

            res.status(201).json({ message: 'Club created successfully!' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to create club.' });
        }
    });

    // PUT /api/clubs/:id — faculty only
    router.put('/:id', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const { club_name, description } = req.body;
            const clubs = parseRows(db.exec("SELECT * FROM Clubs WHERE id = ?", [req.params.id]));

            if (clubs.length === 0) {
                return res.status(404).json({ error: 'Club not found.' });
            }

            db.run(
                "UPDATE Clubs SET club_name = ?, description = ? WHERE id = ?",
                [club_name || clubs[0].club_name, description !== undefined ? description : clubs[0].description, req.params.id]
            );

            res.json({ message: 'Club updated successfully!' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update club.' });
        }
    });

    // DELETE /api/clubs/:id — faculty only
    router.delete('/:id', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const clubs = parseRows(db.exec("SELECT * FROM Clubs WHERE id = ?", [req.params.id]));
            if (clubs.length === 0) {
                return res.status(404).json({ error: 'Club not found.' });
            }

            db.run("DELETE FROM Clubs WHERE id = ?", [req.params.id]);
            res.json({ message: 'Club deleted successfully.' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete club.' });
        }
    });

    return router;
};
