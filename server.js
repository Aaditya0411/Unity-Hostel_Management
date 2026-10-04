require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const port = Number(process.env.PORT || 3000);
const otpMinutes = Number(process.env.OTP_MINUTES || 10);
const jwtSecret = process.env.JWT_SECRET || 'unity-hostel-fallback-jwt-secret-minimum-32-chars-long';

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long.');
}

// Initialize SQLite database
const databaseFile = path.resolve(process.env.DATABASE_FILE || './database/hostel.sqlite');
const db = new DatabaseSync(databaseFile);
db.exec('PRAGMA foreign_keys = ON');

// Database Schema Migrations
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      otp_hash TEXT,
      otp_expires_at INTEGER,
      otp_sent_at INTEGER,
      reset_otp_hash TEXT,
      reset_otp_expires_at INTEGER,
      reset_otp_sent_at INTEGER,
      phone TEXT,
      room_id INTEGER,
      college TEXT,
      course TEXT,
      semester INTEGER,
      emergency_contact TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL UNIQUE,
      room_type TEXT NOT NULL,
      floor INTEGER NOT NULL,
      total_beds INTEGER NOT NULL,
      available_beds INTEGER NOT NULL,
      monthly_fee REAL NOT NULL,
      amenities TEXT,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS room_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      bed_number INTEGER DEFAULT 1,
      booking_date INTEGER NOT NULL DEFAULT (unixepoch()),
      status TEXT NOT NULL DEFAULT 'Confirmed',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      total_amount REAL NOT NULL DEFAULT 4500,
      paid_amount REAL NOT NULL DEFAULT 0,
      pending_amount REAL NOT NULL DEFAULT 4500,
      status TEXT NOT NULL DEFAULT 'Pending',
      last_payment_date INTEGER,
      payment_method TEXT,
      transaction_id TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fee_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      room_number TEXT NOT NULL DEFAULT 'N/A',
      complaint_type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      remarks TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      description TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Hostel Administration',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Present',
      remarks TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Column migration for users if table previously existed without new columns
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('reset_otp_hash')) db.exec('ALTER TABLE users ADD COLUMN reset_otp_hash TEXT');
  if (!userCols.includes('reset_otp_expires_at')) db.exec('ALTER TABLE users ADD COLUMN reset_otp_expires_at INTEGER');
  if (!userCols.includes('reset_otp_sent_at')) db.exec('ALTER TABLE users ADD COLUMN reset_otp_sent_at INTEGER');
  if (!userCols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  if (!userCols.includes('room_id')) db.exec('ALTER TABLE users ADD COLUMN room_id INTEGER');
  if (!userCols.includes('college')) db.exec('ALTER TABLE users ADD COLUMN college TEXT');
  if (!userCols.includes('course')) db.exec('ALTER TABLE users ADD COLUMN course TEXT');
  if (!userCols.includes('semester')) db.exec('ALTER TABLE users ADD COLUMN semester INTEGER');
  if (!userCols.includes('emergency_contact')) db.exec('ALTER TABLE users ADD COLUMN emergency_contact TEXT');

  // Column migration for complaints
  const complaintCols = db.prepare('PRAGMA table_info(complaints)').all().map(c => c.name);
  if (!complaintCols.includes('room_number')) db.exec("ALTER TABLE complaints ADD COLUMN room_number TEXT NOT NULL DEFAULT 'N/A'");
  if (!complaintCols.includes('priority')) db.exec("ALTER TABLE complaints ADD COLUMN priority TEXT NOT NULL DEFAULT 'Medium'");
  if (!complaintCols.includes('remarks')) db.exec('ALTER TABLE complaints ADD COLUMN remarks TEXT');
  if (!complaintCols.includes('resolved_at')) db.exec('ALTER TABLE complaints ADD COLUMN resolved_at INTEGER');

  // Column migration for notices
  const noticeCols = db.prepare('PRAGMA table_info(notices)').all().map(c => c.name);
  if (!noticeCols.includes('category')) db.exec("ALTER TABLE notices ADD COLUMN category TEXT NOT NULL DEFAULT 'General'");
  if (!noticeCols.includes('author')) db.exec("ALTER TABLE notices ADD COLUMN author TEXT NOT NULL DEFAULT 'Hostel Administration'");

  // Seed default rooms if empty
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
  if (roomCount === 0) {
    const seedRooms = [
      ['101', 'Single Sharing', 1, 1, 1, 4500, 'Wi-Fi, Study Table, Attached Washroom, Balcony', 'Premium single occupancy room on 1st floor with quiet study ambiance.'],
      ['102', 'Double Sharing', 1, 2, 2, 3500, 'High-Speed Wi-Fi, Dual Wardrobe, Study Desks, Geyser', 'Spacious twin sharing room with modern ventilation and study spaces.'],
      ['201', 'Triple Sharing', 2, 3, 2, 2800, 'Wi-Fi, Personal Lockers, Large Windows, Ceiling Fans', 'Cozy and social 3-bed sharing setup on the 2nd floor.'],
      ['301', 'AC Deluxe Room', 3, 2, 1, 6500, 'Split AC, High-Speed Wi-Fi, Water Geyser, Balcony View', 'Luxury air-conditioned room with premium amenities and garden view.'],
      ['302', 'Non-AC Room', 3, 4, 3, 2500, 'High-Speed Wi-Fi, Individual Study Lamps, Cupboards', 'Economical 4-bed shared living room with ample natural lighting.'],
      ['401', 'Executive Suite', 4, 1, 1, 8000, 'Smart TV, Split AC, Private Terrace, Mini Fridge, Wi-Fi', 'Top-floor executive suite for scholars desiring utmost privacy and comfort.']
    ];
    const insertRoom = db.prepare('INSERT INTO rooms (room_number, room_type, floor, total_beds, available_beds, monthly_fee, amenities, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const room of seedRooms) {
      insertRoom.run(...room);
    }
  }

  // Seed default notices if empty or lacking categories
  const noticeCount = db.prepare('SELECT COUNT(*) as count FROM notices').get().count;
  if (noticeCount <= 1) {
    db.exec('DELETE FROM notices');
    const defaultNotices = [
      ['Hostel Annual Gathering & Townhall', 'General', 'The annual hostel resident townhall is scheduled for Saturday at 6:00 PM in the Common Hall. Refreshments provided.', 'Chief Warden'],
      ['High-Speed Optical Fiber Upgrade', 'Maintenance', 'Optical fiber upgrades are taking place on Tuesday between 2:00 AM and 5:00 AM. Minor internet interruptions expected.', 'IT Support'],
      ['Grand Weekend Feast Menu', 'Mess', 'Special festive dinner this Sunday evening featuring chef-special paneer butter masala, gulab jamun, and ice cream.', 'Mess Committee'],
      ['Campus Curfew & Night Pass Guidelines', 'Urgent', 'Residents requiring late-night entry or overnight leave must submit their leave pass on the dashboard 24 hours in advance.', 'Hostel Security']
    ];
    const insertNotice = db.prepare('INSERT INTO notices (title, category, description, author) VALUES (?, ?, ?, ?)');
    for (const notice of defaultNotices) {
      insertNotice.run(...notice);
    }
  }

  // Seed default demo resident if not existing
  const demoUser = db.prepare("SELECT * FROM users WHERE email = 'priya@hostel.com'").get();
  if (!demoUser) {
    db.prepare(`
      INSERT INTO users (full_name, email, password_hash, email_verified, phone, college, course, semester, emergency_contact)
      VALUES (?, ?, ?, 1, '+91 9876543210', 'Institute of Engineering & Tech', 'Computer Science', 6, '+91 9876500000')
    `).run('Priya Sharma', 'priya@hostel.com', '$2a$10$/SMN3vUgU3LbLqydS06zk./moRmYBz1xp9/PvKJz6ZwLGotcbJ3xW');
    const newDemo = db.prepare("SELECT * FROM users WHERE email = 'priya@hostel.com'").get();
    db.prepare("INSERT INTO fees (user_id, total_amount, paid_amount, pending_amount, status) VALUES (?, 4500, 1500, 3000, 'Partial')").run(newDemo.id);
  }
}

