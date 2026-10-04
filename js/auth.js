/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  const isVisible = input.type === 'text';
  input.type = isVisible ? 'password' : 'text';
  button.setAttribute('aria-pressed', String(!isVisible));
  button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
  button.classList.toggle('is-visible', !isVisible);
}

function resetPasswordVisibility() {
  document.querySelectorAll('.password-toggle').forEach(button => {
    const input = button.parentElement.querySelector('input');
    input.type = 'password';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Show password');
    button.classList.remove('is-visible');
  });
}

function animateAuthView(viewId) {
  const view = document.getElementById(viewId);
  view.classList.remove('auth-view-enter');
  void view.offsetWidth;
  view.classList.add('auth-view-enter');
}

function showSignupView() {
  resetPasswordVisibility();
  document.getElementById('auth-login-view').style.display = 'none';
  document.getElementById('auth-pending-view').style.display = 'none';
  document.getElementById('auth-forgot-view').style.display = 'none';
  document.getElementById('auth-signup-view').style.display = 'block';
  animateAuthView('auth-signup-view');
  document.getElementById('auth-error').style.display = 'none';
}

function showLoginView() {
  resetPasswordVisibility();
  document.getElementById('auth-signup-view').style.display = 'none';
  document.getElementById('auth-pending-view').style.display = 'none';
  document.getElementById('auth-forgot-view').style.display = 'none';
  document.getElementById('auth-login-view').style.display = 'block';
  animateAuthView('auth-login-view');
  document.getElementById('signup-error').style.display = 'none';
}

function showForgotView() {
  resetPasswordVisibility();
  document.getElementById('auth-login-view').style.display = 'none';
  document.getElementById('auth-signup-view').style.display = 'none';
  document.getElementById('auth-pending-view').style.display = 'none';
  document.getElementById('auth-forgot-view').style.display = 'block';
  animateAuthView('auth-forgot-view');
  document.getElementById('forgot-error').style.display = 'none';
  document.getElementById('forgot-success').style.display = 'none';
}

async function doForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const okEl = document.getElementById('forgot-success');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  if (!email) {
    errEl.textContent = '❌ Please enter your email';
    errEl.style.display = 'block';
    return;
  }
  await withButtonLoading('auth-forgot-submit', 'Sending…', async () => {
    try {
      await auth.sendPasswordResetEmail(email);
      okEl.textContent = '✓ Reset link sent! Check your inbox (and spam folder).';
      okEl.style.display = 'block';
    } catch (e) {
      errEl.textContent = '❌ ' + (e.message || 'Could not send reset email');
      errEl.style.display = 'block';
    }
  });
}

function showPendingView() {
  resetPasswordVisibility();
  document.getElementById('auth-login-view').style.display = 'none';
  document.getElementById('auth-signup-view').style.display = 'none';
  document.getElementById('auth-forgot-view').style.display = 'none';
  document.getElementById('auth-pending-view').style.display = 'block';
  animateAuthView('auth-pending-view');
}

// While a signup is in progress, the global auth.onAuthStateChanged listener
// below must NOT react to the brief auto-signed-in state Firebase puts the
// new user in right after createUserWithEmailAndPassword() — otherwise it
// races with the profile-doc .set() call, signs the user out early, and the
// profile document never gets written (this was the original bug: pending
// list stayed empty because the doc simply never made it to Firestore).
let suppressAuthHandler = false;

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirmPw = document.getElementById('signup-confirm').value;
  const errEl = document.getElementById('signup-error');
  errEl.style.display = 'none';

  if (!name || !email || !password || !confirmPw) {
    errEl.textContent = '❌ Please fill in all fields';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = '❌ Password must be at least 6 characters';
    errEl.style.display = 'block';
    return;
  }
  if (password !== confirmPw) {
    errEl.textContent = '❌ Passwords do not match';
    errEl.style.display = 'block';
    return;
  }

  await withButtonLoading('auth-signup-submit', 'Creating account…', async () => {
    suppressAuthHandler = true;
    try {
    // This automatically creates the auth account. We then create a matching
    // profile doc in Firestore with approved:false and NO roles yet — the
    // admin assigns role(s) (Admin/Dialer/Closer/Support Manager) by name
    // right when they approve this person in the Team page.
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      name: name,
      email: email,
      roles: [],
      approved: false,
      createdAt: new Date().toISOString()
    });
    await auth.signOut();
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-confirm').value = '';
    showPendingView();
    } catch (e) {
      errEl.textContent = '❌ ' + (e.message || 'Signup failed');
      errEl.style.display = 'block';
      if (auth.currentUser) { try { await auth.signOut(); } catch (_) {} }
    } finally {
      suppressAuthHandler = false;
    }
  });
}

