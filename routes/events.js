const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function (db) {
    const router = express.Router();

    // Helper to parse sql.js rows
    function parseRows(result) {
        if (!result || result.length === 0) return [];
        const cols = result[0].columns;
        return result[0].values.map(row => {
            const obj = {};
            cols.forEach((col, i) => (obj[col] = row[i]));
            return obj;
        });
    }

    // Helper: check time overlap — returns { conflict: bool, backToBack: [...] }
    function checkVenueConflict(location, date, startTime, endTime, excludeId) {
        // Get all active events at same venue and date
        let query = "SELECT id, event_name, time, end_time FROM Events WHERE location = ? AND date = ? AND status != 'cancelled'";
        const params = [location, date];
        if (excludeId) {
            query += " AND id != ?";
            params.push(excludeId);
        }
        const existing = parseRows(db.exec(query, params));

        let overlapping = null;
        const backToBack = [];

        for (const ev of existing) {
            const evStart = ev.time;
            const evEnd = ev.end_time;

            // Check overlap: new event overlaps if newStart < existingEnd AND newEnd > existingStart
            if (startTime < evEnd && endTime > evStart) {
                overlapping = ev;
                break;
            }

            // Check back-to-back: new event ends exactly when existing starts, or new starts when existing ends
            if (endTime === evStart || startTime === evEnd) {
                backToBack.push(ev);
            }
        }

        return { overlapping, backToBack };
    }

    // GET /api/events — list events based on role
    router.get('/', authenticateToken, (req, res) => {
        try {
            let events;
            if (req.user.role === 'student') {
                events = parseRows(db.exec(`
          SELECT e.*, c.club_name, u.name as creator_name 
          FROM Events e 
          LEFT JOIN Clubs c ON e.club_id = c.id 
          LEFT JOIN Users u ON e.created_by = u.id 
          WHERE e.status = 'approved' 
          ORDER BY e.date ASC, e.time ASC
        `));
            } else if (req.user.role === 'coordinator') {
                events = parseRows(db.exec(`
          SELECT e.*, c.club_name, u.name as creator_name 
          FROM Events e 
          LEFT JOIN Clubs c ON e.club_id = c.id 
          LEFT JOIN Users u ON e.created_by = u.id 
          WHERE e.status = 'approved' OR e.created_by = ?
          ORDER BY e.date ASC, e.time ASC
        `, [req.user.id]));
            } else {
                events = parseRows(db.exec(`
          SELECT e.*, c.club_name, u.name as creator_name 
          FROM Events e 
          LEFT JOIN Clubs c ON e.club_id = c.id 
          LEFT JOIN Users u ON e.created_by = u.id 
          ORDER BY e.date ASC, e.time ASC
        `));
            }
            res.json(events);
        } catch (err) {
            console.error('Get events error:', err);
            res.status(500).json({ error: 'Failed to fetch events.' });
        }
    });

    // GET /api/events/:id — event details
    router.get('/:id', authenticateToken, (req, res) => {
        try {
            const events = parseRows(db.exec(`
        SELECT e.*, c.club_name, c.description as club_description, u.name as creator_name 
        FROM Events e 
        LEFT JOIN Clubs c ON e.club_id = c.id 
        LEFT JOIN Users u ON e.created_by = u.id 
        WHERE e.id = ?
      `, [req.params.id]));

            if (events.length === 0) {
                return res.status(404).json({ error: 'Event not found.' });
            }

            // Check if this event has a back-to-back neighbor (another event starts right when this ends at same venue)
            const ev = events[0];
            const neighbors = parseRows(db.exec(
                "SELECT id, event_name, time, end_time FROM Events WHERE location = ? AND date = ? AND status != 'cancelled' AND id != ?",
                [ev.location, ev.date, ev.id]
            ));

            let vacateWarning = null;
            for (const n of neighbors) {
                // If another event starts exactly when this event ends
                if (n.time === ev.end_time) {
                    vacateWarning = `⚠️ Please vacate the venue 15 minutes before ${ev.end_time} — "${n.event_name}" is scheduled right after at the same venue.`;
                    break;
                }
            }

            res.json({ ...ev, vacate_warning: vacateWarning });
        } catch (err) {
            console.error('Get event error:', err);
            res.status(500).json({ error: 'Failed to fetch event.' });
        }
    });

    // POST /api/events — create event
    router.post('/', authenticateToken, requireRole('faculty', 'coordinator'), (req, res) => {
        try {
            const { event_name, description, date, time, end_time, location, club_id } = req.body;

            if (!event_name || !date || !time || !end_time || !location || !club_id) {
                return res.status(400).json({ error: 'All fields are required (including end time).' });
            }

            // Validate end_time > time
            if (end_time <= time) {
                return res.status(400).json({ error: 'End time must be after start time.' });
            }

            // Check coordinator is verified AND restrict to their approved club
            if (req.user.role === 'coordinator') {
                const userCheck = parseRows(db.exec("SELECT verified FROM Users WHERE id = ?", [req.user.id]));
                if (userCheck.length === 0 || !userCheck[0].verified) {
                    return res.status(403).json({ error: 'You must be verified by faculty before creating events.' });
                }

                // Check coordinator is approved for this specific club
                const approvedClubs = parseRows(db.exec(
                    "SELECT club_id FROM CoordinatorRequests WHERE student_id = ? AND request_status = 'approved'",
                    [req.user.id]
                ));
                const approvedClubIds = approvedClubs.map(c => c.club_id);
                if (!approvedClubIds.includes(parseInt(club_id))) {
                    return res.status(403).json({ error: 'You can only create events for the club you are approved to coordinate.' });
                }
            }

            // Check for venue time overlap
            const { overlapping, backToBack } = checkVenueConflict(location, date, time, end_time, null);

            if (overlapping) {
                return res.status(409).json({
                    error: `Venue conflict! "${overlapping.event_name}" is scheduled at ${location} from ${overlapping.time} to ${overlapping.end_time} on ${date}. Your event time overlaps. Please choose a different venue or time slot.`
                });
            }

            // Faculty events auto-approve, coordinator events go to pending
            const status = req.user.role === 'faculty' ? 'approved' : 'pending';

            db.run(
                "INSERT INTO Events (event_name, description, date, time, end_time, location, club_id, created_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                [event_name, description || '', date, time, end_time, location, parseInt(club_id), req.user.id, status]
            );

            // If faculty, auto-create approval record
            if (req.user.role === 'faculty') {
                const eventResult = parseRows(db.exec("SELECT last_insert_rowid() as id"));
                const eventId = eventResult[0].id;
                db.run(
                    "INSERT INTO EventApprovals (event_id, approved_by, approval_status, approval_date) VALUES (?, ?, 'approved', datetime('now'))",
                    [eventId, req.user.id]
                );
            }

            // Build response with back-to-back warning if applicable
            let warning = null;
            if (backToBack.length > 0) {
                const neighbor = backToBack[0];
                if (neighbor.time === end_time) {
                    warning = `Note: "${neighbor.event_name}" is scheduled right after yours at the same venue. Please plan to vacate 15 minutes before ${end_time}.`;
                } else if (neighbor.end_time === time) {
                    warning = `Note: "${neighbor.event_name}" ends right before your event. The previous group has been notified to vacate 15 minutes early.`;
                }
            }

            res.status(201).json({ message: 'Event created successfully!', status, warning });
        } catch (err) {
            console.error('Create event error:', err);
            res.status(500).json({ error: 'Failed to create event.' });
        }
    });

    // PUT /api/events/:id — update event
    router.put('/:id', authenticateToken, requireRole('faculty', 'coordinator'), (req, res) => {
        try {
            const eventId = req.params.id;
            const events = parseRows(db.exec("SELECT * FROM Events WHERE id = ?", [eventId]));

            if (events.length === 0) {
                return res.status(404).json({ error: 'Event not found.' });
            }

            if (req.user.role === 'coordinator' && events[0].created_by !== req.user.id) {
                return res.status(403).json({ error: 'You can only edit your own events.' });
            }

            const { event_name, description, date, time, end_time, location, club_id } = req.body;

            const finalDate = date || events[0].date;
            const finalTime = time || events[0].time;
            const finalEndTime = end_time || events[0].end_time;
            const finalLocation = location || events[0].location;

            // Validate end_time > time
            if (finalEndTime <= finalTime) {
                return res.status(400).json({ error: 'End time must be after start time.' });
            }

            // Check for venue time overlap (exclude current event)
            const { overlapping } = checkVenueConflict(finalLocation, finalDate, finalTime, finalEndTime, eventId);

            if (overlapping) {
                return res.status(409).json({
                    error: `Venue conflict! "${overlapping.event_name}" is scheduled at ${finalLocation} from ${overlapping.time} to ${overlapping.end_time} on ${finalDate}. Your event time overlaps.`
                });
            }

            const status = req.user.role === 'coordinator' ? 'pending' : events[0].status;

            db.run(
                "UPDATE Events SET event_name = ?, description = ?, date = ?, time = ?, end_time = ?, location = ?, club_id = ?, status = ? WHERE id = ?",
                [
                    event_name || events[0].event_name,
                    description !== undefined ? description : events[0].description,
                    finalDate,
                    finalTime,
                    finalEndTime,
                    finalLocation,
                    club_id || events[0].club_id,
                    status,
                    eventId
                ]
            );

            res.json({ message: 'Event updated successfully!' });
        } catch (err) {
            console.error('Update event error:', err);
            res.status(500).json({ error: 'Failed to update event.' });
        }
    });

    // DELETE /api/events/:id — cancel event (faculty)
    router.delete('/:id', authenticateToken, requireRole('faculty'), (req, res) => {
        try {
            const eventId = req.params.id;
            const events = parseRows(db.exec("SELECT * FROM Events WHERE id = ?", [eventId]));

            if (events.length === 0) {
                return res.status(404).json({ error: 'Event not found.' });
            }

            db.run("UPDATE Events SET status = 'cancelled' WHERE id = ?", [eventId]);
            res.json({ message: 'Event cancelled successfully.' });
        } catch (err) {
            console.error('Cancel event error:', err);
            res.status(500).json({ error: 'Failed to cancel event.' });
        }
    });

    return router;
};