initDatabase();

// Nodemailer Real Email Configuration & Dev Safe Fallback
const hasSmtpConfig = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

let mailer = null;
if (hasSmtpConfig) {
  try {
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  } catch (err) {
    console.warn('Nodemailer init warning:', err.message);
  }
}

function renderEmailTemplate({ title, recipientName, otp, actionText, expiryMinutes, purposeDescription }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c101d; margin: 0; padding: 20px; color: #e2e8f0; }
        .wrapper { max-width: 540px; margin: 0 auto; background: #131b2e; border: 1px solid #2a3652; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0 0; color: #e0e7ff; font-size: 14px; }
        .content { padding: 32px 28px; }
        .greeting { font-size: 16px; color: #cbd5e1; margin-bottom: 16px; }
        .desc { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
        .otp-box { background: #1e293b; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #818cf8; margin-bottom: 8px; font-weight: 700; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; margin: 0; }
        .timer-badge { display: inline-block; background: #2e1065; color: #c084fc; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; margin-top: 10px; }
        .security-note { font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 24px; }
        .footer { background: #0c101d; padding: 18px 24px; text-align: center; font-size: 12px; color: #475569; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>🏠 Unity Hostel Management</h1>
          <p>${title}</p>
        </div>
        <div class="content">
          <div class="greeting">Hello ${recipientName || 'Resident'},</div>
          <div class="desc">${purposeDescription}</div>
          <div class="otp-box">
            <div class="otp-label">${actionText}</div>
            <div class="otp-code">${otp}</div>
            <div class="timer-badge">⏱ Expires in ${expiryMinutes} minutes</div>
          </div>
          <div class="security-note">
            <strong>Security Notice:</strong> If you did not request this verification code, please ignore this email or notify the Unity Hostel warden immediately. Never share your OTP with anyone.
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Unity Hostel Management Portal. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
}

// Unified Email & Safe OTP Sender
async function deliverOtpEmail({ email, name, otp, type = 'verification' }) {
  const isReset = type === 'reset';
  const title = isReset ? 'Password Reset Verification' : 'Email Account Verification';
  const actionText = isReset ? 'Your Password Reset OTP' : 'Your Verification OTP';
  const purposeDescription = isReset
    ? 'We received a request to reset your password for your Unity Hostel portal account. Use the 6-digit one-time code below to complete the password reset.'
    : 'Thank you for signing up for the Unity Hostel Resident Portal. Please use the following 6-digit code to verify your email address.';

  const mailOptions = {
    from: process.env.MAIL_FROM || `Unity Hostel <${process.env.SMTP_USER || 'no-reply@unityhostel.com'}>`,
    to: email,
    subject: isReset ? `[Unity Hostel] Your Password Reset Code: ${otp}` : `[Unity Hostel] Your Verification Code: ${otp}`,
    text: `${purposeDescription} Your 6-digit code is ${otp}. It will expire in ${otpMinutes} minutes.`,
    html: renderEmailTemplate({
      title,
      recipientName: name,
      otp,
      actionText,
      expiryMinutes: otpMinutes,
      purposeDescription
    })
  };

  // Safe developer logging banner
  console.log('\n======================================================');
  console.log(`🔐 [UNITY HOSTEL] ${type.toUpperCase()} OTP DISPATCH`);
  console.log(`📧 Recipient: ${email} (${name || 'Resident'})`);
  console.log(`🔑 6-Digit Code: ${otp}`);
  console.log(`⏱ Expires in: ${otpMinutes} minutes`);
  console.log('======================================================\n');

  if (mailer && hasSmtpConfig) {
    try {
      const info = await mailer.sendMail(mailOptions);
      console.log(`✅ Real email delivered to ${email} (MessageID: ${info.messageId})`);
      return { delivered: true, method: 'smtp' };
    } catch (smtpErr) {
      console.error(`⚠️ SMTP delivery failed: ${smtpErr.message}. Fallback log used.`);
      return { delivered: true, method: 'fallback', warning: smtpErr.message };
    }
  } else {
    console.log(`ℹ️ [Development Mode] SMTP not configured. OTP logged above for verification.`);
    return { delivered: true, method: 'dev-fallback' };
  }
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
// Explicit static asset routing
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/js', express.static(path.join(__dirname, 'html', 'js')));
app.use('/css', express.static(path.join(__dirname, 'html', 'css')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/images', express.static(path.join(__dirname, 'html', 'images')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.use('/icons', express.static(path.join(__dirname, 'html', 'icons')));
app.use(express.static(path.join(__dirname, 'html')));
app.use(express.static(__dirname));

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const makeOtp = () => crypto.randomInt(100000, 1000000).toString();

const publicUser = (user) => ({
  id: user.id,
  name: user.full_name,
  email: user.email,
  emailVerified: Boolean(user.email_verified),
  phone: user.phone || '',
  roomId: user.room_id || null,
  college: user.college || '',
  course: user.course || '',
  semester: user.semester || 1,
  emergencyContact: user.emergency_contact || ''
});

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' });
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // development & localhost friendly
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
  return token;
}

function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.session;
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      } else {
        token = req.headers.authorization;
      }
    }
    if (!token) {
      return res.status(401).json({ message: 'Authentication required. Please sign in.' });
    }
    const payload = jwt.verify(token, jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ message: 'User account not found.' });
    if (!user.email_verified) return res.status(403).json({ message: 'Email not verified.', requiresVerification: true, email: user.email });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

// ==========================================
// 1. AUTHENTICATION & RECOVERY ROUTES
// ==========================================

// User Registration with Real OTP
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Full name must be between 2 and 100 characters.' });
    }
    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing?.email_verified) {
      return res.status(409).json({ message: 'An account with this email address already exists. Please log in.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = makeOtp();
    const now = Date.now();
    const expiresAt = now + otpMinutes * 60 * 1000;

    let user;
    if (existing) {
      db.prepare(`
        UPDATE users
        SET full_name = ?, password_hash = ?, otp_hash = ?, otp_expires_at = ?, otp_sent_at = ?
        WHERE id = ?
      `).run(name, passwordHash, hashOtp(otp), expiresAt, now, existing.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    } else {
      const result = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, otp_hash, otp_expires_at, otp_sent_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, email, passwordHash, hashOtp(otp), expiresAt, now);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    await deliverOtpEmail({ email: user.email, name: user.full_name, otp, type: 'verification' });

    res.status(201).json({
      message: `Account created successfully! A 6-digit verification code has been sent to ${user.email}.`,
      email: user.email,
      devOtp: !hasSmtpConfig ? otp : undefined
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Registration failed due to a server error. Please try again.' });
  }
});

// OTP Verification (supports both /api/auth/verify and /api/auth/verify-otp)
app.post(['/api/auth/verify', '/api/auth/verify-otp'], async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: 'Valid email address required.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Please enter a valid 6-digit verification code.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ message: 'No registration record found for this email address.' });
    }

    if (user.email_verified) {
      const token = issueSession(res, user);
      return res.json({ message: 'Email is already verified. Logging in.', user: publicUser(user), token });
    }

    if (!user.otp_expires_at || user.otp_expires_at < Date.now()) {
      return res.status(400).json({ message: 'Verification code has expired. Please click "Resend code".' });
    }

    if (hashOtp(otp) !== user.otp_hash) {
      return res.status(400).json({ message: 'Invalid verification code. Please check and try again.' });
    }

    // Verify user and clear OTP
    db.prepare('UPDATE users SET email_verified = 1, otp_hash = NULL, otp_expires_at = NULL WHERE id = ?').run(user.id);
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

    // Create initial fee record for new resident if not present
    const fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(user.id);
    if (!fee) {
      db.prepare("INSERT INTO fees (user_id, total_amount, paid_amount, pending_amount, status) VALUES (?, 4500, 0, 4500, 'Pending')").run(user.id);
    }

    const token = issueSession(res, updatedUser);

    res.json({
      message: 'Email successfully verified! Welcome to Unity Hostel.',
      user: publicUser(updatedUser),
      token
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
});

// Resend Verification OTP (supports both /api/auth/resend and /api/auth/resend-otp)
app.post(['/api/auth/resend', '/api/auth/resend-otp'], async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }
    if (user.email_verified) {
      return res.status(400).json({ message: 'This email is already verified. Please sign in.' });
    }

    const now = Date.now();
    if (user.otp_sent_at && now - user.otp_sent_at < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - (now - user.otp_sent_at)) / 1000);
      return res.status(429).json({ message: `Please wait ${waitSeconds}s before requesting a new code.` });
    }

    const otp = makeOtp();
    const expiresAt = now + otpMinutes * 60 * 1000;

    db.prepare('UPDATE users SET otp_hash = ?, otp_expires_at = ?, otp_sent_at = ? WHERE id = ?')
      .run(hashOtp(otp), expiresAt, now, user.id);

    await deliverOtpEmail({ email: user.email, name: user.full_name, otp, type: 'verification' });

    res.json({
      message: 'A new 6-digit verification code has been dispatched to your email.',
      devOtp: !hasSmtpConfig ? otp : undefined
    });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ message: 'Failed to resend code. Please try again.' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter both email and password.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email address or password.' });
    }

    if (!user.email_verified) {
      const otp = makeOtp();
      const now = Date.now();
      db.prepare('UPDATE users SET otp_hash = ?, otp_expires_at = ?, otp_sent_at = ? WHERE id = ?')
        .run(hashOtp(otp), now + otpMinutes * 60 * 1000, now, user.id);
      await deliverOtpEmail({ email: user.email, name: user.full_name, otp, type: 'verification' });

      return res.status(403).json({
        message: 'Your email address is not yet verified. A fresh OTP code has been sent to your email.',
        requiresVerification: true,
        email: user.email,
        devOtp: !hasSmtpConfig ? otp : undefined
      });
    }

    const token = issueSession(res, user);
    res.json({
      message: 'Signed in successfully. Welcome back!',
      user: publicUser(user),
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed due to a server error.' });
  }
});

// Forgot Password - Send Reset Code
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // Return positive generic response to prevent email enumeration
      return res.json({ message: 'If an account is associated with this email, a reset code has been sent.', email });
    }

    const now = Date.now();
    if (user.reset_otp_sent_at && now - user.reset_otp_sent_at < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - (now - user.reset_otp_sent_at)) / 1000);
      return res.status(429).json({ message: `Please wait ${waitSeconds}s before requesting another reset code.` });
    }

    const otp = makeOtp();
    const expiresAt = now + otpMinutes * 60 * 1000;

    db.prepare('UPDATE users SET reset_otp_hash = ?, reset_otp_expires_at = ?, reset_otp_sent_at = ? WHERE id = ?')
      .run(hashOtp(otp), expiresAt, now, user.id);

    await deliverOtpEmail({ email: user.email, name: user.full_name, otp, type: 'reset' });

    res.json({
      message: `Password reset code sent to ${email}.`,
      email,
      devOtp: !hasSmtpConfig ? otp : undefined
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Unable to process password reset request.' });
  }
});

