// =========================================
// CampusEvents — Dashboard Logic
// =========================================
const API = '';
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');
let allClubs = [];
let allEvents = [];

// Auth guard
if (!token) { window.location.href = '/'; }

// =========================================
// Initialize
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    setupNavigation();
    setupSidebar();
    loadClubs().then(() => { loadEvents(); });
    if (user.role === 'faculty') { loadApprovals(); loadCoordinatorRequests(); }
    if (user.role === 'coordinator') { loadMyRequests(); }
    setupEventForm();
    setupModals();
});

// =========================================
// Setup UI based on role
// =========================================
function setupUI() {
    const el = (id) => document.getElementById(id);
    el('userName').textContent = user.name || 'User';
    el('userRole').textContent = user.role || 'Role';
    el('userAvatar').textContent = (user.name || 'U')[0].toUpperCase();
    el('mobileUser').textContent = (user.name || 'U')[0].toUpperCase();

    // Show/hide nav items based on role
    if (user.role === 'faculty' || (user.role === 'coordinator' && user.verified)) {
        el('navCreateEvent').style.display = '';
    }
    if (user.role === 'faculty') {
        el('navApprovals').style.display = '';
        el('navCoordinators').style.display = '';
        el('addClubBtn').style.display = '';
    }
    if (user.role === 'coordinator') {
        el('navMyRequests').style.display = '';
    }

    // Logout
    el('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    });
}

// =========================================
// Navigation
// =========================================
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            if (!section) return;
            switchSection(section);
        });
    });
}

function switchSection(sectionName) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

    const navItem = document.querySelector(`[data-section="${sectionName}"]`);
    if (navItem) navItem.classList.add('active');

    const sectionId = 'section' + sectionName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');

    // Refresh data
    if (sectionName === 'events') loadEvents();
    if (sectionName === 'approvals') loadApprovals();
    if (sectionName === 'coordinators') loadCoordinatorRequests();
    if (sectionName === 'clubs') loadClubs();
    if (sectionName === 'my-requests') loadMyRequests();
}

// =========================================
// Mobile Sidebar
// =========================================
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    document.getElementById('hamburger').addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    });
    document.getElementById('sidebarClose').addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
}

// =========================================
// Toast
// =========================================
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const ic = toast.querySelector('i');
    document.getElementById('toastMessage').textContent = msg;
    toast.className = 'toast show ' + type;
    ic.className = type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// =========================================
