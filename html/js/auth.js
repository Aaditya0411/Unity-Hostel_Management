/**
 * UNITY HOSTEL MANAGEMENT - AUTHENTICATION & RECOVERY CONTROLLER
 * Handles Login, Register, Real Email OTP, Resend Cooldown, Forgot & Reset Password
 */

(function () {
  'use strict';

  // ==========================================
  // 1. UI HELPERS: TOASTS & ALERTS
  // ==========================================
  const toastContainer = document.getElementById('toastContainer');

  function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'circle-check' : type === 'error' ? 'circle-xmark' : 'circle-info';
    toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('alertBox');
    const alertMsg = document.getElementById('alertMessage');
    if (!alertBox || !alertMsg) return;

    alertBox.className = `alert-box ${type}`;
    alertMsg.textContent = message;
    alertBox.style.display = 'flex';
  }

  function hideAlert() {
    const alertBox = document.getElementById('alertBox');
    if (alertBox) alertBox.style.display = 'none';
  }

  function setButtonBusy(btn, isBusy, busyText = 'Processing...') {
    if (!btn) return;
    const textSpan = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');
    btn.disabled = isBusy;
    if (textSpan) {
      if (isBusy) {
        btn.dataset.originalText = textSpan.textContent;
        textSpan.textContent = busyText;
      } else if (btn.dataset.originalText) {
        textSpan.textContent = btn.dataset.originalText;
      }
    }
    if (spinner) spinner.style.display = isBusy ? 'inline-block' : 'none';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function apiRequest(url, method = 'POST', body = null) {
    const token = localStorage.getItem('unity_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      method,
      headers,
      credentials: 'include'
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({ message: 'Unexpected server response.' }));
    if (!response.ok) {
      const err = new Error(data.message || `Server error (${response.status})`);
      err.data = data;
      err.status = response.status;
      throw err;
    }
    if (data.token) {
      localStorage.setItem('unity_token', data.token);
    }
    if (data.devOtp) {
      sessionStorage.setItem('lastDevOtp', data.devOtp);
    }
    return data;
  }

  // Check if user is already logged in on login page
  async function checkExistingSession() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('switch') || urlParams.has('logout')) {
      localStorage.removeItem('unity_token');
      sessionStorage.clear();
      return;
    }
    // Only check on login.html, DO NOT check on register.html
    if (path.includes('login.html')) {
      try {
        const token = localStorage.getItem('unity_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/auth/me', { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            showAlert(`You are already signed in as ${data.user.name} (${data.user.email}). Redirecting to your dashboard...`, 'info');
            setTimeout(() => {
              window.location.href = 'dashboard.html';
            }, 1200);
          }
        }
      } catch (_) {}
    }
  }
  checkExistingSession();

  // ==========================================
  // 2. PASSWORD TOGGLES & STRENGTH METER
  // ==========================================
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = btn.querySelector('i');
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
      } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye';
      }
    });
  });

  function calculatePasswordStrength(pwd) {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score; // 0 to 4
  }

  function updateStrengthMeter(password, segPrefix = 'strSeg', labelId = 'strengthText') {
    const score = calculatePasswordStrength(password);
    const seg1 = document.getElementById(segPrefix + '1');
    const seg2 = document.getElementById(segPrefix + '2');
    const seg3 = document.getElementById(segPrefix + '3');
    const seg4 = document.getElementById(segPrefix + '4');
    const label = document.getElementById(labelId);

    if (!seg1 || !label) return;

    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
    const texts = ['Weak', 'Fair', 'Good', 'Strong'];
    const activeColor = score > 0 ? colors[score - 1] : '#ef4444';

    [seg1, seg2, seg3, seg4].forEach((seg, idx) => {
      if (idx < score) {
        seg.style.backgroundColor = activeColor;
      } else {
        seg.style.backgroundColor = 'transparent';
      }
    });

    label.textContent = `Password strength: ${password.length === 0 ? 'None' : texts[score - 1] || 'Weak'}`;
    label.style.color = score > 0 ? activeColor : 'var(--text-dim)';
  }

  const regPwdInput = document.getElementById('regPassword');
  if (regPwdInput) {
    regPwdInput.addEventListener('input', (e) => updateStrengthMeter(e.target.value));
  }

  const resetPwdInput = document.getElementById('resetNewPassword');
  if (resetPwdInput) {
    resetPwdInput.addEventListener('input', (e) => updateStrengthMeter(e.target.value));
  }

  // ==========================================
  // 3. 6-BOX OTP COMPONENT CONTROLLER
  // ==========================================
  function setupOtpBoxes(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const boxes = Array.from(container.querySelectorAll('.otp-box'));

    boxes.forEach((box, index) => {
      // Input event -> auto advance
      box.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (raw.length > 0) {
          box.value = raw.slice(-1); // latest entered digit
          box.classList.add('filled');
          if (index < boxes.length - 1) {
            boxes[index + 1].focus();
            boxes[index + 1].select();
          }
        } else {
          box.value = '';
          box.classList.remove('filled');
        }
      });

      // Keydown event -> backspace navigates back
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (!box.value && index > 0) {
            boxes[index - 1].focus();
            boxes[index - 1].value = '';
            boxes[index - 1].classList.remove('filled');
          } else {
            box.value = '';
            box.classList.remove('filled');
          }
        } else if (e.key === 'ArrowLeft' && index > 0) {
          boxes[index - 1].focus();
        } else if (e.key === 'ArrowRight' && index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      });

      // Focus event -> auto-select
      box.addEventListener('focus', () => {
        box.select();
      });

      // Paste event -> distribute all 6 digits
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
        const digits = pasteData.replace(/\D/g, '').slice(0, 6).split('');

        if (digits.length > 0) {
          digits.forEach((digit, i) => {
            if (boxes[i]) {
              boxes[i].value = digit;
              boxes[i].classList.add('filled');
            }
          });
          const nextIndex = Math.min(digits.length, boxes.length - 1);
          boxes[nextIndex].focus();
        }
      });
    });
  }

  setupOtpBoxes('otpBoxContainer');
  setupOtpBoxes('resetOtpBoxContainer');

  function getOtpValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return '';
    const boxes = container.querySelectorAll('.otp-box');
    return Array.from(boxes).map(b => b.value.trim()).join('');
  }

  // ==========================================
  // 4. SIGNUP / REGISTRATION FLOW
  // ==========================================
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim().toLowerCase();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;
      const btn = document.getElementById('registerBtn');

      if (name.length < 2) {
        showAlert('Please enter your full name (at least 2 characters).');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('Please provide a valid email address.');
        return;
      }
      if (password.length < 8) {
        showAlert('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        showAlert('Passwords do not match. Please re-enter.');
        return;
      }

      setButtonBusy(btn, true, 'Creating Account & OTP...');
      try {
        const res = await apiRequest('/api/auth/register', 'POST', { name, email, password, confirmPassword });
        sessionStorage.setItem('pendingVerifyEmail', email);
        localStorage.setItem('registeredEmail', email);
        if (res.devOtp) sessionStorage.setItem('lastDevOtp', res.devOtp);

        showAlert('✅ Account created successfully! A 6-digit OTP code has been generated. Redirecting to verification page...', 'success');
        showToast(res.message || 'Account created! Redirecting to email verification...', 'success');
        setButtonBusy(btn, true, 'Redirecting...');

        const devParam = res.devOtp ? `&code=${encodeURIComponent(res.devOtp)}` : '';
        setTimeout(() => {
          window.location.href = `verify.html?email=${encodeURIComponent(email)}${devParam}`;
        }, 1200);
      } catch (err) {
        setButtonBusy(btn, false);
        showAlert(`❌ ${err.message || 'Registration failed. Please check your inputs.'}`);
        showToast(err.message || 'Registration error', 'error');
      }
    });
  }

  // ==========================================
  // 5. EMAIL OTP VERIFICATION FLOW
  // ==========================================
  const verifyForm = document.getElementById('verifyForm');
  if (verifyForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email') || sessionStorage.getItem('pendingVerifyEmail') || localStorage.getItem('registeredEmail') || '';
    const codeParam = urlParams.get('code') || sessionStorage.getItem('lastDevOtp') || '';
    const emailDisplay = document.getElementById('verifyEmailDisplay');
    const emailInput = document.getElementById('verifyEmailInput');
    if (emailInput && emailParam) {
      emailInput.value = emailParam;
    }
    if (emailDisplay && emailParam) {
      emailDisplay.textContent = emailParam;
    }

    // Dev OTP Helper
    const devOtpCallout = document.getElementById('devOtpCallout');
    const devOtpCodeValue = document.getElementById('devOtpCodeValue');
    const fillDevOtpLink = document.getElementById('fillDevOtpLink');

    function displayDevOtp(code) {
      if (!code) return;
      sessionStorage.setItem('lastDevOtp', code);
      if (devOtpCodeValue) devOtpCodeValue.textContent = code;
      if (devOtpCallout) devOtpCallout.style.display = 'block';
    }

    if (codeParam) {
      displayDevOtp(codeParam);
    }

    if (fillDevOtpLink) {
      fillDevOtpLink.addEventListener('click', (e) => {
        e.preventDefault();
        const activeCode = devOtpCodeValue ? devOtpCodeValue.textContent.trim() : (sessionStorage.getItem('lastDevOtp') || '');
        if (activeCode && activeCode.length === 6 && activeCode !== '------') {
          const boxes = document.querySelectorAll('#otpBoxContainer .otp-box');
          activeCode.split('').forEach((d, i) => {
            if (boxes[i]) {
              boxes[i].value = d;
              boxes[i].classList.add('filled');
            }
          });
          showAlert('Dev code filled! Verifying now...', 'info');
          // Automatically trigger verify submit
          setTimeout(() => {
            verifyForm.dispatchEvent(new Event('submit', { cancelable: true }));
          }, 400);
        }
      });
    }

    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = emailInput ? emailInput.value.trim().toLowerCase() : (emailParam || '');
      const otp = getOtpValue('otpBoxContainer');
      const btn = document.getElementById('verifyBtn');

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('Please provide your registered email address.');
        return;
      }
      if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showAlert('Please enter the complete 6-digit verification code.');
        return;
      }

      setButtonBusy(btn, true, 'Verifying Code...');
      try {
        const res = await apiRequest('/api/auth/verify', 'POST', { email, otp });
        sessionStorage.removeItem('pendingVerifyEmail');
        sessionStorage.removeItem('lastDevOtp');
        if (res.token) localStorage.setItem('unity_token', res.token);

        showAlert('✅ Email verified successfully! Loading your personal resident dashboard...', 'success');
        showToast(res.message || 'Email verified successfully! Redirecting to your dashboard...', 'success');
        setButtonBusy(btn, true, 'Loading Dashboard...');

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 900);
      } catch (err) {
        setButtonBusy(btn, false);
        showAlert(`❌ ${err.message || 'Invalid or expired OTP code. Please try again.'}`);
        showToast(err.message, 'error');
      }
    });

    // Resend OTP with 60s cooldown
    const resendBtn = document.getElementById('resendOtpBtn');
    const cooldownTimer = document.getElementById('cooldownTimer');

    function startCooldown(seconds = 60) {
      if (!resendBtn || !cooldownTimer) return;
      resendBtn.disabled = true;
      cooldownTimer.style.display = 'inline-flex';
      let remaining = seconds;
      cooldownTimer.textContent = `⏱ ${remaining}s`;

      const interval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(interval);
          resendBtn.disabled = false;
          cooldownTimer.style.display = 'none';
        } else {
          cooldownTimer.textContent = `⏱ ${remaining}s`;
        }
      }, 1000);
    }

    if (resendBtn) {
      resendBtn.addEventListener('click', async () => {
        const email = emailInput ? emailInput.value.trim().toLowerCase() : (emailParam || '');
        if (!email) {
          showAlert('Please enter your registered email address to resend the code.');
          return;
        }
        resendBtn.disabled = true;
        try {
          const res = await apiRequest('/api/auth/resend', 'POST', { email });
          showToast(res.message || 'Fresh 6-digit code sent!', 'success');
          showAlert(res.message || 'A fresh 6-digit verification code has been dispatched.', 'info');
          if (res.devOtp) {
            displayDevOtp(res.devOtp);
          }
          startCooldown(60);
        } catch (err) {
          showToast(err.message, 'error');
          showAlert(err.message);
          resendBtn.disabled = false;
        }
      });
    }
  }

  // ==========================================
  // 6. LOGIN FLOW & DEMO FILLER
  // ==========================================
  const fillDemoBtn = document.getElementById('fillDemoBtn');
  if (fillDemoBtn) {
    fillDemoBtn.addEventListener('click', () => {
      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPassword');
      if (emailInput && passInput) {
        emailInput.value = 'priya@hostel.com';
        passInput.value = 'Hostel@2026';
        showAlert('Demo resident credentials loaded! Click "Sign In" to enter dashboard.', 'info');
        emailInput.focus();
      }
    });
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value;
      const btn = document.getElementById('loginBtn');

      if (!email || !password) {
        showAlert('Please enter both email and password.');
        return;
      }

      setButtonBusy(btn, true, 'Signing In...');
      try {
        const res = await apiRequest('/api/auth/login', 'POST', { email, password });
        if (res.token) {
          localStorage.setItem('unity_token', res.token);
        }
        showAlert('✅ Signed in successfully! Welcome back. Redirecting to dashboard...', 'success');
        showToast(res.message || 'Signed in! Redirecting...', 'success');
        setButtonBusy(btn, true, 'Redirecting to Dashboard...');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
      } catch (err) {
        setButtonBusy(btn, false);
        if (err.data && err.data.requiresVerification) {
          sessionStorage.setItem('pendingVerifyEmail', err.data.email);
          localStorage.setItem('registeredEmail', err.data.email);
          if (err.data.devOtp) sessionStorage.setItem('lastDevOtp', err.data.devOtp);
          showAlert('⚠️ Your email is not verified yet. Redirecting to OTP verification...', 'warning');
          showToast('Email not verified. Redirecting to verification...', 'warning');
          const devParam = err.data.devOtp ? `&code=${encodeURIComponent(err.data.devOtp)}` : '';
          setTimeout(() => {
            window.location.href = `verify.html?email=${encodeURIComponent(err.data.email)}${devParam}`;
          }, 1200);
        } else {
          showAlert(`❌ ${err.message || 'Invalid email address or password.'}`);
          showToast(err.message || 'Login failed', 'error');
        }
      }
    });
  }

  // ==========================================
  // 7. FORGOT PASSWORD FLOW
  // ==========================================
  const forgotForm = document.getElementById('forgotForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
      const btn = document.getElementById('forgotBtn');

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('Please enter a valid email address.');
        return;
      }

      setButtonBusy(btn, true, 'Sending Code...');
      try {
        const res = await apiRequest('/api/auth/forgot-password', 'POST', { email });
        sessionStorage.setItem('resetEmail', email);
        showToast(res.message || 'Reset code sent! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = `reset-password.html?email=${encodeURIComponent(email)}`;
        }, 1200);
      } catch (err) {
        showAlert(err.message);
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

  // ==========================================
  // 8. RESET PASSWORD FLOW
  // ==========================================
  const resetForm = document.getElementById('resetForm');
  if (resetForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email') || sessionStorage.getItem('resetEmail') || '';
    const resetEmailInput = document.getElementById('resetEmail');
    if (resetEmailInput && emailParam) {
      resetEmailInput.value = emailParam;
    }

    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const email = resetEmailInput ? resetEmailInput.value.trim().toLowerCase() : emailParam;
      const otp = getOtpValue('resetOtpBoxContainer');
      const password = document.getElementById('resetNewPassword').value;
      const confirmPassword = document.getElementById('resetConfirmPassword').value;
      const btn = document.getElementById('resetBtn');

      if (!email) {
        showAlert('Please provide your registered email address.');
        return;
      }
      if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showAlert('Please enter the 6-digit reset code from your email.');
        return;
      }
      if (password.length < 8) {
        showAlert('New password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        showAlert('Passwords do not match.');
        return;
      }

      setButtonBusy(btn, true, 'Updating Password...');
      try {
        const res = await apiRequest('/api/auth/reset-password', 'POST', {
          email,
          otp,
          password,
          confirmPassword
        });
        sessionStorage.removeItem('resetEmail');
        showToast(res.message || 'Password reset successfully! Redirecting to login...', 'success');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1200);
      } catch (err) {
        showAlert(err.message);
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

})();