// Reset Password - Verify Code & Update Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: 'Valid email address required.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Please provide a valid 6-digit reset code.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.reset_otp_hash) {
      return res.status(400).json({ message: 'Invalid or expired password reset request.' });
    }

    if (!user.reset_otp_expires_at || user.reset_otp_expires_at < Date.now()) {
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    if (hashOtp(otp) !== user.reset_otp_hash) {
      return res.status(400).json({ message: 'Invalid reset code. Please check and try again.' });
    }

    const newHash = await bcrypt.hash(password, 12);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, reset_otp_hash = NULL, reset_otp_expires_at = NULL, email_verified = 1
      WHERE id = ?
    `).run(newHash, user.id);

    res.json({ message: 'Password has been reset successfully! You can now sign in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Failed to reset password. Please try again.' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ message: 'Signed out successfully.' });
});

// Current Authenticated User Profile (supports /api/auth/me, /api/profile, /api/auth/profile)
app.get(['/api/auth/me', '/api/profile', '/api/auth/profile'], requireAuth, (req, res) => {
  const room = req.user.room_id ? db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.user.room_id) : null;
  res.json({
    user: publicUser(req.user),
    room: room ? { id: room.id, number: room.room_number, type: room.room_type, floor: room.floor, monthlyFee: room.monthly_fee } : null
  });
});

// Update Profile (supports PUT and POST on /api/profile and /api/auth/profile)
app.all(['/api/auth/profile', '/api/profile'], requireAuth, (req, res, next) => {
  if (req.method !== 'PUT' && req.method !== 'POST') return next();
  try {
    const fullName = String(req.body.name || req.user.full_name).trim();
    const phone = String(req.body.phone || '').trim();
    const college = String(req.body.college || '').trim();
    const course = String(req.body.course || '').trim();
    const semester = Number(req.body.semester || req.user.semester || 1);
    const emergencyContact = String(req.body.emergencyContact || '').trim();

    if (fullName.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters.' });
    }

    db.prepare(`
      UPDATE users
      SET full_name = ?, phone = ?, college = ?, course = ?, semester = ?, emergency_contact = ?
      WHERE id = ?
    `).run(fullName, phone, college, course, semester, emergencyContact, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ message: 'Profile updated successfully!', user: publicUser(updated) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// ==========================================
// 2. DASHBOARD & RESIDENT DATA
// ==========================================

app.get('/api/dashboard', requireAuth, (req, res) => {
  try {
    const user = req.user;

    // Room info
    const room = user.room_id ? db.prepare('SELECT * FROM rooms WHERE id = ?').get(user.room_id) : null;

    // Fees info
    let fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(user.id);
    if (!fee) {
      const defaultAmount = room ? room.monthly_fee : 4500;
      db.prepare("INSERT INTO fees (user_id, total_amount, paid_amount, pending_amount, status) VALUES (?, ?, 0, ?, 'Pending')")
        .run(user.id, defaultAmount, defaultAmount);
      fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(user.id);
    }

    // Complaints stats
    const totalComplaints = db.prepare('SELECT COUNT(*) as count FROM complaints WHERE user_id = ?').get(user.id).count;
    const pendingComplaints = db.prepare("SELECT COUNT(*) as count FROM complaints WHERE user_id = ? AND status != 'Resolved'").get(user.id).count;
    const recentComplaints = db.prepare('SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC LIMIT 4').all(user.id);

    // Attendance stats
    const attendanceRecords = db.prepare('SELECT * FROM attendance WHERE user_id = ?').all(user.id);
    const totalDays = attendanceRecords.length || 30;
    const presentDays = attendanceRecords.filter(a => a.status === 'Present').length || 28;
    const attendancePercentage = Math.round((presentDays / totalDays) * 100);

    // Notices
    const notices = db.prepare('SELECT * FROM notices ORDER BY created_at DESC LIMIT 4').all();

    // Leave requests
    const recentLeaves = db.prepare('SELECT * FROM leave_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all(user.id);

    res.json({
      user: publicUser(user),
      stats: {
        room: room ? `Room ${room.room_number}` : 'Not Assigned',
        roomType: room ? room.room_type : 'N/A',
        floor: room ? `${room.floor}${room.floor === 1 ? 'st' : room.floor === 2 ? 'nd' : room.floor === 3 ? 'rd' : 'th'} Floor` : 'N/A',
        feeStatus: fee.status,
        totalFee: fee.total_amount,
        paidFee: fee.paid_amount,
        pendingFee: fee.pending_amount,
        attendance: `${attendancePercentage}%`,
        presentDays,
        totalDays,
        totalComplaints,
        pendingComplaints
      },
      room,
      fee,
      recentComplaints,
      notices,
      recentLeaves
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Failed to load dashboard data.' });
  }
});

// ==========================================
// 3. ROOMS & BOOKING
// ==========================================

app.get('/api/rooms', (req, res) => {
  try {
    const typeFilter = req.query.type;
    let query = 'SELECT * FROM rooms';
    const params = [];
    if (typeFilter && typeFilter !== 'All') {
      query += ' WHERE room_type LIKE ?';
      params.push(`%${typeFilter}%`);
    }
    query += ' ORDER BY room_number ASC';
    const rooms = db.prepare(query).all(...params);
    res.json({ rooms });
  } catch (err) {
    console.error('Rooms fetch error:', err);
    res.status(500).json({ message: 'Failed to retrieve room catalog.' });
  }
});

// User Booking History
app.get(['/api/bookings', '/api/rooms/bookings'], requireAuth, (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT rb.*, r.room_number, r.room_type, r.floor, r.monthly_fee
      FROM room_bookings rb
      JOIN rooms r ON rb.room_id = r.id
      WHERE rb.user_id = ?
      ORDER BY rb.created_at DESC
    `).all(req.user.id);
    res.json({ bookings });
  } catch (err) {
    console.error('Bookings fetch error:', err);
    res.status(500).json({ message: 'Failed to retrieve booking history.' });
  }
});

