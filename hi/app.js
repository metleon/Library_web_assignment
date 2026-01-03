// app.js (REPLACE your existing file with this)

(() => {
  const BOOKS_KEY = 'lc_books_v1';
  const THEME_KEY = 'lc_theme_v1';

  /* -------------------------
     Lightweight Auth shim
     If you already have an Auth object (auth.js), this will use it.
     Otherwise a tiny local stub is provided so the UI works:
     - admin: role 'admin'
     - librarian: role 'librarian'
     - member: default
     Use Auth.setSession({user:'name',role:'admin'}) to change in console for testing.
     ------------------------- */
  if (!window.Auth) {
    window.Auth = (function () {
      let session = JSON.parse(localStorage.getItem('lc_auth_session') || 'null');
      return {
        getSession: () => session,
        setSession: (s) => { session = s; localStorage.setItem('lc_auth_session', JSON.stringify(s)); },
        clear: () => { session = null; localStorage.removeItem('lc_auth_session'); }
      };
    })();
  }

  /* -------------------------
     DOM references (safe)
     ------------------------- */
  const addBookForm = document.getElementById('addBookForm');
  const bookGrid = document.getElementById('bookGrid');
  const emptyMessage = document.getElementById('emptyMessage');
  const totalBooksEl = document.getElementById('totalBooks');
  const availableBooksEl = document.getElementById('availableBooks');
  const borrowedBooksEl = document.getElementById('borrowedBooks');

  const searchInput = document.getElementById('searchInput');
  // Accept either "filterCategory" or older "filterDDC"
  const filterCategory = document.getElementById('filterCategory') || document.getElementById('filterDDC') || null;
  const filterStatus = document.getElementById('filterStatus');

  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  const darkModeBtn = document.getElementById('darkModeBtn');

  /* -------------------------
     State
     ------------------------- */
  let books = loadBooks();
  const session = Auth.getSession();
  const role = session ? session.role : 'member';

  /* -------------------------
     Helpers: load/save/uid
     ------------------------- */
  function loadBooks(){
    try {
      const raw = localStorage.getItem(BOOKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ console.error('loadBooks error', e); return []; }
  }
  function saveBooks(){
    try {
      localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
    } catch(e){ console.error('saveBooks error', e); }
  }
  function uid(){ return Date.now() + Math.floor(Math.random()*1000); }

  /* -------------------------
     Form submission: add book
     - accepts multiple category inputs (category, ddNumber, ddSelect)
     - validates year properly
     ------------------------- */
  if (addBookForm) {
    addBookForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!Auth.getSession()) { alert('Please log in to add books.'); return; }

      const title = (document.getElementById('title') || {value:''}).value.trim();
      const author = (document.getElementById('author') || {value:''}).value.trim();
      const isbn = (document.getElementById('isbn') || {value:''}).value.trim();

      // prefer generic category field; fallback to ddcNumber or category select
      const catField = document.getElementById('category');
      const ddcField = document.getElementById('ddcNumber');
      const ddSelect = document.getElementById('filterDDC');
      let category = '';
      if (catField && catField.value.trim()) category = catField.value.trim();
      else if (ddcField && ddcField.value.trim()) category = ddcField.value.trim();
      else if (ddSelect && ddSelect.value) category = ddSelect.value;

      const yearVal = (document.getElementById('year') || {value:''}).value.trim();
      let year = '';
      if (yearVal) {
        const y = parseInt(yearVal,10);
        if (!Number.isNaN(y) && y > 0 && y < 9999) year = y;
      }

      if (!title || !author) { alert('Title and author are required.'); return; }

      const book = {
        id: uid(),
        title, author, isbn, category, year,
        status: 'available',
        borrower: null,      // { name, borrowedAt, dueDate }
        addedAt: Date.now()
      };
      books.unshift(book);
      saveBooks();
      renderBooks();
      addBookForm.reset();
      // keep category select state if user used filter select
    });
  }

  /* -------------------------
     Render books + filtering + role-based actions
     ------------------------- */
  function renderBooks() {
    if (!bookGrid) return;
    bookGrid.innerHTML = '';

    const search = (searchInput && searchInput.value || '').toLowerCase().trim();
    const category = (filterCategory && filterCategory.value) || '';
    const status = (filterStatus && filterStatus.value) || '';

    const filtered = books.filter(b => {
      const matchesSearch = !search || (
        (b.title && b.title.toLowerCase().includes(search)) ||
        (b.author && b.author.toLowerCase().includes(search)) ||
        ((b.isbn||'').toLowerCase().includes(search)) ||
        ((b.category||'').toLowerCase().includes(search))
      );
      const matchesCategory = !category || String(b.category) === String(category);
      const matchesStatus = !status || b.status === status;
      return matchesSearch && matchesCategory && matchesStatus;
    });

    if (!emptyMessage) {
      // nothing
    } else {
      emptyMessage.style.display = (filtered.length === 0 ? 'block' : 'none');
    }

    filtered.forEach(b => {
      const card = document.createElement('article');
      card.className = 'book-card';
      card.innerHTML = `
        <div class="book-title">${escapeHtml(b.title)}</div>
        <div class="book-info"><strong>Author:</strong> ${escapeHtml(b.author)}</div>
        <div class="book-info"><strong>ISBN:</strong> ${escapeHtml(b.isbn || '')}</div>
        <div class="book-info"><strong>Category:</strong> ${escapeHtml(b.category || '')} ${b.year ? ' • ' + b.year : ''}</div>
      `;

      // meta (status + borrower info)
      const meta = document.createElement('div');
      meta.className = 'book-meta';

      const statusSpan = document.createElement('span');
      statusSpan.className = 'book-status ' + (b.status === 'available' ? 'available' : 'borrowed');
      statusSpan.textContent = b.status.toUpperCase();
      meta.appendChild(statusSpan);

      if (b.borrower) {
        const br = document.createElement('div');
        br.className = 'book-info';
        br.innerHTML = `<strong>Borrower:</strong> ${escapeHtml(b.borrower.name)} • <small class="muted">Borrowed: ${new Date(b.borrower.borrowedAt).toLocaleDateString()}${b.borrower.dueDate ? ' • Due: ' + escapeHtml(b.borrower.dueDate) : ''}</small>`;
        meta.appendChild(br);
      }

      // actions
      const actions = document.createElement('div');
      actions.className = 'book-actions';

      // Admin: can delete, borrow, return
      // Librarian: borrow & return
      // Member: view only
      if (role === 'admin') {
        const del = createBtn('Delete','delete-btn', () => {
          if (confirm(`Delete "${b.title}"?`)) { deleteBook(b.id); }
        });
        actions.appendChild(del);
      }

      if (role === 'admin' || role === 'librarian') {
        if (b.status === 'available') {
          const borrow = createBtn('Borrow','borrow-btn', () => initiateBorrow(b.id));
          actions.appendChild(borrow);
        } else {
          const ret = createBtn('Return','return-btn', () => returnBook(b.id));
          actions.appendChild(ret);
        }
      } else {
        // member: show small hint
        const hint = document.createElement('small');
        hint.className = 'muted';
        hint.textContent = 'Login as librarian/admin to manage loans';
        actions.appendChild(hint);
      }

      card.appendChild(meta);
      card.appendChild(actions);
      bookGrid.appendChild(card);
    });

    updateStats();
  }

  function createBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'small-btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    return b;
  }

  /* -------------------------
     Borrow flow (prompt-based for simplicity)
     - asks for borrower name
     - asks for due date (optional, YYYY-MM-DD)
     ------------------------- */
  function initiateBorrow(id) {
    const name = prompt('Enter borrower name (required):');
    if (!name || !name.trim()) { alert('Borrower name required'); return; }
    let due = prompt('Enter due date (optional, YYYY-MM-DD). Leave empty if not applicable:');
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      if (!confirm('Due date format invalid. Continue without due date?')) return;
      due = '';
    }
    borrowBook(id, name.trim(), due || null);
  }

  function borrowBook(id, borrowerName, dueDate) {
    const b = books.find(x => x.id === id);
    if (b && b.status === 'available') {
      b.status = 'borrowed';
      b.borrower = {
        name: borrowerName,
        borrowedAt: Date.now(),
        dueDate: dueDate || null
      };
      saveBooks();
      renderBooks();
    } else {
      alert('Book is not available for borrowing.');
    }
  }

  function returnBook(id) {
    const b = books.find(x => x.id === id);
    if (b) {
      b.status = 'available';
      b.borrower = null;
      saveBooks();
      renderBooks();
    }
  }

  function deleteBook(id){
    books = books.filter(x => x.id !== id);
    saveBooks();
    renderBooks();
  }

  /* -------------------------
     Stats update (defensive: elements may not exist)
     ------------------------- */
  function updateStats(){
    if (totalBooksEl) totalBooksEl.textContent = books.length;
    if (availableBooksEl) availableBooksEl.textContent = books.filter(b => b.status === 'available').length;
    if (borrowedBooksEl) borrowedBooksEl.textContent = books.filter(b => b.status === 'borrowed').length;
  }

  /* -------------------------
     Export CSV/PDF (include borrower)
     ------------------------- */
  function exportCSV() {
    if (!books.length) { alert('No books to export'); return; }
    const rows = [['Title','Author','ISBN','Category','Year','Status','Borrower','BorrowedAt','DueDate','AddedAt']];
    books.forEach(b => rows.push([
      b.title||'', b.author||'', b.isbn||'', b.category||'', b.year||'', b.status||'',
      (b.borrower && b.borrower.name) || '', (b.borrower && new Date(b.borrower.borrowedAt).toISOString()) || '', (b.borrower && b.borrower.dueDate) || '',
      new Date(b.addedAt).toISOString()
    ]));
    const csv = rows.map(r => r.map(cell => {
      if (cell == null) return '';
      const cs = String(cell);
      if (cs.includes('"')||cs.includes(',')||cs.includes('\n')) return `"${cs.replace(/"/g,'""')}"`;
      return cs;
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    if (!books.length) { alert('No books to export'); return; }
    const content = `
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Library Export</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}
          h1{color:#2b6cb0}
          table{width:100%;border-collapse:collapse}
          th,td{padding:8px;border:1px solid #ddd;font-size:12px;text-align:left}
          th{background:#f5f7fb}
        </style>
      </head>
      <body>
        <h1>Library Export</h1>
        <div>Exported: ${new Date().toLocaleString()}</div>
        <table>
        <thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Category</th><th>Year</th><th>Status</th><th>Borrower</th><th>Due</th></tr></thead>
        <tbody>
        ${books.map(b => `<tr>
          <td>${escapeHtml(b.title)}</td>
          <td>${escapeHtml(b.author)}</td>
          <td>${escapeHtml(b.isbn||'')}</td>
          <td>${escapeHtml(b.category||'')}</td>
          <td>${b.year||''}</td>
          <td>${b.status}</td>
          <td>${b.borrower ? escapeHtml(b.borrower.name) : ''}</td>
          <td>${b.borrower && b.borrower.dueDate ? escapeHtml(b.borrower.dueDate) : ''}</td>
        </tr>`).join('')}
        </tbody></table>
      </body>
      </html>
    `;
    const w = window.open('', '_blank', 'noopener');
    if (!w) { alert('Popup blocked — allow popups for this site to export PDF.'); return; }
    w.document.open();
    w.document.write(content); 
    w.document.close();
  }

  /* -------------------------
     Small utilities
     ------------------------- */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  /* -------------------------
     Event wiring (defensive)
     ------------------------- */
  if (searchInput) searchInput.addEventListener('input', renderBooks);
  if (filterCategory) filterCategory.addEventListener('change', renderBooks);
  if (filterStatus) filterStatus.addEventListener('change', renderBooks);
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV);
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPDF);

  /* -------------------------
     Dark mode (single handler, persisted)
     ------------------------- */
  if (darkModeBtn) {
    // load theme
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
      document.body.classList.add('dark');
      darkModeBtn.textContent = '☀ Light Mode';
    } else {
      darkModeBtn.textContent = '🌙 Dark Mode';
    }

    darkModeBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const nowDark = document.body.classList.contains('dark');
      localStorage.setItem(THEME_KEY, nowDark ? 'dark' : 'light');
      darkModeBtn.textContent = nowDark ? '☀ Light Mode' : '🌙 Dark Mode';
    });
  }

  /* -------------------------
     Initial render (fix typo)
     ------------------------- */
  renderBooks();

  // expose some helpers for debugging in console if needed
  window.LibraryApp = {
    getBooks: () => books,
    saveBooks,
    loadBooks,
    Auth
  };
})();

