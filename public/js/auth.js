// =========================================
// CampusEvents — Auth Logic (with Google Sign-In)
// =========================================

const API_BASE = '';

// *** Replace this with your actual Google Client ID ***
const GOOGLE_CLIENT_ID = '189035419390-phdmm2d6bbaibefdd934vsuhg2ns5sub.apps.googleusercontent.com';

// DOM Elements
const authCard = document.querySelector('.auth-card');

const goToSignUp = document.getElementById('goToSignUp');
const goToSignIn = document.getElementById('goToSignIn');
const mobileShowSignUp = document.getElementById('mobileShowSignUp');
const mobileShowSignIn = document.getElementById('mobileShowSignIn');

const signInForm = document.getElementById('signInForm');
const signUpForm = document.getElementById('signUpForm');
const signupRole = document.getElementById('signupRole');
const signupClub = document.getElementById('signupClub');

// =========================================
// Load clubs for coordinator signup
// =========================================
let allClubs = [];
(async function loadClubsForSignup() {
    try {
        const res = await fetch('/api/clubs');
        if (res.ok) {
            allClubs = await res.json();
            allClubs.forEach(c => {
                if (c.club_name === 'Others') return;
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.club_name;
                signupClub.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }
})();

// Show/hide club dropdown based on role
signupRole && signupRole.addEventListener('change', () => {
    if (signupRole.value === 'coordinator') {
        signupClub.style.display = '';
        signupClub.required = true;
    } else {
        signupClub.style.display = 'none';
        signupClub.required = false;
        signupClub.value = '';
    }
});

// =========================================
// Panel Toggle (Slide Animation)
// =========================================
function toggleToSignUp() {
    authCard.classList.add('sign-up-mode');
}

function toggleToSignIn() {
    authCard.classList.remove('sign-up-mode');
}

goToSignUp && goToSignUp.addEventListener('click', toggleToSignUp);
goToSignIn && goToSignIn.addEventListener('click', toggleToSignIn);
mobileShowSignUp && mobileShowSignUp.addEventListener('click', (e) => { e.preventDefault(); toggleToSignUp(); });
mobileShowSignIn && mobileShowSignIn.addEventListener('click', (e) => { e.preventDefault(); toggleToSignIn(); });

// =========================================
// Toast Notification
// =========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const icon = toast.querySelector('i');

    toastMessage.textContent = message;
    toast.className = 'toast show ' + type;
    icon.className = type === 'success' ? 'fas fa-check-circle' : type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// =========================================
// Auth Check — Redirect if logged in
// =========================================
(function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/dashboard';
    }
})();

// =========================================
// Google Sign-In / Sign-Up
// =========================================

// Create & inject role-selection modal for new Google users
function createRoleModal() {
    const modal = document.createElement('div');
    modal.id = 'googleRoleModal';
    modal.innerHTML = `
        <div class="grm-backdrop"></div>
        <div class="grm-card">
            <h3>Almost there!</h3>
            <p>Select your role to finish setting up your account.</p>
            <select id="grmRole">
                <option value="" disabled selected>Select Role</option>
                <option value="student">Student</option>
                <option value="coordinator">Student Coordinator</option>
                <option value="faculty">Faculty</option>
            </select>
            <select id="grmClub" style="display:none;">
                <option value="" disabled selected>Select Club to Coordinate</option>
            </select>
            <div class="grm-actions">
                <button class="grm-cancel" id="grmCancel">Cancel</button>
                <button class="grm-confirm" id="grmConfirm">Create Account →</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Populate clubs in modal
    const grmClub = document.getElementById('grmClub');
    allClubs.forEach(c => {
        if (c.club_name === 'Others') return;
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.club_name;
        grmClub.appendChild(opt);
    });

    // Show/hide club dropdown
    document.getElementById('grmRole').addEventListener('change', function () {
        if (this.value === 'coordinator') {
            grmClub.style.display = '';
        } else {
            grmClub.style.display = 'none';
            grmClub.value = '';
        }
    });

    return modal;
}

function showRoleModal(googleCredential) {
    let modal = document.getElementById('googleRoleModal');
    if (!modal) modal = createRoleModal();
    modal.style.display = 'block';

    const confirmBtn = document.getElementById('grmConfirm');
    const cancelBtn = document.getElementById('grmCancel');

    // Remove old listeners by cloning
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    newConfirm.addEventListener('click', async () => {
        const role = document.getElementById('grmRole').value;
        const club_id = document.getElementById('grmClub').value;

        if (!role) {
            showToast('Please select a role', 'error');
            return;
        }
        if (role === 'coordinator' && !club_id) {
            showToast('Please select a club to coordinate', 'error');
            return;
        }

        newConfirm.textContent = 'Creating...';
        newConfirm.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: googleCredential, role, club_id: club_id || undefined })
            });

            const data = await res.json();

            if (!res.ok) {
                showToast(data.error || 'Signup failed', 'error');
                newConfirm.textContent = 'Create Account →';
                newConfirm.disabled = false;
                return;
            }

            modal.style.display = 'none';
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showToast(data.message || 'Account created!', 'success');
            setTimeout(() => { window.location.href = '/dashboard'; }, 800);
        } catch (err) {
            showToast('Network error. Please try again.', 'error');
            newConfirm.textContent = 'Create Account →';
            newConfirm.disabled = false;
        }
    });
}

// Handle the Google credential response
async function handleGoogleCredentialResponse(response) {
    const credential = response.credential;

    try {
        const res = await fetch(`${API_BASE}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential })
        });

        const data = await res.json();

        if (res.ok) {
            // Existing user — logged in
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showToast('Welcome back, ' + data.user.name + '!', 'success');
            setTimeout(() => { window.location.href = '/dashboard'; }, 800);
        } else if (data.needsRole) {
            // New user — needs to pick a role
            showRoleModal(credential);
        } else {
            showToast(data.error || 'Google sign-in failed', 'error');
        }
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
    }
}