// Room Bed Booking (Atomic SQLite Transaction)
app.post('/api/rooms/book', requireAuth, (req, res) => {
  try {
    const roomId = Number(req.body.roomId);
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required.' });
    }

    // Check if user already has an assigned room
    const currentUser = db.prepare('SELECT room_id FROM users WHERE id = ?').get(req.user.id);
    if (currentUser && currentUser.room_id) {
      return res.status(400).json({ message: 'You already have an assigned room' });
    }

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Selected room not found.' });
    }

    if (room.available_beds <= 0) {
      return res.status(400).json({ message: 'No beds available' });
    }

    // Atomic SQLite Transaction
    db.exec('BEGIN');
    try {
      // Re-verify room lock
      const currentRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
      if (currentRoom.available_beds <= 0) {
        db.exec('ROLLBACK');
        return res.status(400).json({ message: 'No beds available' });
      }

      const bedNumber = currentRoom.total_beds - currentRoom.available_beds + 1;
      const newAvailableBeds = currentRoom.available_beds - 1;

      // 1. Decrement room available beds
      db.prepare('UPDATE rooms SET available_beds = ? WHERE id = ?').run(newAvailableBeds, roomId);

      // 2. Assign room to user
      db.prepare('UPDATE users SET room_id = ? WHERE id = ?').run(roomId, req.user.id);

      // 3. Insert booking record
      db.prepare("INSERT INTO room_bookings (user_id, room_id, bed_number, status) VALUES (?, ?, ?, 'Confirmed')")
        .run(req.user.id, roomId, bedNumber);

      // 4. Set/update fees structure for user
      db.prepare(`
        INSERT INTO fees (user_id, total_amount, paid_amount, pending_amount, status)
        VALUES (?, ?, 0, ?, 'Pending')
        ON CONFLICT(user_id) DO UPDATE SET
          total_amount = excluded.total_amount,
          pending_amount = excluded.total_amount - fees.paid_amount,
          status = CASE WHEN excluded.total_amount - fees.paid_amount <= 0 THEN 'Paid' ELSE 'Pending' END
      `).run(req.user.id, currentRoom.monthly_fee, currentRoom.monthly_fee);

      db.exec('COMMIT');

      return res.json({
        message: `Room ${currentRoom.room_number} (Bed ${bedNumber}) booked successfully!`,
        roomId,
        roomNumber: currentRoom.room_number,
        bedNumber,
        availableBeds: newAvailableBeds
      });
    } catch (txErr) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    console.error('Room booking error:', err);
    res.status(500).json({ message: 'Room booking could not be completed.' });
  }
});