async function doLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !password) {
    errEl.textContent = '❌ Please enter both email and password';
    errEl.style.display = 'block';
    return;
  }
  await withButtonLoading('auth-login-submit', 'Signing in…', async () => {
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      errEl.textContent = '❌ Login failed: ' + (e.message || 'incorrect email/password');
      errEl.style.display = 'block';
    }
  });
}

function doLogout() {
  showSessionTransition(`See you, ${currentUserName || 'there'}`, 'You are safely signed out.');
  if (unsubscribeLeads) { unsubscribeLeads(); unsubscribeLeads = null; }
  if (unsubscribeTeam) { unsubscribeTeam(); unsubscribeTeam = null; }
  if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null; }
  if (unsubscribeRevenue) { unsubscribeRevenue(); unsubscribeRevenue = null; }
  if (unsubscribeClients) { unsubscribeClients(); unsubscribeClients = null; }
  if (unsubscribeAllTasks) { unsubscribeAllTasks(); unsubscribeAllTasks = null; }
  if (unsubscribeNotifications) { unsubscribeNotifications(); unsubscribeNotifications = null; }
  auth.signOut();
}

let currentUid = null;
let currentUserEmail = null;
let currentUserName = '';
let welcomedUid = null;
let isAdmin = false;
let unsubscribeProfile = null;

// ── Role model ──────────────────────────────────────────────────────────
// A user can hold any combination of these 4 roles at once (checkboxes in
// the Team page). 'admin' is a superset — admins already see everything
// leads/revenue/clients-wise regardless of the other 3.
const ROLE_LABELS = { admin: 'Admin', dialer: 'Dialer', closer: 'Closer', support_manager: 'Support Manager' };
let isDialer = false, isCloser = false, isSupportManager = false, currentRoles = [];
let prevRoleSig = null; // used to detect a role change and restart the leads feed

// Reads a user doc's roles, with a fallback for accounts created before the
// roles-array model existed (they only have the old single 'role' string).
function rolesOf(profile) {
  if (Array.isArray(profile.roles) && profile.roles.length) return profile.roles;
  if ((profile.role || '').trim().toLowerCase() === 'admin') return ['admin'];
  return [];
}

// Approved users only, filtered by role — used to populate the Closer /
// Support Manager dropdowns on the lead modal so anyone can staff-pick,
// not just the admin (everyone can already read the 'users' collection).
function getUsersByRole(roleKey) {
  return teamUsers.filter(u => u.approved && rolesOf(u).includes(roleKey));
}

