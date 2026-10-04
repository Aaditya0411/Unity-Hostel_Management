/**
 * UNITY HOSTEL MANAGEMENT SYSTEM - MAIN CLIENT SCRIPT
 * Professional SaaS UI: Mobile Navigation, Live Room Feeds, and Inquiry Submission
 */

(function () {
  'use strict';

  // Mobile Navigation Drawer Toggle
  const navToggleBtn = document.getElementById('navToggleBtn');
  const navMenu = document.getElementById('navMenu');

  if (navToggleBtn && navMenu) {
    navToggleBtn.addEventListener('click', () => {
      navMenu.classList.toggle('open');
      const icon = navToggleBtn.querySelector('i');
      if (icon) {
        if (navMenu.classList.contains('open')) {
          icon.className = 'fa-solid fa-xmark';
        } else {
          icon.className = 'fa-solid fa-bars';
        }
      }
    });

    // Close on navigation link click
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        const icon = navToggleBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-bars';
      });
    });
  }

  // Check Active Session for Public Navigation Bar
  async function updateNavAuthState() {
    try {
      const token = localStorage.getItem('unity_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/auth/me', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const navCta = document.getElementById('navCtaArea');
        if (navCta) {
          navCta.innerHTML = `
            <a href="dashboard.html" class="btn btn-primary btn-sm">
              <i class="fa-solid fa-gauge-high"></i> Dashboard (${data.user.name.split(' ')[0]})
            </a>
          `;
        }
      }
    } catch (_) {}
  }
  updateNavAuthState();

  // Home Page Live Rooms Feed
  const homeRoomsGrid = document.getElementById('homeRoomsGrid');
  if (homeRoomsGrid) {
    (async function loadHomeRooms() {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        const rooms = (data.rooms || []).slice(0, 3);

        if (rooms.length === 0) {
          homeRoomsGrid.innerHTML = '<div class="empty-state-box"><p>No rooms available right now.</p></div>';
          return;
        }

        homeRoomsGrid.innerHTML = rooms.map(r => `
          <div class="room-card-3d card-3d">
            <div class="room-header">
              <span class="room-number-badge">Room ${r.room_number}</span>
              <span class="badge ${r.available_beds > 0 ? 'badge-success' : 'badge-danger'}">
                ${r.available_beds > 0 ? `${r.available_beds} beds free` : 'Occupied'}
              </span>
            </div>
            <div class="room-price">₹${Number(r.monthly_fee).toLocaleString()} <small>/ month</small></div>
            <div class="room-specs">
              <div><i class="fa-solid fa-layer-group"></i> ${r.room_type}</div>
              <div><i class="fa-solid fa-building"></i> Floor ${r.floor}</div>
            </div>
            <div class="room-amenities">
              <i class="fa-solid fa-check"></i> ${r.amenities || 'Standard Amenities'}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px; flex: 1;">${r.description || ''}</p>
            <a href="rooms.html" class="btn btn-primary btn-block">
              <i class="fa-solid fa-bed"></i> Book Bed
            </a>
          </div>
        `).join('');
      } catch (err) {
        homeRoomsGrid.innerHTML = '<div class="empty-state-box"><p>Failed to load preview rooms.</p></div>';
      }
    })();
  }

  // Quick Inquiry Form on Index Page
  const quickContactForm = document.getElementById('quickContactForm');
  if (quickContactForm) {
    quickContactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('qcName').value.trim();
      const email = document.getElementById('qcEmail').value.trim();
      const phone = document.getElementById('qcPhone').value.trim();
      const subject = document.getElementById('qcSubject').value.trim();
      const message = document.getElementById('qcMessage').value.trim();
      const btn = document.getElementById('qcSubmitBtn');

      if (!name || !email || !subject || !message) {
        alert('Please fill out all fields.');
        return;
      }

      btn.disabled = true;
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, subject, message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        alert(data.message || 'Inquiry submitted successfully! We will get in touch soon.');
        quickContactForm.reset();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

})();