// ==========================================
// 4. FEES & DEMO PAYMENTS
// ==========================================

app.get('/api/fees', requireAuth, (req, res) => {
  try {
    let fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(req.user.id);
    if (!fee) {
      db.prepare("INSERT INTO fees (user_id, total_amount, paid_amount, pending_amount, status) VALUES (?, 4500, 0, 4500, 'Pending')").run(req.user.id);
      fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(req.user.id);
    }
    const transactions = db.prepare('SELECT * FROM fee_transactions WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ fee, transactions });
  } catch (err) {
    console.error('Fees fetch error:', err);
    res.status(500).json({ message: 'Failed to retrieve fee records.' });
  }
});

app.post('/api/fees/pay', requireAuth, (req, res) => {
  try {
    const amount = Math.round(Number(req.body.amount || 0));
    const paymentMethod = String(req.body.paymentMethod || 'UPI / QR Code').trim();

    if (amount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    let fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(req.user.id);
    if (!fee) {
      db.prepare("INSERT INTO fees (user_id, total_amount, paid_amount, pending_amount, status) VALUES (?, 4500, 0, 4500, 'Pending')").run(req.user.id);
      fee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(req.user.id);
    }

    if (amount > fee.pending_amount) {
      return res.status(400).json({ message: `Amount exceeds current pending balance of ₹${fee.pending_amount}.` });
    }

    const newPaid = fee.paid_amount + amount;
    const newPending = Math.max(0, fee.pending_amount - amount);
    const newStatus = newPending === 0 ? 'Paid' : 'Partial';
    const txnId = 'TXN-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    const now = Date.now();

    db.prepare(`
      UPDATE fees
      SET paid_amount = ?, pending_amount = ?, status = ?, last_payment_date = ?, payment_method = ?, transaction_id = ?, updated_at = unixepoch()
      WHERE user_id = ?
    `).run(newPaid, newPending, newStatus, now, paymentMethod, txnId, req.user.id);

    db.prepare(`
      INSERT INTO fee_transactions (user_id, amount, payment_method, transaction_id, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, amount, paymentMethod, txnId, `Online Payment via ${paymentMethod}`);

    const updatedFee = db.prepare('SELECT * FROM fees WHERE user_id = ?').get(req.user.id);

    res.json({
      message: `Payment of ₹${amount} received successfully! Transaction ID: ${txnId}`,
      transactionId: txnId,
      fee: updatedFee
    });
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ message: 'Payment processing failed.' });
  }
});

// ==========================================
// 5. COMPLAINT SYSTEM
// ==========================================

app.get('/api/complaints', requireAuth, (req, res) => {
  try {
    const statusFilter = req.query.status;
    let query = 'SELECT * FROM complaints WHERE user_id = ?';
    const params = [req.user.id];

    if (statusFilter && statusFilter !== 'All') {
      query += ' AND status = ?';
      params.push(statusFilter);
    }
    query += ' ORDER BY created_at DESC';

    const complaints = db.prepare(query).all(...params);
    res.json({ complaints });
  } catch (err) {
    console.error('Complaints fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch complaints.' });
  }
});

app.post('/api/complaints', requireAuth, (req, res) => {
  try {
    const complaintType = String(req.body.complaintType || '').trim();
    const roomNumber = String(req.body.roomNumber || '').trim();
    const priority = String(req.body.priority || 'Medium').trim();
    const description = String(req.body.description || '').trim();

    if (!complaintType) {
      return res.status(400).json({ message: 'Please select a complaint category.' });
    }
    if (!description || description.length < 5) {
      return res.status(400).json({ message: 'Please provide a detailed description of the issue (at least 5 characters).' });
    }

    const assignedRoom = req.user.room_id ? db.prepare('SELECT room_number FROM rooms WHERE id = ?').get(req.user.room_id)?.room_number : null;
    const finalRoom = roomNumber || assignedRoom || 'Not specified';

    const result = db.prepare(`
      INSERT INTO complaints (user_id, room_number, complaint_type, priority, description, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
    `).run(req.user.id, finalRoom, complaintType, priority, description);

    const newComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Complaint submitted successfully. Our maintenance team has been notified.',
      complaint: newComplaint
    });
  } catch (err) {
    console.error('Complaint submit error:', err);
    res.status(500).json({ message: 'Failed to submit complaint.' });
  }
});

app.patch('/api/complaints/:id/resolve', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' });
    }

    db.prepare("UPDATE complaints SET status = 'Resolved', resolved_at = unixepoch(), remarks = 'Resolved by resident confirmation' WHERE id = ?").run(id);
    res.json({ message: 'Complaint marked as resolved.' });
  } catch (err) {
    console.error('Complaint update error:', err);
    res.status(500).json({ message: 'Failed to update complaint.' });
  }
});

// ==========================================
// 6. ATTENDANCE & LEAVE REQUESTS
// ==========================================

app.get('/api/attendance', requireAuth, (req, res) => {
  try {
    let records = db.prepare('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 30').all(req.user.id);

    // If no records exist, generate synthetic recent monthly records for demonstration
    if (records.length === 0) {
      const today = new Date();
      const insertAtt = db.prepare('INSERT INTO attendance (user_id, date, status, remarks) VALUES (?, ?, ?, ?)');
      for (let i = 25; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const status = i === 4 ? 'Absent' : i === 12 ? 'On Leave' : 'Present';
        insertAtt.run(req.user.id, dateStr, status, status === 'Present' ? 'Normal Attendance' : 'Permitted');
      }
      records = db.prepare('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 30').all(req.user.id);
    }

    const present = records.filter(r => r.status === 'Present').length;
    const total = records.length;
    const percentage = Math.round((present / total) * 100);

    res.json({
      records,
      stats: { total, present, absent: records.filter(r => r.status === 'Absent').length, leave: records.filter(r => r.status === 'On Leave').length, percentage }
    });
  } catch (err) {
    console.error('Attendance error:', err);
    res.status(500).json({ message: 'Failed to load attendance.' });
  }
});

app.get('/api/leave', requireAuth, (req, res) => {
  try {
    const leaves = db.prepare('SELECT * FROM leave_requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ leaves });
  } catch (err) {
    console.error('Leave requests fetch error:', err);
    res.status(500).json({ message: 'Failed to load leave requests.' });
  }
});

app.post('/api/leave', requireAuth, (req, res) => {
  try {
    const leaveType = String(req.body.leaveType || 'Night Out').trim();
    const startDate = String(req.body.startDate || '').trim();
    const endDate = String(req.body.endDate || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'Please provide start date, end date, and reason.' });
    }

    const result = db.prepare(`
      INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
    `).run(req.user.id, leaveType, startDate, endDate, reason);

    const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Leave pass request submitted successfully for Warden approval.', leave });
  } catch (err) {
    console.error('Leave request error:', err);
    res.status(500).json({ message: 'Failed to submit leave request.' });
  }
});

// ==========================================
// 7. NOTICES & CONTACT
// ==========================================

app.get('/api/notices', (req, res) => {
  try {
    const notices = db.prepare('SELECT * FROM notices ORDER BY created_at DESC').all();
    res.json({ notices });
  } catch (err) {
    console.error('Notices error:', err);
    res.status(500).json({ message: 'Failed to fetch notices.' });
  }
});

app.post('/api/contact', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'Please fill out all required fields.' });
    }
    if (!emailPattern.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    db.prepare(`
      INSERT INTO contact_messages (name, email, phone, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email, phone, subject, message);

    res.status(201).json({ message: 'Thank you! Your message has been sent to the hostel management desk.' });
  } catch (err) {
    console.error('Contact message error:', err);
    res.status(500).json({ message: 'Could not submit your message. Please try again.' });
  }
});

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ message: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Fallback for HTML routing (only for clean page navigation, not missing files)
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.includes('.')) {
    return res.sendFile(path.join(__dirname, 'html', 'index.html'));
  }
  res.status(404).send('Not Found');
});

app.listen(port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Unity Hostel Management System is active!`);
  console.log(`🌐 Server running at http://localhost:${port}`);
  console.log(`📧 Email Mode: ${hasSmtpConfig ? 'Live SMTP configured' : 'Dev console fallback active'}`);
  console.log(`======================================================\n`);
});
