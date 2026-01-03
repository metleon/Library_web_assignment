// auth.js
// Client-side user management (localStorage).
// Uses Web Crypto API for SHA-256 password hashing (for demo only).

const Auth = (function(){
  const USERS_KEY = 'lc_users_v1';
  const SESSION_KEY = 'lc_session_v1';

  // Hash password using SHA-256 -> hex
  async function hashPassword(password) {
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // Load/save users
  function loadUsers(){
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      console.error('loadUsers', e);
      return [];
    }
  }
  function saveUsers(users){
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // Ensure there is a default admin user (first run)
  async function ensureDefaultAdmin(){
    const users = loadUsers();
    if (!users || users.length === 0) {
      // default admin: admin / admin123
      const pw = await hashPassword('admin123');
      const admin = { username: 'admin', passwordHash: pw, role: 'admin', createdAt: Date.now() };
      saveUsers([admin]);
      console.info('Default admin created: admin / admin123');
    }
  }

  // find user
  function findUser(username){
    const users = loadUsers();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  // Register user (admin only). Returns true if created, false if exists.
  async function registerUser(username, password, role='member') {
    username = username.trim();
    if (!username || !password) return false;
    const users = loadUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) return false;
    const ph = await hashPassword(password);
    users.push({ username, passwordHash: ph, role, createdAt: Date.now() });
    saveUsers(users);
    return true;
  }

  // Login: returns user object or null
  async function login(username, password) {
    const user = findUser(username);
    if (!user) return null;
    const ph = await hashPassword(password);
    if (ph === user.passwordHash) {
      // create session
      const session = { username: user.username, role: user.role, loggedAt: Date.now() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    }
    return null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Admin-only register wrapper (checks current session)
  async function adminRegister(username, password, role='member') {
    const s = getSession();
    if (!s || s.role !== 'admin') throw new Error('Admin only');
    return await registerUser(username, password, role);
  }

  return {
    ensureDefaultAdmin,
    hashPassword,
    loadUsers,
    saveUsers,
    findUser,
    registerUser,     // public (but register.html page still checks session)
    adminRegister,
    login,
    logout,
    getSession
  };
})();