// API Helper
// =========================================
async function api(url, opts = {}) {
    const res = await fetch(API + url, {
        ...opts,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(opts.headers || {}) }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// =========================================
// Load Clubs
// =========================================
async function loadClubs() {
    try {
        allClubs = await api('/api/clubs');
        renderClubs();
        populateClubFilters();
    } catch (e) { console.error(e); }
}

async function populateClubFilters() {
    const eventFilter = document.getElementById('eventFilter');
    const eventClub = document.getElementById('eventClub');
    const verifyClub = document.getElementById('verifyClubSelect');

    // Event filter
    eventFilter.innerHTML = '<option value="all">All Clubs</option>';
    allClubs.forEach(c => {
        eventFilter.innerHTML += `<option value="${c.id}">${c.club_name}</option>`;
    });

    // Event form club select — coordinators only see their approved clubs
    eventClub.innerHTML = '<option value="" disabled selected>Select Club</option>';
    if (user.role === 'coordinator') {
        try {
            const myClubs = await api('/api/coordinators/my-clubs');
            myClubs.forEach(c => {
                eventClub.innerHTML += `<option value="${c.id}">${c.club_name}</option>`;
            });
        } catch (e) { console.error(e); }
    } else {
        allClubs.forEach(c => {
            eventClub.innerHTML += `<option value="${c.id}">${c.club_name}</option>`;
        });
    }

    // Verify club select
    if (verifyClub) {
        verifyClub.innerHTML = '<option value="" disabled selected>Choose a club</option>';
        allClubs.forEach(c => {
            verifyClub.innerHTML += `<option value="${c.id}">${c.club_name}</option>`;
        });
    }
}

const clubIcons = ['fa-rocket', 'fa-google', 'fa-cogs', 'fa-chart-line', 'fa-camera', 'fa-hand-holding-heart', 'fa-globe', 'fa-shield-alt', 'fa-spa', 'fa-masks-theater', 'fa-heart-pulse', 'fa-lightbulb', 'fa-person-running', 'fa-flag', 'fa-shirt', 'fa-coins', 'fa-palette', 'fa-utensils', 'fa-leaf', 'fa-newspaper', 'fa-music', 'fa-medal', 'fa-language', 'fa-om', 'fa-guitar', 'fa-people-arrows', 'fa-star'];

function renderClubs() {
    const grid = document.getElementById('clubsGrid');
    grid.innerHTML = allClubs.map((c, i) => `
    <div class="club-card">
      <div class="club-card-header">
        <div class="club-icon"><i class="fas ${clubIcons[i % clubIcons.length]}"></i></div>
        <div class="club-card-name">${esc(c.club_name)}</div>
      </div>
      <div class="club-card-desc">${esc(c.description || 'No description')}</div>
      <div class="club-card-faculty"><i class="fas fa-user-tie"></i> ${esc(c.faculty_name || 'N/A')}</div>
      ${user.role === 'faculty' ? `
        <div class="club-card-actions">
          <button class="btn-edit" onclick="editClub(${c.id})"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn-delete" onclick="deleteClub(${c.id})"><i class="fas fa-trash"></i> Delete</button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// =========================================
// Load Events
// =========================================
async function loadEvents() {
    try {
        allEvents = await api('/api/events');
        renderEvents(allEvents);
    } catch (e) { console.error(e); }
}

function renderEvents(events) {
    const grid = document.getElementById('eventsGrid');
    const empty = document.getElementById('eventsEmpty');

    if (events.length === 0) {
        grid.innerHTML = '';
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    grid.innerHTML = events.map(ev => `
    <div class="event-card" onclick="openEventModal(${ev.id})">
      <div class="event-card-header">
        <div class="event-card-title">${esc(ev.event_name)}</div>
        <span class="event-status status-${ev.status}">${ev.status}</span>
      </div>
      <div class="event-card-desc">${esc(ev.description || 'No description provided.')}</div>
      <div class="event-card-meta">
        <div class="meta-item"><i class="fas fa-calendar"></i>${formatDate(ev.date)}</div>
        <div class="meta-item"><i class="fas fa-clock"></i>${formatTime(ev.time)} — ${formatTime(ev.end_time)}</div>
        <div class="meta-item"><i class="fas fa-map-marker-alt"></i>${esc(ev.location)}</div>
      </div>
      <div class="event-card-footer">
        <span class="club-tag"><i class="fas fa-users"></i>${esc(ev.club_name || 'Unknown')}</span>
        <span class="card-arrow"><i class="fas fa-arrow-right"></i></span>
      </div>
    </div>
  `).join('');
}

// Event search & filter
document.getElementById('eventSearch').addEventListener('input', filterEvents);
document.getElementById('eventFilter').addEventListener('change', filterEvents);

function filterEvents() {
    const q = document.getElementById('eventSearch').value.toLowerCase();
    const clubId = document.getElementById('eventFilter').value;
    let filtered = allEvents.filter(ev => {
        const matchSearch = ev.event_name.toLowerCase().includes(q) || (ev.description || '').toLowerCase().includes(q) || (ev.location || '').toLowerCase().includes(q);
        const matchClub = clubId === 'all' || ev.club_id == clubId;
        return matchSearch && matchClub;
    });
    renderEvents(filtered);
}

// =========================================
// Event Modal
// =========================================
async function openEventModal(id) {
    try {
        const ev = await api('/api/events/' + id);
        document.getElementById('modalTitle').textContent = ev.event_name;
        document.getElementById('modalClub').textContent = ev.club_name || 'Unknown';
        document.getElementById('modalCreator').textContent = ev.creator_name || 'Unknown';
        document.getElementById('modalDate').textContent = formatDate(ev.date);
        document.getElementById('modalTime').textContent = formatTime(ev.time) + ' — ' + formatTime(ev.end_time);
        document.getElementById('modalLocation').textContent = ev.location;

        // Show vacate warning if back-to-back
        const existingWarning = document.getElementById('vacateWarning');
        if (existingWarning) existingWarning.remove();
        if (ev.vacate_warning) {
            const warningDiv = document.createElement('div');
            warningDiv.id = 'vacateWarning';
            warningDiv.style.cssText = 'margin-top:14px;padding:12px 16px;background:rgba(253,203,110,0.12);border:1px solid rgba(253,203,110,0.3);border-radius:10px;color:#fdcb6e;font-size:13px;line-height:1.5;display:flex;align-items:flex-start;gap:8px';
            warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-top:2px;flex-shrink:0"></i><span>' + esc(ev.vacate_warning) + '</span>';
            document.querySelector('.modal-description').after(warningDiv);
        }
        document.getElementById('modalDescription').textContent = ev.description || 'No description provided.';

        const badge = document.getElementById('modalStatus');
        badge.textContent = ev.status;
        badge.className = 'modal-badge status-' + ev.status;

        // Actions
        const actions = document.getElementById('modalActions');
        actions.innerHTML = '';
        if (user.role === 'faculty') {
            if (ev.status !== 'cancelled') {
                actions.innerHTML += `<button class="btn-reject" onclick="cancelEvent(${ev.id})"><i class="fas fa-ban"></i> Cancel Event</button>`;
            }
            actions.innerHTML += `<button class="btn-edit" onclick="editEvent(${ev.id})"><i class="fas fa-pen"></i> Edit</button>`;
        }
        if (user.role === 'coordinator' && ev.created_by === user.id) {
            actions.innerHTML += `<button class="btn-edit" onclick="editEvent(${ev.id})"><i class="fas fa-pen"></i> Edit</button>`;
        }

        document.getElementById('eventModal').classList.add('active');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

window.openEventModal = openEventModal;

// =========================================
// Event Form (Create / Edit)
// =========================================
let editingEvent = null;

function setupEventForm() {
    document.getElementById('eventForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            event_name: document.getElementById('eventName').value.trim(),
            description: document.getElementById('eventDescription').value.trim(),
            date: document.getElementById('eventDate').value,
            time: document.getElementById('eventTime').value,
            end_time: document.getElementById('eventEndTime').value,
            location: document.getElementById('eventLocation').value,
            club_id: document.getElementById('eventClub').value
        };

        try {
            if (editingEvent) {
                await api('/api/events/' + editingEvent, { method: 'PUT', body: JSON.stringify(data) });
                showToast('Event updated!', 'success');
            } else {
                const result = await api('/api/events', { method: 'POST', body: JSON.stringify(data) });
                showToast('Event created!', 'success');
                if (result.warning) {
                    setTimeout(() => showToast(result.warning, 'info'), 1500);
                }
            }
            resetEventForm();
            switchSection('events');
        } catch (e) {
            showToast(e.message, 'error');
        }
    });

    document.getElementById('cancelEventBtn').addEventListener('click', () => {
        resetEventForm();
        switchSection('events');
    });
}

function resetEventForm() {
    editingEvent = null;
    document.getElementById('eventForm').reset();
    document.getElementById('editEventId').value = '';
    document.getElementById('eventFormTitle').textContent = 'Create Event';
    document.getElementById('submitEventBtn').querySelector('span').textContent = 'Create Event';
}

window.editEvent = async function (id) {
    try {
        const ev = await api('/api/events/' + id);
        document.getElementById('eventModal').classList.remove('active');
        editingEvent = id;
        document.getElementById('eventFormTitle').textContent = 'Edit Event';
        document.getElementById('submitEventBtn').querySelector('span').textContent = 'Update Event';
        document.getElementById('eventName').value = ev.event_name;
        document.getElementById('eventDescription').value = ev.description || '';
        document.getElementById('eventDate').value = ev.date;
        document.getElementById('eventTime').value = ev.time;
        document.getElementById('eventEndTime').value = ev.end_time || '';
        document.getElementById('eventLocation').value = ev.location;
        document.getElementById('eventClub').value = ev.club_id;
        switchSection('create-event');
    } catch (e) { showToast(e.message, 'error'); }
};

window.cancelEvent = async function (id) {
    if (!confirm('Cancel this event?')) return;
    try {
        await api('/api/events/' + id, { method: 'DELETE' });
        showToast('Event cancelled', 'success');
        document.getElementById('eventModal').classList.remove('active');
        loadEvents();
    } catch (e) { showToast(e.message, 'error'); }
};

// =========================================
// Approvals (Faculty)
// =========================================
async function loadApprovals() {
    try {
        const pending = await api('/api/approvals/pending');
        const tbody = document.getElementById('approvalsBody');
        const empty = document.getElementById('approvalsEmpty');
        const badge = document.getElementById('approvalBadge');

        if (pending.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = '';
            document.querySelector('.table-wrapper')?.closest('#sectionApprovals')?.querySelector('.table-wrapper')?.style && (document.getElementById('sectionApprovals').querySelector('.table-wrapper').style.display = 'none');
            badge.style.display = 'none';
        } else {
            empty.style.display = 'none';
            const tw = document.getElementById('sectionApprovals').querySelector('.table-wrapper');
            if (tw) tw.style.display = '';
            badge.style.display = '';
            badge.textContent = pending.length;
        }

        tbody.innerHTML = pending.map(ev => `
      <tr>
        <td><strong>${esc(ev.event_name)}</strong></td>
        <td>${esc(ev.club_name || 'N/A')}</td>
        <td>${esc(ev.creator_name || 'N/A')}</td>
        <td>${formatDate(ev.date)}</td>
        <td>${esc(ev.location)}</td>
        <td>
          <div class="table-actions">
            <button class="btn-approve" onclick="approveEvent(${ev.id}, 'approved')"><i class="fas fa-check"></i> Approve</button>
            <button class="btn-reject" onclick="approveEvent(${ev.id}, 'rejected')"><i class="fas fa-times"></i> Reject</button>
          </div>
        </td>
      </tr>
    `).join('');
    } catch (e) { console.error(e); }
}

window.approveEvent = async function (id, status) {
    try {
        await api('/api/approvals/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
        showToast(`Event ${status}!`, 'success');
        loadApprovals();
        loadEvents();
    } catch (e) { showToast(e.message, 'error'); }
};

// =========================================
// Coordinator Requests (Faculty)
// =========================================
async function loadCoordinatorRequests() {
    try {
        const reqs = await api('/api/coordinators/requests');
        const tbody = document.getElementById('coordinatorsBody');
        const empty = document.getElementById('coordsEmpty');
        const badge = document.getElementById('coordBadge');
        const pending = reqs.filter(r => r.request_status === 'pending');

        if (reqs.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = '';
            badge.style.display = 'none';
        } else {
            empty.style.display = 'none';
            badge.style.display = pending.length > 0 ? '' : 'none';
            badge.textContent = pending.length;
        }

        tbody.innerHTML = reqs.map(r => `
      <tr>
        <td><strong>${esc(r.student_name)}</strong></td>
        <td>${esc(r.student_email)}</td>
        <td>${esc(r.club_name)}</td>
        <td><span class="event-status status-${r.request_status}">${r.request_status}</span></td>
        <td>
          ${r.request_status === 'pending' ? `
            <div class="table-actions">
              <button class="btn-approve" onclick="verifyCoord(${r.id}, 'approved')"><i class="fas fa-check"></i> Verify</button>
              <button class="btn-reject" onclick="verifyCoord(${r.id}, 'rejected')"><i class="fas fa-times"></i> Reject</button>
            </div>
          ` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
      </tr>
    `).join('');
    } catch (e) { console.error(e); }
}

window.verifyCoord = async function (id, status) {
    try {
        await api('/api/coordinators/requests/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
        showToast(`Coordinator ${status}!`, 'success');
        loadCoordinatorRequests();
    } catch (e) { showToast(e.message, 'error'); }
};

// =========================================
// My Requests (Coordinator)
// =========================================
async function loadMyRequests() {
    try {
        const reqs = await api('/api/coordinators/my-requests');
        const list = document.getElementById('myRequestsList');
        const empty = document.getElementById('myRequestsEmpty');

        if (reqs.length === 0) {
            list.innerHTML = '';
            empty.style.display = '';
        } else {
            empty.style.display = 'none';
            list.innerHTML = reqs.map(r => `
        <div class="request-card">
          <div class="request-info">
            <div class="request-icon"><i class="fas fa-users"></i></div>
            <div class="request-details">
              <h4>${esc(r.club_name)}</h4>
              <p>Coordinator verification request</p>
            </div>
          </div>
          <span class="event-status status-${r.request_status}">${r.request_status}</span>
        </div>
      `).join('');
        }
    } catch (e) { console.error(e); }
}

// =========================================
// Club Management (Faculty)
// =========================================
window.editClub = function (id) {
    const club = allClubs.find(c => c.id === id);
    if (!club) return;
    document.getElementById('clubModalTitle').textContent = 'Edit Club';
    document.getElementById('editClubId').value = id;
    document.getElementById('clubName').value = club.club_name;
    document.getElementById('clubDescription').value = club.description || '';
    document.getElementById('clubModal').classList.add('active');
};

window.deleteClub = async function (id) {
    if (!confirm('Delete this club?')) return;
    try {
        await api('/api/clubs/' + id, { method: 'DELETE' });
        showToast('Club deleted', 'success');
        loadClubs();
    } catch (e) { showToast(e.message, 'error'); }
};

// =========================================
// Modals Setup
// =========================================
function setupModals() {
    // Event detail modal
    document.getElementById('modalClose').addEventListener('click', () => {
        document.getElementById('eventModal').classList.remove('active');
    });
    document.getElementById('eventModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
    });

    // Verify modal
    document.getElementById('newRequestBtn').addEventListener('click', () => {
        document.getElementById('verifyModal').classList.add('active');
    });
    document.getElementById('verifyModalClose').addEventListener('click', () => {
        document.getElementById('verifyModal').classList.remove('active');
    });
    document.getElementById('cancelVerifyBtn').addEventListener('click', () => {
        document.getElementById('verifyModal').classList.remove('active');
    });
    document.getElementById('submitVerifyBtn').addEventListener('click', async () => {
        const clubId = document.getElementById('verifyClubSelect').value;
        if (!clubId) { showToast('Select a club', 'error'); return; }
        try {
            await api('/api/coordinators/request', { method: 'POST', body: JSON.stringify({ club_id: parseInt(clubId) }) });
            showToast('Verification request submitted!', 'success');
            document.getElementById('verifyModal').classList.remove('active');
            loadMyRequests();
        } catch (e) { showToast(e.message, 'error'); }
    });

    // Club modal
    document.getElementById('addClubBtn').addEventListener('click', () => {
        document.getElementById('clubModalTitle').textContent = 'Add Club';
        document.getElementById('editClubId').value = '';
        document.getElementById('clubForm').reset();
        document.getElementById('clubModal').classList.add('active');
    });
    document.getElementById('clubModalClose').addEventListener('click', () => {
        document.getElementById('clubModal').classList.remove('active');
    });
    document.getElementById('cancelClubBtn').addEventListener('click', () => {
        document.getElementById('clubModal').classList.remove('active');
    });
    document.getElementById('submitClubBtn').addEventListener('click', async () => {
        const name = document.getElementById('clubName').value.trim();
        const desc = document.getElementById('clubDescription').value.trim();
        const editId = document.getElementById('editClubId').value;
        if (!name) { showToast('Club name is required', 'error'); return; }
        try {
            if (editId) {
                await api('/api/clubs/' + editId, { method: 'PUT', body: JSON.stringify({ club_name: name, description: desc }) });
                showToast('Club updated!', 'success');
            } else {
                await api('/api/clubs', { method: 'POST', body: JSON.stringify({ club_name: name, description: desc }) });
                showToast('Club created!', 'success');
            }
            document.getElementById('clubModal').classList.remove('active');
            loadClubs();
        } catch (e) { showToast(e.message, 'error'); }
    });
}

// =========================================
// Helpers
// =========================================
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function formatDate(d) {
    if (!d) return '—';
    try {
        return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return d; }
}

function formatTime(t) {
    if (!t) return '—';
    try {
        const [h, m] = t.split(':');
        const hr = parseInt(h);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        return `${hr % 12 || 12}:${m} ${ampm}`;
    } catch { return t; }
}
