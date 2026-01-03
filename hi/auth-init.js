// auth-init.js — load after auth.js (and before app.js)
/* Usage:
   <script src="auth.js"></script>
   <script src="auth-init.js"></script>
   <script src="app.js"></script>
*/

document.addEventListener('DOMContentLoaded', () => {
  // If Auth isn't available (should be from auth.js), fail gracefully
  if (!window.Auth) return;

  const session = Auth.getSession();
  const isLoginPage = location.pathname.endsWith('login.html') || location.pathname.endsWith('/');

  // Redirect unauthenticated users to login.html (except when already on login page)
  if (!session) {
    // Allow public pages (e.g., login.html, public landing) - adjust as needed
    const publicPages = ['login.html', 'register.html'];
    const current = location.pathname.split('/').pop().toLowerCase();
    if (!publicPages.includes(current) && current !== '') {
      window.location.href = 'login.html';
      return;
    }
  }

  // Show current user (if element exists)
  const userEl = document.getElementById('currentUserDisplay');
  if (userEl && session) {
    userEl.textContent = session.username + (session.role ? ' • ' + session.role : '');
  }

  // Wire logout button and link to clear session and go back to login page
  function doLogout() {
    try { Auth.logout(); } catch(e){ console.warn('Logout failed', e); }
    // Optionally clear other app state here
    window.location.href = 'login.html';
  }

  const logoutBtn = document.getElementById('logoutBtn');
  const logoutLink = document.getElementById('logoutLink');

  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  if (logoutLink) logoutLink.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });

  // Optionally hide register link unless admin
  const registerLink = document.getElementById('linkRegister');
  if (registerLink) {
    if (!session || session.role !== 'admin') registerLink.classList.add('hidden');
    else registerLink.classList.remove('hidden');
  }
});