auth.onAuthStateChanged(user => {
  // Skip entirely while doSignup() is mid-flight — otherwise this fires the
  // instant Firebase auto-signs-in the brand-new user, sees no profile doc
  // yet (it hasn't finished writing), and signs them straight back out,
  // which kills the in-flight profile write before it can complete.
  if (suppressAuthHandler) return;

  // Always clear any previous profile watcher before reacting to a new auth state
  if (unsubscribeProfile) { unsubscribeProfile(); unsubscribeProfile = null; }

  if (user) {
    // Watch the user's own profile doc live — this means if the admin approves,
    // revokes, or changes someone's role, it takes effect immediately for that
    // person, even if they're already sitting on the page (no re-login needed).
    unsubscribeProfile = db.collection('users').doc(user.uid).onSnapshot(
      snap => {
        const profile = snap.exists ? snap.data() : null;

        if (!profile || profile.approved !== true) {
          // Not approved (or access was just revoked) — sign out, show pending screen
          if (unsubscribeLeads) { unsubscribeLeads(); unsubscribeLeads = null; }
          if (unsubscribeTeam) { unsubscribeTeam(); unsubscribeTeam = null; }
          if (unsubscribeRevenue) { unsubscribeRevenue(); unsubscribeRevenue = null; }
          if (unsubscribeClients) { unsubscribeClients(); unsubscribeClients = null; }
          if (unsubscribeAllTasks) { unsubscribeAllTasks(); unsubscribeAllTasks = null; }
          if (unsubscribeNotifications) { unsubscribeNotifications(); unsubscribeNotifications = null; }
          currentUid = null;
          currentUserEmail = null;
          isAdmin = false;
          isDialer = false; isCloser = false; isSupportManager = false; currentRoles = []; prevRoleSig = null;
          auth.signOut();
          showPendingView();
          document.getElementById('auth-overlay').classList.add('show');
          document.getElementById('app-root').style.display = 'none';
          return;
        }

        const wasAdmin = isAdmin;
        currentUid = user.uid;
        currentUserEmail = user.email;
        currentUserName = profile.name || user.displayName || user.email.split('@')[0];
        currentRoles = rolesOf(profile);
        isAdmin = currentRoles.includes('admin');
        isDialer = currentRoles.includes('dialer');
        isCloser = currentRoles.includes('closer');
        isSupportManager = currentRoles.includes('support_manager');

        document.getElementById('auth-overlay').classList.remove('show');
        document.getElementById('app-root').style.display = 'flex';
        document.getElementById('topbar-user-email').textContent = user.email + (isAdmin ? ' (Admin)' : '');
        document.getElementById('sidebar-user-name').textContent = currentUserName;
        document.getElementById('sidebar-user-role').textContent = isAdmin ? 'Administrator' : (currentRoles.map(role => ROLE_LABELS[role]).join(', ') || 'Team member');
        document.getElementById('sidebar-avatar').textContent = currentUserName.trim().charAt(0).toUpperCase() || 'U';
        document.getElementById('settings-account-name').textContent = currentUserName;
        document.getElementById('settings-account-email').textContent = user.email;
        document.getElementById('settings-account-role').textContent = isAdmin ? 'Administrator' : (currentRoles.map(role => ROLE_LABELS[role]).join(', ') || 'Team member');
        document.getElementById('nav-team').style.display = isAdmin ? '' : 'none';
        if (welcomedUid !== user.uid) {
          welcomedUid = user.uid;
          showSessionTransition(`Welcome, ${currentUserName}`, 'Your RPM CRM workspace is ready.');
        }

        // Start (or restart, if role assignment changed) the correctly-scoped
        // leads feed — which leads someone can see depends on Dialer/Closer,
        // not just Admin, so any role change needs a fresh query.
        const roleSig = currentRoles.slice().sort().join(',');
        if (!unsubscribeLeads || prevRoleSig !== roleSig) {
          startLeadsListener();
          if (unsubscribeClients) startClientsListener(); // re-scope clients too, same trigger
          if (unsubscribeAllTasks) startGlobalTasksListener();
          prevRoleSig = roleSig;
        }
        // Everyone (not just admins) needs the users list live — it powers the
        // Closer / Support Manager dropdowns on the lead modal. Only the Team
        // page UI itself is admin-gated (hidden nav item above).
        if (!unsubscribeTeam) startTeamListener();
        if (!unsubscribeRevenue) startRevenueListener();
        if (!unsubscribeClients) startClientsListener();
        if (!unsubscribeAllTasks) startGlobalTasksListener();
        if (!unsubscribeNotifications) startNotificationsListener();
      },
      err => {
        console.error(err);
        showToast('❌ Profile sync error: ' + err.message, 'error');
      }
    );
  } else {
    currentUid = null;
    currentUserEmail = null;
    currentUserName = '';
    welcomedUid = null;
    isAdmin = false;
    isDialer = false; isCloser = false; isSupportManager = false; currentRoles = []; prevRoleSig = null;
    renewalCheckDone = false;
    document.getElementById('auth-overlay').classList.add('show');
    document.getElementById('app-root').style.display = 'none';
    if (unsubscribeLeads) { unsubscribeLeads(); unsubscribeLeads = null; }
    if (unsubscribeTeam) { unsubscribeTeam(); unsubscribeTeam = null; }
    if (unsubscribeRevenue) { unsubscribeRevenue(); unsubscribeRevenue = null; }
    if (unsubscribeClients) { unsubscribeClients(); unsubscribeClients = null; }
    if (unsubscribeAllTasks) { unsubscribeAllTasks(); unsubscribeAllTasks = null; }
    if (unsubscribeNotifications) { unsubscribeNotifications(); unsubscribeNotifications = null; }
  }
});

