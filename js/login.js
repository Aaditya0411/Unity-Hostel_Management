// =======================================
// Hostel Management System
// Login JavaScript
// =======================================

// Page Loaded

window.onload = function () {

    console.log("Login Page Loaded");

};

// =======================================
// Login Form

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", function (event) {

        event.preventDefault();

        // Get Input Values

        const email = document.getElementById("email").value.trim();

        const password = document.getElementById("password").value.trim();

        // Validation

        if (email === "" || password === "") {

            alert("Please fill all fields.");

            return;

        }

        // Demo Login

        if (email === "student@gmail.com" && password === "123456") {

            alert("Login Successful!");

            window.location.href = "dashboard.html";

        }

        else {

            alert("Invalid Email or Password!");

        }

    });

}

// =======================================
// Password Length Check

const passwordInput = document.getElementById("password");

if (passwordInput) {

    passwordInput.addEventListener("keyup", function () {

        if (this.value.length < 6) {

            this.style.border = "2px solid red";

        }

        else {

            this.style.border = "2px solid green";

        }

    });

}

// =======================================
// Email Validation

const emailInput = document.getElementById("email");

if (emailInput) {

    emailInput.addEventListener("blur", function () {

        if (!this.value.includes("@")) {

            alert("Please enter a valid email address.");

        }

    });

}

// =======================================
// Show Welcome Message

setTimeout(function () {

    console.log("Welcome to Hostel Management System");

}, 1000);

// =======================================
// Login Button Click

const loginButton = document.querySelector(".btn");

if (loginButton) {

    loginButton.addEventListener("click", function () {

        console.log("Login Button Clicked");

    });

}