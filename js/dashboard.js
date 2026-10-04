/**
 * UNITY HOSTEL MANAGEMENT - RESIDENT DASHBOARD CONTROLLER
 * Full 3D Interactive Client Engine (Zero Dummy Buttons)
 */

(function () {
  'use strict';

  // Global State
  let currentUser = null;
  let currentRoom = null;
  let currentFee = null;
  let allRooms = [];
  let allComplaints = [];
  let allNotices = [];
  let selectedRoomForBooking = null;

  // ==========================================
  // 1. UI HELPERS & TOASTS
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

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(typeof timestamp === 'number' && timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  async function api(url, method = 'GET', body = null) {
    const token = localStorage.getItem('unity_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const opts = { method, headers, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      localStorage.removeItem('unity_token');
      window.location.href = 'login.html';
      throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({ message: 'Server error' }));
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  // ==========================================
  // 2. MODAL CONTROLS
  // ==========================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'grid';
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  }

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.style.display = 'none';
    }
  });

  // ==========================================
  // 3. TAB NAVIGATION & MOBILE SIDEBAR DRAWER
  // ==========================================
  const sidebar = document.getElementById('dashboardSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');

  if (mobileMenuBtn && sidebar && overlay) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
      if (link.getAttribute('data-tab') === tabId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    const targetPane = document.getElementById('tab-' + tabId);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');

    // Trigger tab specific refresh if needed
    if (tabId === 'rooms') loadRooms();
    if (tabId === 'fees') loadFees();
    if (tabId === 'complaints') loadComplaints();
    if (tabId === 'attendance') loadAttendance();
    if (tabId === 'notices') loadNotices();
  }

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // Topbar profile button shortcut
  const topbarProfileBtn = document.getElementById('topbarProfileBtn');
  if (topbarProfileBtn) {
    topbarProfileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('profile');
    });
  }

  // Notification button shortcut
  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', () => {
      switchTab('notices');
    });
  }

  // Quick Action Buttons on Overview Tab
  document.getElementById('qaBookRoom')?.addEventListener('click', () => switchTab('rooms'));
  document.getElementById('qaPayFee')?.addEventListener('click', () => {
    switchTab('fees');
    openModal('feePaymentModal');
  });
  document.getElementById('qaComplaint')?.addEventListener('click', () => {
    switchTab('complaints');
    openModal('complaintModal');
  });
  document.getElementById('qaLeave')?.addEventListener('click', () => {
    switchTab('attendance');
    openModal('leaveModal');
  });
  document.getElementById('bannerBookRoomBtn')?.addEventListener('click', () => switchTab('rooms'));
  document.getElementById('bannerLodgeBtn')?.addEventListener('click', () => openModal('complaintModal'));
  document.getElementById('viewAllNoticesBtn')?.addEventListener('click', () => switchTab('notices'));
  document.getElementById('overviewNewComplaintBtn')?.addEventListener('click', () => openModal('complaintModal'));
  document.getElementById('triggerComplaintModalBtn')?.addEventListener('click', () => openModal('complaintModal'));
  document.getElementById('triggerPayFeeBtn')?.addEventListener('click', () => openModal('feePaymentModal'));
  document.getElementById('triggerLeaveModalBtn')?.addEventListener('click', () => openModal('leaveModal'));

  // ==========================================
  // 4. LOAD CORE DASHBOARD DATA
  // ==========================================
  async function loadDashboard() {
    try {
      const data = await api('/api/dashboard');
      currentUser = data.user;
      currentRoom = data.room;
      currentFee = data.fee;

      // Update Topbar
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const firstName = currentUser.name.split(' ')[0] || 'Resident';
      document.getElementById('topbarGreeting').textContent = `${timeGreeting}, ${firstName}!`;
      document.getElementById('topbarSubtitle').textContent = currentRoom ? `Resident of Room ${currentRoom.room_number}` : 'Room allocation pending';
      document.getElementById('topbarName').textContent = firstName;

      // Update Sidebar Profile
      document.getElementById('sidebarUserName').textContent = currentUser.name;
      document.getElementById('sidebarAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
      document.getElementById('sidebarRoomLabel').textContent = currentRoom ? `Room ${currentRoom.room_number}` : 'No Room Assigned';

      // Update Stat Cards
      document.getElementById('statRoomNumber').textContent = data.stats.room;
      document.getElementById('statRoomType').textContent = data.stats.roomType;
      document.getElementById('statFeeStatus').textContent = data.stats.feeStatus;
      document.getElementById('statFeeStatus').style.color = data.stats.feeStatus === 'Paid' ? 'var(--success)' : 'var(--warning)';
      document.getElementById('statFeeBalance').textContent = `Pending: ₹${data.stats.pendingFee}`;
      document.getElementById('statAttendance').textContent = data.stats.attendance;
      document.getElementById('statAttendanceDays').textContent = `${data.stats.presentDays} of ${data.stats.totalDays} days attended`;
      document.getElementById('statPendingComplaints').textContent = data.stats.pendingComplaints;
      document.getElementById('sidebarComplaintBadge').textContent = data.stats.pendingComplaints;

      // Update Current Room Pill on Rooms Tab
      const currentRoomPill = document.getElementById('currentRoomPill');
      if (currentRoomPill) {
        currentRoomPill.textContent = currentRoom ? `Current: Room ${currentRoom.room_number} (${currentRoom.room_type})` : 'Current: Not Allocated';
      }

      // Update Notice Dot
      const noticeDot = document.getElementById('noticeDot');
      if (noticeDot) {
        noticeDot.style.display = data.notices.length > 0 ? 'block' : 'none';
      }

      // Populate Overview Notices
      renderOverviewNotices(data.notices);

      // Populate Overview Complaints
      renderOverviewComplaints(data.recentComplaints);

      // Populate Profile Form
      populateProfileForm(currentUser);

      // Set Fee Modal Default Amount
      const payAmountInput = document.getElementById('payAmountInput');
      const maxPayableNotice = document.getElementById('maxPayableNotice');
      if (payAmountInput && currentFee) {
        payAmountInput.value = currentFee.pending_amount;
        payAmountInput.max = currentFee.pending_amount;
        if (maxPayableNotice) maxPayableNotice.textContent = `Pending balance: ₹${currentFee.pending_amount}`;
      }

      // Pre-fill Room Number in Complaint Modal if room assigned
      const compRoomInput = document.getElementById('compRoomInput');
      if (compRoomInput && currentRoom) {
        compRoomInput.value = currentRoom.room_number;
      }

    } catch (err) {
      console.error('Dashboard load error:', err);
      showToast('Could not load dashboard data. Please reload.', 'error');
    }
  }

  function renderOverviewNotices(notices) {
    const list = document.getElementById('overviewNoticesList');
    if (!list) return;
    if (!notices || notices.length === 0) {
      list.innerHTML = '<div class="empty-state-box"><p>No notices posted at the moment.</p></div>';
      return;
    }

    list.innerHTML = notices.slice(0, 3).map(n => `
      <div class="notice-card-item ${n.category ? n.category.toLowerCase() : ''}">
        <div class="notice-top">
          <strong>${escapeHtml(n.title)}</strong>
          <span class="badge badge-primary">${escapeHtml(n.category || 'General')}</span>
        </div>
        <p>${escapeHtml(n.description)}</p>
        <small><i class="fa-regular fa-clock"></i> ${formatDate(n.created_at)} &bull; ${escapeHtml(n.author || 'Hostel Admin')}</small>
      </div>
    `).join('');
  }

  function renderOverviewComplaints(complaints) {
    const tbody = document.getElementById('overviewComplaintsTbody');
    if (!tbody) return;
    if (!complaints || complaints.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">No open complaints. Everything looks great!</td></tr>';
      return;
    }

    tbody.innerHTML = complaints.map(c => {
      const isPending = c.status !== 'Resolved';
      const statusClass = c.status === 'Resolved' ? 'badge-success' : c.status === 'In Progress' ? 'badge-info' : 'badge-warning';
      const priorityClass = c.priority === 'Urgent' || c.priority === 'High' ? 'badge-danger' : 'badge-primary';

      return `
        <tr>
          <td><strong>#${c.id}</strong></td>
          <td>${escapeHtml(c.complaint_type)}</td>
          <td>${escapeHtml(c.room_number)}</td>
          <td><span class="badge ${priorityClass}">${escapeHtml(c.priority)}</span></td>
          <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(c.description)}">${escapeHtml(c.description)}</td>
          <td><span class="badge ${statusClass}">${escapeHtml(c.status)}</span></td>
          <td>
            ${isPending ? `<button class="btn btn-outline btn-sm resolve-complaint-btn" data-id="${c.id}"><i class="fa-solid fa-check"></i> Mark Done</button>` : `<span style="color: var(--success); font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> Closed</span>`}
          </td>
        </tr>
      `;
    }).join('');

    attachResolveHandlers();
  }

  // ==========================================
  // 5. ROOMS CATALOG & LIVE BOOKING
  // ==========================================
  async function loadRooms(filter = 'All') {
    const grid = document.getElementById('roomsCatalogGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state-box"><i class="fa-solid fa-spinner fa-spin"></i><p>Fetching room inventory...</p></div>';

    try {
      const url = filter && filter !== 'All' ? `/api/rooms?type=${encodeURIComponent(filter)}` : '/api/rooms';
      const data = await api(url);
      allRooms = data.rooms;

      if (!allRooms || allRooms.length === 0) {
        grid.innerHTML = '<div class="empty-state-box"><p>No rooms match this category filter.</p></div>';
        return;
      }

      grid.innerHTML = allRooms.map(r => {
        const isCurrent = currentRoom && currentRoom.id === r.id;
        const hasBeds = r.available_beds > 0;
        const bedBadgeClass = hasBeds ? 'badge-success' : 'badge-danger';
        const bedBadgeText = hasBeds ? `${r.available_beds} of ${r.total_beds} beds free` : 'Fully Occupied';

        return `
          <div class="room-card-3d ${isCurrent ? 'current-assigned' : ''}" style="${isCurrent ? 'border-color: var(--primary-accent); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.12);' : ''}">
            <div class="room-header">
              <span class="room-number-badge">Room ${escapeHtml(r.room_number)}</span>
              <span class="badge ${bedBadgeClass}">${bedBadgeText}</span>
            </div>
            <div class="room-price">
              ₹${Number(r.monthly_fee).toLocaleString()} <small>/ month</small>
            </div>
            <div class="room-specs">
              <div><i class="fa-solid fa-layer-group" style="color: var(--primary-accent);"></i> ${escapeHtml(r.room_type)}</div>
              <div><i class="fa-solid fa-building" style="color: var(--text-muted);"></i> Floor ${r.floor}</div>
            </div>
            <div class="room-amenities">
              <i class="fa-solid fa-sparkles" style="color: var(--warning); margin-right: 4px;"></i> ${escapeHtml(r.amenities || 'Standard amenities')}
            </div>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 20px; flex: 1;">
              ${escapeHtml(r.description || '')}
            </p>
            ${isCurrent ? `
              <button class="btn btn-secondary btn-block" disabled>
                <i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Your Assigned Room
              </button>
            ` : `
              <button class="btn btn-primary btn-block book-room-trigger" data-id="${r.id}" ${!hasBeds ? 'disabled' : ''}>
                ${hasBeds ? '<i class="fa-solid fa-bed"></i> Book This Room' : 'No Beds Available'}
              </button>
            `}
          </div>
        `;
      }).join('');

      // Attach booking triggers
      document.querySelectorAll('.book-room-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
          const roomId = Number(btn.getAttribute('data-id'));
          const room = allRooms.find(rm => rm.id === roomId);
          if (room) openBookingModal(room);
        });
      });

    } catch (err) {
      console.error('Rooms catalog error:', err);
      grid.innerHTML = '<div class="empty-state-box"><p>Failed to load room inventory.</p></div>';
    }
  }

  // Room Filter Pills
  document.querySelectorAll('#roomFilterBar .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#roomFilterBar .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadRooms(pill.getAttribute('data-filter'));
    });
  });

  function openBookingModal(room) {
    selectedRoomForBooking = room;
    document.getElementById('modalRoomTitle').textContent = `Reserve Bed in Room ${room.room_number}`;
    document.getElementById('modalRoomTypeDisplay').textContent = room.room_type;
    document.getElementById('modalRoomFloorDisplay').textContent = `Floor ${room.floor}`;
    document.getElementById('modalRoomFeeDisplay').textContent = `₹${Number(room.monthly_fee).toLocaleString()} / month`;
    document.getElementById('modalRoomBedsDisplay').textContent = `${room.available_beds} beds available`;
    openModal('roomBookingModal');
  }

  const confirmBookingBtn = document.getElementById('confirmBookingBtn');
  if (confirmBookingBtn) {
    confirmBookingBtn.addEventListener('click', async () => {
      if (!selectedRoomForBooking) return;
      setButtonBusy(confirmBookingBtn, true, 'Reserving Bed...');
      try {
        const res = await api('/api/rooms/book', 'POST', { roomId: selectedRoomForBooking.id });
        showToast(res.message || 'Room booked successfully!', 'success');
        closeModal('roomBookingModal');
        await loadDashboard();
        await loadRooms();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(confirmBookingBtn, false);
      }
    });
  }

  // ==========================================
  // 6. FEES & PAYMENTS
  // ==========================================
  async function loadFees() {
    try {
      const data = await api('/api/fees');
      const fee = data.fee;
      currentFee = fee;

      document.getElementById('feeTotalDisplay').textContent = `₹${fee.total_amount.toLocaleString()}`;
      document.getElementById('feePaidDisplay').textContent = `₹${fee.paid_amount.toLocaleString()}`;
      document.getElementById('feePendingDisplay').textContent = `₹${fee.pending_amount.toLocaleString()}`;
      document.getElementById('feeDueCaption').textContent = `Status: ${fee.status}`;
      document.getElementById('feeDueCaption').style.color = fee.status === 'Paid' ? 'var(--success)' : 'var(--warning)';

      const tbody = document.getElementById('feeTransactionsTbody');
      if (tbody) {
        if (!data.transactions || data.transactions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-dim);">No transactions recorded yet.</td></tr>';
        } else {
          tbody.innerHTML = data.transactions.map(t => `
            <tr>
              <td><code>${escapeHtml(t.transaction_id)}</code></td>
              <td>${formatDate(t.created_at)}</td>
              <td><i class="fa-solid fa-credit-card" style="color: var(--primary-accent); margin-right: 6px;"></i> ${escapeHtml(t.payment_method)}</td>
              <td><strong>₹${Number(t.amount).toLocaleString()}</strong></td>
              <td>${escapeHtml(t.notes || 'Online Clearance')}</td>
              <td><span class="badge badge-success"><i class="fa-solid fa-check"></i> Paid</span></td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Fees error:', err);
      showToast('Unable to load fee ledger.', 'error');
    }
  }

  const feePaymentForm = document.getElementById('feePaymentForm');
  if (feePaymentForm) {
    feePaymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById('payAmountInput').value);
      const paymentMethod = document.getElementById('payMethodSelect').value;
      const btn = document.getElementById('submitPaymentBtn');

      if (!amount || amount <= 0) {
        showToast('Please enter a valid amount to pay.', 'warning');
        return;
      }

      setButtonBusy(btn, true, 'Authorizing Payment...');
      try {
        const res = await api('/api/fees/pay', 'POST', { amount, paymentMethod });
        showToast(res.message || 'Payment processed successfully!', 'success');
        closeModal('feePaymentModal');
        await loadDashboard();
        await loadFees();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

  // ==========================================
  // 7. COMPLAINTS SYSTEM
  // ==========================================
  async function loadComplaints(filter = 'All') {
    const tbody = document.getElementById('complaintsFullTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 24px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading complaints...</td></tr>';

    try {
      const url = filter && filter !== 'All' ? `/api/complaints?status=${encodeURIComponent(filter)}` : '/api/complaints';
      const data = await api(url);
      allComplaints = data.complaints;

      if (!allComplaints || allComplaints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color: var(--text-dim);">No complaints found for this status.</td></tr>';
        return;
      }

      tbody.innerHTML = allComplaints.map(c => {
        const isPending = c.status !== 'Resolved';
        const statusClass = c.status === 'Resolved' ? 'badge-success' : c.status === 'In Progress' ? 'badge-info' : 'badge-warning';
        const priorityClass = c.priority === 'Urgent' || c.priority === 'High' ? 'badge-danger' : 'badge-primary';

        return `
          <tr>
            <td><strong>#${c.id}</strong></td>
            <td>${escapeHtml(c.complaint_type)}</td>
            <td>${escapeHtml(c.room_number)}</td>
            <td><span class="badge ${priorityClass}">${escapeHtml(c.priority)}</span></td>
            <td style="max-width: 280px;">${escapeHtml(c.description)}</td>
            <td><span class="badge ${statusClass}">${escapeHtml(c.status)}</span></td>
            <td>${formatDate(c.created_at)}</td>
            <td>
              ${isPending ? `
                <button class="btn btn-outline btn-sm resolve-complaint-btn" data-id="${c.id}">
                  <i class="fa-solid fa-check"></i> Done
                </button>
              ` : `
                <span style="color: var(--success); font-size: 0.82rem;"><i class="fa-solid fa-circle-check"></i> Closed</span>
              `}
            </td>
          </tr>
        `;
      }).join('');

      attachResolveHandlers();
    } catch (err) {
      console.error('Complaints load error:', err);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--danger);">Failed to load tickets.</td></tr>';
    }
  }

  // Complaint Filter Pills
  document.querySelectorAll('#complaintFilterBar .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#complaintFilterBar .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadComplaints(pill.getAttribute('data-filter'));
    });
  });

  function attachResolveHandlers() {
    document.querySelectorAll('.resolve-complaint-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          const res = await api(`/api/complaints/${id}/resolve`, 'PATCH');
          showToast(res.message || 'Ticket closed successfully.', 'success');
          await loadDashboard();
          await loadComplaints();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  const newComplaintForm = document.getElementById('newComplaintForm');
  if (newComplaintForm) {
    newComplaintForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const complaintType = document.getElementById('compCategorySelect').value;
      const roomNumber = document.getElementById('compRoomInput').value.trim();
      const priority = document.getElementById('compPrioritySelect').value;
      const description = document.getElementById('compDescriptionInput').value.trim();
      const btn = document.getElementById('submitComplaintBtn');

      if (!complaintType || !description) {
        showToast('Please select category and provide issue details.', 'warning');
        return;
      }

      setButtonBusy(btn, true, 'Submitting Ticket...');
      try {
        const res = await api('/api/complaints', 'POST', {
          complaintType,
          roomNumber,
          priority,
          description
        });
        showToast(res.message || 'Complaint submitted successfully!', 'success');
        closeModal('complaintModal');
        newComplaintForm.reset();
        await loadDashboard();
        await loadComplaints();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

  // ==========================================
  // 8. ATTENDANCE & LEAVE PASSES
  // ==========================================
  async function loadAttendance() {
    try {
      const [attData, leaveData] = await Promise.all([
        api('/api/attendance'),
        api('/api/leave')
      ]);

      document.getElementById('attTotalDays').textContent = attData.stats.total;
      document.getElementById('attPresentDays').textContent = attData.stats.present;
      document.getElementById('attAbsentDays').textContent = attData.stats.absent + attData.stats.leave;

      // Render Leave Requests Table
      const leaveTbody = document.getElementById('leaveRequestsTbody');
      if (leaveTbody) {
        if (!leaveData.leaves || leaveData.leaves.length === 0) {
          leaveTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-dim);">No leave passes requested yet.</td></tr>';
        } else {
          leaveTbody.innerHTML = leaveData.leaves.map(l => {
            const statusBadge = l.status === 'Approved' ? 'badge-success' : l.status === 'Rejected' ? 'badge-danger' : 'badge-warning';
            return `
              <tr>
                <td><strong>#LP-${l.id}</strong></td>
                <td><span class="badge badge-primary">${escapeHtml(l.leave_type)}</span></td>
                <td>${escapeHtml(l.start_date)}</td>
                <td>${escapeHtml(l.end_date)}</td>
                <td style="max-width: 250px;">${escapeHtml(l.reason)}</td>
                <td><span class="badge ${statusBadge}">${escapeHtml(l.status)}</span></td>
              </tr>
            `;
          }).join('');
        }
      }

      // Render Daily Attendance Log
      const attTbody = document.getElementById('attendanceLogTbody');
      if (attTbody) {
        if (!attData.records || attData.records.length === 0) {
          attTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 24px;">No biometric logs available.</td></tr>';
        } else {
          attTbody.innerHTML = attData.records.slice(0, 15).map(a => {
            const badgeClass = a.status === 'Present' ? 'badge-success' : a.status === 'Absent' ? 'badge-danger' : 'badge-warning';
            return `
              <tr>
                <td>${escapeHtml(a.date)}</td>
                <td><span class="badge ${badgeClass}">${escapeHtml(a.status)}</span></td>
                <td style="color: var(--text-muted);">${escapeHtml(a.remarks || 'Biometric verified')}</td>
              </tr>
            `;
          }).join('');
        }
      }

    } catch (err) {
      console.error('Attendance error:', err);
      showToast('Failed to load attendance records.', 'error');
    }
  }

  const leavePassForm = document.getElementById('leavePassForm');
  if (leavePassForm) {
    leavePassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const leaveType = document.getElementById('leaveTypeSelect').value;
      const startDate = document.getElementById('leaveStartDate').value;
      const endDate = document.getElementById('leaveEndDate').value;
      const reason = document.getElementById('leaveReason').value.trim();
      const btn = document.getElementById('submitLeaveBtn');

      if (!startDate || !endDate || !reason) {
        showToast('Please specify dates and reason for leave pass.', 'warning');
        return;
      }

      setButtonBusy(btn, true, 'Submitting Pass...');
      try {
        const res = await api('/api/leave', 'POST', { leaveType, startDate, endDate, reason });
        showToast(res.message || 'Leave pass submitted for warden approval.', 'success');
        closeModal('leaveModal');
        leavePassForm.reset();
        await loadAttendance();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

  // ==========================================
  // 9. NOTICE BOARD
  // ==========================================
  async function loadNotices() {
    const container = document.getElementById('fullNoticesContainer');
    if (!container) return;
    container.innerHTML = '<div class="empty-state-box"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading notices...</p></div>';

    try {
      const data = await api('/api/notices');
      allNotices = data.notices;

      if (!allNotices || allNotices.length === 0) {
        container.innerHTML = '<div class="empty-state-box"><p>No announcements right now.</p></div>';
        return;
      }

      container.innerHTML = allNotices.map(n => `
        <div class="card" style="padding: 24px; border-left: 4px solid var(--primary-accent); margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <h4 style="font-size: 1.15rem; color: var(--text-main);">${escapeHtml(n.title)}</h4>
            <span class="badge badge-primary">${escapeHtml(n.category || 'General')}</span>
          </div>
          <p style="color: var(--text-body); font-size: 0.95rem; line-height: 1.6; margin-bottom: 14px;">${escapeHtml(n.description)}</p>
          <div style="display: flex; gap: 16px; font-size: 0.8rem; color: var(--text-muted);">
            <span><i class="fa-regular fa-clock"></i> ${formatDate(n.created_at)}</span>
            <span><i class="fa-solid fa-user-shield"></i> Posted by: ${escapeHtml(n.author || 'Hostel Administration')}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Notices load error:', err);
      container.innerHTML = '<div class="empty-state-box"><p>Failed to retrieve notice board.</p></div>';
    }
  }

  // ==========================================
  // 10. PROFILE SETTINGS
  // ==========================================
  function populateProfileForm(user) {
    if (!user) return;
    const nameInput = document.getElementById('profFullName');
    const emailInput = document.getElementById('profEmail');
    const phoneInput = document.getElementById('profPhone');
    const emergencyInput = document.getElementById('profEmergencyContact');
    const collegeInput = document.getElementById('profCollege');
    const semInput = document.getElementById('profSemester');
    const courseInput = document.getElementById('profCourse');

    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (emergencyInput) emergencyInput.value = user.emergencyContact || '';
    if (collegeInput) collegeInput.value = user.college || '';
    if (semInput) semInput.value = user.semester || 1;
    if (courseInput) courseInput.value = user.course || '';
  }

  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profFullName').value.trim();
      const phone = document.getElementById('profPhone').value.trim();
      const emergencyContact = document.getElementById('profEmergencyContact').value.trim();
      const college = document.getElementById('profCollege').value.trim();
      const semester = Number(document.getElementById('profSemester').value);
      const course = document.getElementById('profCourse').value.trim();
      const btn = document.getElementById('saveProfileBtn');

      if (!name) {
        showToast('Name cannot be empty.', 'warning');
        return;
      }

      setButtonBusy(btn, true, 'Saving Updates...');
      try {
        const res = await api('/api/auth/profile', 'PUT', {
          name, phone, emergencyContact, college, semester, course
        });
        showToast(res.message || 'Profile saved successfully!', 'success');
        await loadDashboard();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

  // ==========================================
  // 11. SIGN OUT
  // ==========================================
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', 'POST');
      } catch (_) {}
      localStorage.removeItem('unity_token');
      sessionStorage.clear();
      showToast('Signed out. Redirecting...', 'info');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 500);
    });
  }

  // Initialize
  loadDashboard();

})();
