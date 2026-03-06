const express = require('express');
const cors = require('cors');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function initDatabase() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      role TEXT NOT NULL CHECK(role IN ('student', 'coordinator', 'faculty')),
      verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_name TEXT NOT NULL,
      description TEXT,
      faculty_id INTEGER,
      FOREIGN KEY (faculty_id) REFERENCES Users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT NOT NULL,
      club_id INTEGER,
      created_by INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (club_id) REFERENCES Clubs(id),
      FOREIGN KEY (created_by) REFERENCES Users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS CoordinatorRequests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      club_id INTEGER NOT NULL,
      request_status TEXT DEFAULT 'pending' CHECK(request_status IN ('pending', 'approved', 'rejected')),
      verified_by INTEGER,
      FOREIGN KEY (student_id) REFERENCES Users(id),
      FOREIGN KEY (club_id) REFERENCES Clubs(id),
      FOREIGN KEY (verified_by) REFERENCES Users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS EventApprovals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      approved_by INTEGER,
      approval_status TEXT,
      approval_date TEXT,
      FOREIGN KEY (event_id) REFERENCES Events(id),
      FOREIGN KEY (approved_by) REFERENCES Users(id)
    )
  `);

  // Seed default faculty
  const existingFaculty = db.exec("SELECT id FROM Users WHERE email = 'faculty@college.edu.in'");
  if (existingFaculty.length === 0 || existingFaculty[0].values.length === 0) {
    const hashedPassword = await bcrypt.hash('faculty123', 10);
    db.run(
      "INSERT INTO Users (name, email, password, role, verified) VALUES (?, ?, ?, 'faculty', 1)",
      ['Dr. Admin Faculty', 'faculty@college.edu.in', hashedPassword]
    );
    console.log('✓ Default faculty account created: faculty@college.edu.in / faculty123');
  }

  // Seed clubs
  const existingClubs = db.exec("SELECT id FROM Clubs");
  if (existingClubs.length === 0 || existingClubs[0].values.length === 0) {
    const clubs = [
      ['APOGEE', 'Technical society promoting innovation and technology.', 1],
      ['GDSC - Google Developer Student Club', 'Google Developer Student Club for building solutions with Google technology.', 1],
      ['SOME', 'Society of Mechanical Engineers.', 1],
      ['StrataBiz', 'Business and strategy club for aspiring entrepreneurs.', 1],
      ['Vortex - Photography and Movie', 'Photography, filmmaking, and visual storytelling club.', 1],
      ['Social Works & Rural Activity', 'Community service and rural development initiatives.', 1],
      ['Website Development & Management', 'Web development, design, and digital management club.', 1],
      ['Yodha', 'Adventure and sports enthusiasts club.', 1],
      ['Yoga & Meditation', 'Promoting physical and mental wellness through yoga.', 1],
      ['Team Cultural Affairs (TCA)', 'Managing all cultural activities and events on campus.', 1],
      ['Aarogya', 'Health awareness and wellness club.', 1],
      ['Chetna', 'Social awareness and community engagement club.', 1],
      ['Dance', 'Dance performances, workshops, and competitions.', 1],
      ['Ek Bharat Shrestha Bharat', 'Celebrating India\'s cultural diversity and unity.', 1],
      ['Fashion & Modelling', 'Fashion shows, styling workshops, and modelling events.', 1],
      ['Finance Society NITJ', 'Financial literacy, investments, and economics club.', 1],
      ['Fine Art Society', 'Painting, sculpture, and visual arts club.', 1],
      ['Food & Flavour', 'Culinary arts, food festivals, and cooking events.', 1],
      ['Green', 'Environmental awareness and sustainability initiatives.', 1],
      ['Media Cell', 'Campus media, journalism, and content creation.', 1],
      ['Music', 'Musical performances, jam sessions, and concerts.', 1],
      ['NCC', 'National Cadet Corps — discipline, training, and service.', 1],
      ['Regional Language', 'Promoting regional languages and literature.', 1],
      ['Sanskriti', 'Celebrating Indian heritage and traditional arts.', 1],
      ['SPIC MACAY', 'Promoting Indian classical music and culture amongst youth.', 1],
      ['SARC', 'Student Alumni Relations Cell.', 1],
      ['Others', 'Special events, programs, and inter-departmental activities.', 1]
    ];

    clubs.forEach(([name, desc, fid]) => {
      db.run("INSERT INTO Clubs (club_name, description, faculty_id) VALUES (?, ?, ?)", [name, desc, fid]);
    });
    console.log('✓ Default clubs seeded');
  }

  // Seed some sample events
  const existingEvents = db.exec("SELECT id FROM Events");
  if (existingEvents.length === 0 || existingEvents[0].values.length === 0) {
    const events = [
      ['Hackathon 2026', 'Annual 24-hour coding hackathon with exciting prizes and mentorship sessions.', '2026-04-15', '09:00', '18:00', 'IT Park', 1, 1, 'approved'],
      ['Google DevFest', 'Google technology workshops, talks, and coding challenges.', '2026-04-20', '10:00', '16:00', 'LT 101', 2, 1, 'approved'],
      ['Spring Cultural Fest', 'Three-day cultural extravaganza featuring music, dance, and art exhibitions.', '2026-05-01', '16:00', '21:00', 'Community Center', 10, 1, 'approved'],
      ['Photography Exhibition', 'Campus photo exhibition showcasing the best captures of the year.', '2026-04-25', '08:00', '13:00', 'SB1', 5, 1, 'approved'],
      ['Yoga Day Celebration', 'International Yoga Day special session with expert instructors.', '2026-04-10', '06:00', '08:00', 'Main Ground', 9, 1, 'approved'],
      ['Classical Music Evening', 'An evening of Indian classical music and cultural performances.', '2026-04-12', '17:00', '20:00', 'LT 201', 25, 1, 'approved'],
    ];

    events.forEach(([name, desc, date, time, endTime, loc, clubId, createdBy, status]) => {
      db.run(
        "INSERT INTO Events (event_name, description, date, time, end_time, location, club_id, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [name, desc, date, time, endTime, loc, clubId, createdBy, status]
      );
    });
    console.log('✓ Sample events seeded');
  }

  console.log('✓ Database initialized successfully');
}

async function startServer() {
  await initDatabase();

  // Mount routes
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/events', require('./routes/events')(db));
  app.use('/api/clubs', require('./routes/clubs')(db));
  app.use('/api/coordinators', require('./routes/coordinators')(db));
  app.use('/api/approvals', require('./routes/approvals')(db));

  // Serve frontend
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 College Event Management System running at http://localhost:${PORT}\n`);
  });
}

startServer().catch(console.error);
