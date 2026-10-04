CREATE DATABASE IF NOT EXISTS hostel_db;

USE hostel_db;

-- ===========================
-- Admin Table
-- ===========================

CREATE TABLE admin (
    admin_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255)
);

-- ===========================
-- Students Table
-- ===========================

CREATE TABLE students (
    student_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100),
    father_name VARCHAR(100),
    mother_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    mobile VARCHAR(15),
    gender VARCHAR(20),
    dob DATE,
    college VARCHAR(100),
    course VARCHAR(100),
    semester INT,
    address TEXT,
    photo VARCHAR(255),
    password VARCHAR(255)
);

-- ===========================
-- Rooms Table
-- ===========================

CREATE TABLE rooms (
    room_id INT PRIMARY KEY AUTO_INCREMENT,
    room_number VARCHAR(20),
    room_type VARCHAR(50),
    floor INT,
    total_beds INT,
    available_beds INT,
    monthly_fee DECIMAL(10,2)
);

-- ===========================
-- Room Booking Table
-- ===========================

CREATE TABLE room_booking (
    booking_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT,
    room_id INT,
    booking_date DATE,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
);

-- ===========================
-- Fees Table
-- ===========================

CREATE TABLE fees (
    fee_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT,
    total_fee DECIMAL(10,2),
    paid_fee DECIMAL(10,2),
    pending_fee DECIMAL(10,2),
    payment_date DATE,
    FOREIGN KEY (student_id) REFERENCES students(student_id)
);

-- ===========================
-- Complaints Table
-- ===========================

CREATE TABLE complaints (
    complaint_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT,
    room_number VARCHAR(20),
    complaint_type VARCHAR(100),
    description TEXT,
    complaint_date DATE,
    status VARCHAR(30),
    FOREIGN KEY (student_id) REFERENCES students(student_id)
);

-- ===========================
-- Attendance Table
-- ===========================

CREATE TABLE attendance (
    attendance_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT,
    attendance_date DATE,
    status VARCHAR(20),
    FOREIGN KEY (student_id) REFERENCES students(student_id)
);

-- ===========================
-- Notice Table
-- ===========================

CREATE TABLE notice (
    notice_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(100),
    description TEXT,
    notice_date DATE
);

-- ===========================
-- Visitors Table
-- ===========================

CREATE TABLE visitors (
    visitor_id INT PRIMARY KEY AUTO_INCREMENT,
    visitor_name VARCHAR(100),
    student_name VARCHAR(100),
    room_number VARCHAR(20),
    visit_date DATE,
    mobile VARCHAR(15)
);