// Fine calculator function
function calculateFine() {
    const overdueDays = parseInt(document.getElementById('overdueDays').value) || 0;
    const fineRate = parseInt(document.getElementById('fineRate').value) || 0;
    const itemStatus = document.getElementById('itemStatus').value;
    
    let totalFine = overdueDays * fineRate;
    
    // Add additional fees for damaged/lost items
    if (itemStatus === 'damaged') {
        totalFine += 500; // Damage fee
    } else if (itemStatus === 'lost') {
        totalFine += 2000; // Replacement fee
    }
    
    const resultElement = document.getElementById('fineResult');
    const amountElement = resultElement.querySelector('.result-amount');
    
    amountElement.textContent = `KES ${totalFine}`;
    resultElement.style.display = 'block';
}

// User type selector function
function selectUserType(type) {
    // Remove active class from all buttons
    document.querySelectorAll('.user-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to clicked button
    event.target.closest('.user-type-btn').classList.add('active');
    
    // Update form based on user type
    const regNumberInput = document.getElementById('regNumber');
    if (type === 'student') {
        regNumberInput.placeholder = "E156/XXXX/2024";
    } else if (type === 'staff') {
        regNumberInput.placeholder = "STAFF/XXXX";
    } else if (type === 'admin') {
        regNumberInput.placeholder = "LIB/XXXX";
    }
}

// Form submission handlers
document.addEventListener('DOMContentLoaded', function() {
    // User registration form
    const userRegistrationForm = document.getElementById('userRegistrationForm');
    if (userRegistrationForm) {
        userRegistrationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('User registered successfully!');
            this.reset();
        });
    }
    
    // Contact form
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Thank you for your message! We will get back to you soon.');
            this.reset();
        });
    }
    
    // Set default expiry date to 1 year from now
    const expiryDateInput = document.getElementById('expiryDate');
    if (expiryDateInput) {
        const today = new Date();
        const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
        expiryDateInput.valueAsDate = nextYear;
        expiryDateInput.min = today.toISOString().split('T')[0];
    }
});

// section-navigation.js
document.addEventListener('DOMContentLoaded', () => {
  const navButtons = document.querySelectorAll('[data-section]');
  const sections = document.querySelectorAll('.section');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-section');

      // Hide all sections
      sections.forEach(sec => sec.classList.add('hidden'));

      // Show the target
      const activeSection = document.getElementById(target);
      if (activeSection) activeSection.classList.remove('hidden');

      // Optional: mark active button
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