// Initialize Google Identity Services
function initGoogleSignIn() {
    if (typeof google === 'undefined' || !google.accounts) {
        // GIS not loaded yet, retry
        setTimeout(initGoogleSignIn, 200);
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
    });

    // Wire up both buttons
    const signInBtn = document.getElementById('googleSignInBtn');
    const signUpBtn = document.getElementById('googleSignUpBtn');

    function triggerGooglePrompt() {
        google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                // Fallback: render a real Google button in a hidden container and click it
                showToast('Google popup blocked. Please allow popups or try again.', 'error');
            }
        });
    }

    if (signInBtn) signInBtn.addEventListener('click', triggerGooglePrompt);
    if (signUpBtn) signUpBtn.addEventListener('click', triggerGooglePrompt);
}

// Start Google init when the page loads
initGoogleSignIn();

// =========================================
// Sign In (Email/Password)
// =========================================
signInForm && signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.classList.add('loading');

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Login failed', 'error');
            btn.classList.remove('loading');
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('Welcome back, ' + data.user.name + '!', 'success');

        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 800);
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
        btn.classList.remove('loading');
    }
});

// =========================================
// Sign Up (Email/Password)
// =========================================
signUpForm && signUpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    btn.classList.add('loading');

    const firstName = document.getElementById('signupFirstName').value.trim();
    const lastName = document.getElementById('signupLastName').value.trim();
    const name = firstName + ' ' + lastName;
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const role = document.getElementById('signupRole').value;
    const club_id = document.getElementById('signupClub').value;

    if (!role) {
        showToast('Please select a role', 'error');
        btn.classList.remove('loading');
        return;
    }

    if (role === 'coordinator' && !club_id) {
        showToast('Please select a club to coordinate', 'error');
        btn.classList.remove('loading');
        return;
    }

    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        btn.classList.remove('loading');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        btn.classList.remove('loading');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, club_id: club_id || undefined })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Signup failed', 'error');
            btn.classList.remove('loading');
            return;
        }

        showToast('Account created! Please sign in.', 'success');
        btn.classList.remove('loading');
        signUpForm.reset();

        setTimeout(() => {
            toggleToSignIn();
        }, 1000);
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
        btn.classList.remove('loading');
    }
});
