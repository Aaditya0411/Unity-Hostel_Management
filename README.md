# Unity Hostel Management System

A premium, production-grade hostel management web application engineered with a stunning modern 3D glassmorphic user interface and a complete, real email OTP authentication system.

---

## 🚀 Key Features

### 1. Real Authentication System
- **Registration**: Full Name, Email, Password, Confirm Password with live password strength score. Secure `bcryptjs` password hashing (12 rounds).
- **Real Email OTP Verification**: Cryptographically secure 6-digit OTP generated via `crypto.randomInt()`, SHA-256 hashed before storage, with automatic 10-minute expiry.
- **Interactive 6-Box OTP Input**: Individual styled digit boxes with auto-advance, backspace navigation, and clipboard paste parser.
- **Resend OTP & Cooldown**: Enforces a 60-second rate-limit cooldown with a live countdown timer. Previous OTP codes are immediately invalidated.
- **Secure Sessions**: 7-day HTTP-only JWT session cookie (`SameSite: Lax`), preventing XSS token theft.
- **Forgot & Reset Password**: Complete recovery flow dispatching dedicated reset OTP emails and updating hashed passwords in SQLite.
- **Route Protection**: Unauthenticated requests to `/dashboard.html` or protected APIs automatically redirect to `/login.html`. Unverified users are prompted to complete OTP verification.

### 2. Full Functional Hostel Operations (Zero Dummy Buttons)
- **Live Room Catalog & Bed Allotment**: Filter by Single, Double, Triple, AC Deluxe, Non-AC, and Executive Suite. Displays real-time bed availability and supports one-click bed reservation.
- **Fee Management & Ledger**: Tracks total fees, amounts paid, and pending balances. Includes an interactive Pay Now modal with automated receipt generation and transaction history.
- **Complaints & Maintenance Desk**: Complete ticket lifecycle (Pending &rarr; In Progress &rarr; Resolved). File complaints by category (Wi-Fi, Water, Electricity, Cleaning, Food, Security), set priorities (Low, Medium, High, Urgent), and mark tickets resolved upon completion.
- **Attendance & Leave / Night-Out Passes**: Monthly biometric tracking, attendance percentages, and formal online leave pass application with warden approval tracking.
- **Official Notice Board**: Categorized bulletins (General, Maintenance, Mess, Urgent) with timestamps and administrative signatures.
- **Resident Profile**: View and update contact numbers, college, course, semester, and emergency contact details.
- **Warden Helpdesk & Inquiries**: Public contact desk with direct hotline directories, emergency numbers, and inquiries recorded in SQLite.

### 3. Premium 3D Modern UI / UX
- Deep cosmic indigo aesthetic with glassmorphism panels (`backdrop-filter: blur(16px)`).
- Dynamic 3D card tilt micro-interactions on mouse hover.
- Responsive design across Desktop, Laptop, Tablet, and Mobile devices with a slide-out navigation drawer.
- Floating toast notifications and instant form validation feedback.

---

## 🛠️ Technology Stack
- **Runtime**: Node.js v22.5+ or Node.js v24+
- **Backend Framework**: Express.js (v5.2.1)
- **Database**: SQLite (built-in Node.js `node:sqlite` `DatabaseSync`)
- **Security & Auth**: `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `helmet`
- **Email Delivery**: `nodemailer` (SMTP with safe development fallback)
- **Frontend**: Vanilla Modern HTML5, CSS3 Glassmorphism, ES6 JavaScript, Font Awesome 6, Google Fonts (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono`)

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env`:

```powershell
copy .env.example .env
```

Edit `.env` to configure your settings:

```env
PORT=3000
NODE_ENV=development

# 64-character random secret for signing JWT cookies
JWT_SECRET=c9f8a3e7b1d4c2a5e8f0b3d6a9c1e4f7a2b5d8e1c4f7a0b3d6e9c2a5f8b1d4e7
OTP_MINUTES=10

DATABASE_FILE=./database/hostel.sqlite

# Real Email Delivery (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-google-app-password
MAIL_FROM=Unity Hostel <no-reply@unityhostel.com>
```

### 📧 Email Service Setup Instructions (Gmail App Password)
To send real verification emails to actual resident inboxes:
1. Log into your Google Account and navigate to **Security** &rarr; **2-Step Verification**.
2. Scroll to the bottom and select **App passwords**.
3. Enter `UnityHostel` as the App name and click **Create**.
4. Copy the generated 16-character password (e.g., `abcd efgh ijkl mnop`).
5. Paste it as `SMTP_PASSWORD` in your `.env` file (without spaces), and set `SMTP_USER` to your Gmail address.

> **Note on Development Mode:** If SMTP credentials are not configured or connection fails, the server uses a safe development fallback that logs the OTP code clearly in the terminal so you can test registration and recovery without interruption.

---

## 📦 Installation & Running

1. **Install Dependencies**:
   ```powershell
   npm install
   ```

2. **Start the Application**:
   ```powershell
   npm start
   ```

3. **Open in Browser**:
   ```
   http://localhost:3000
   ```

---

## 🧪 Testing the Complete Application

Run the automated test suite to verify all 13 backend endpoints, authentication, room bookings, and payments:

```powershell
node scratch/test_api.js
```

### Manual Test Checklist:
- [x] **Signup**: Open `http://localhost:3000/register.html`, enter your details, verify the password strength bar, and click **Create Account**.
- [x] **Email OTP**: Enter the 6-digit code received via email (or displayed in the server terminal in dev mode) into the 6 boxes. Test typing, backspacing, or pasting.
- [x] **Resend OTP**: Click **Resend Code** to test the 60-second cooldown timer.
- [x] **Login**: Sign in with registered credentials at `http://localhost:3000/login.html`.
- [x] **Dashboard**: Explore the 3D cards, room allotment, fee status, and attendance.
- [x] **Book Room**: Navigate to **Rooms & Booking**, choose a room, and click **Book This Room**.
- [x] **Pay Fee**: Navigate to **Fees & Payments**, click **Pay Now**, select UPI / Card, and verify the transaction record and updated pending balance.
- [x] **Lodge Complaint**: File a ticket under **Complaints Desk**, select priority, submit, and click **Mark Done** to resolve it.
- [x] **Leave Pass**: Apply for a Night Out pass under **Attendance & Leave**.
- [x] **Forgot Password**: Click **Forgot Password** on the login page, enter email, verify with the 6-digit reset code, and sign in with the new password.
