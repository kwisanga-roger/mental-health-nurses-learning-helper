// Assignment Helper — front-end SPA (vanilla JS, no build step).
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const aiStatusEl = document.getElementById('ai-status');

let STATE = { user: null, aiEnabled: false };

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s){s=String(s==null?'':s);var out='';for(var i=0;i<s.length;i++){var n=s.charCodeAt(i);if(n===38||n===60||n===62||n===34||n===39){out+='&#'+n+';';}else{out+=s.charAt(i);}}return out;}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

function msg(text, kind) { kind = kind || 'info'; return '<div class="msg ' + kind + '">' + esc(text) + '</div>'; }

async function refreshMe() {
  const { data } = await api('/api/me');
  STATE.user = data.user || null;
  STATE.aiEnabled = !!data.aiEnabled;
  aiStatusEl.textContent = STATE.aiEnabled
    ? 'Question engine: AI provider connected'
    : 'Question engine: built-in generator (no AI key set - still fully works)';
}

function renderNav() {
  const u = STATE.user;
  if (!u) { nav.innerHTML = ''; return; }
  const links = [];
  if (u.status === 'active') {
    links.push('<button class="btn small link" data-route="home">Home</button>');
    if (u.role === 'admin') {
      links.push('<button class="btn small link" data-route="admin">Admin</button>');
      links.push('<button class="btn small link" data-route="scores">Scores</button>');
    } else {
      links.push('<button class="btn small link" data-route="scores">My scores</button>');
    }
    links.push('<button class="btn small link" data-route="account">Account</button>');
  }
  links.push('<span class="pill">' + esc(u.name) + ' ' + (u.role === 'admin' ? '- admin' : '') + '</span>');
  links.push('<button class="btn small" id="logoutBtn">Log out</button>');
  nav.innerHTML = links.join('');
  nav.querySelectorAll('[data-route]').forEach(b => b.onclick = () => go(b.dataset.route));
  const lo = document.getElementById('logoutBtn');
  if (lo) lo.onclick = async () => { await api('/api/logout', { method: 'POST' }); STATE.user = null; go('auth'); };
}

async function go(route, params) {
  params = params || {};
  await refreshMe();
  renderNav();
  const u = STATE.user;
  if (!u) return viewAuth();
  if (u.status === 'pending') return viewPending();
  if (u.status === 'denied') return viewDenied();
  switch (route) {
    case 'admin': return u.role === 'admin' ? viewAdmin() : viewHome();
    case 'take': return viewTake(params.id);
    case 'scores': return viewScores();
    case 'account': return viewAccount();
    case 'home':
    default: return viewHome();
  }
}

function viewAuth() {
  app.innerHTML = '';
  const wrap = h(
    '<div class="grid cols-2">' +
      '<div class="card">' +
        '<h1>Welcome</h1>' +
        '<p class="sub">A study tool for <b>mental health nursing</b>. It turns your notes and modules into practice assignments - multiple-choice, true/false, matching, ordering, and short-answer questions, with instant grading and saved scores.</p>' +
        '<ul class="muted" style="line-height:1.9">' +
          '<li>The <b>first person to register becomes the admin</b>.</li>' +
          '<li>The admin uploads notes and generates assignments.</li>' +
          '<li>Everyone else <b>requests access</b> and works on assignments once approved.</li>' +
        '</ul>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row">' +
          '<button class="btn primary small" id="tabLogin">Log in</button>' +
          '<button class="btn small" id="tabReg">Request access / Register</button>' +
        '</div>' +
        '<div id="authForm"></div>' +
      '</div>' +
    '</div>'
  );
  app.appendChild(wrap);
  const formEl = wrap.querySelector('#authForm');
  const showLogin = () => {
    formEl.innerHTML =
      '<div id="authMsg"></div>' +
      '<label>Email</label><input id="email" type="email" placeholder="you@example.com" />' +
      '<label>Password</label><input id="password" type="password" placeholder="password" />' +
      '<div style="height:14px"></div>' +
      '<button class="btn primary" id="doLogin">Log in</button>';
    formEl.querySelector('#doLogin').onclick = doLogin;
  };
  const showReg = () => {
    formEl.innerHTML =
      '<div id="authMsg"></div>' +
      '<label>Name</label><input id="name" placeholder="Jane Doe" />' +
      '<label>Email</label><input id="email" type="email" placeholder="you@example.com" />' +
      '<label>Password</label><input id="password" type="password" placeholder="at least 6 characters" />' +
      '<label>Why do you need access? (optional)</label>' +
      '<textarea id="reason" style="min-height:70px" placeholder="e.g. Year 2 mental health nursing student revising for exams."></textarea>' +
      '<div style="height:14px"></div>' +
      '<button class="btn primary" id="doReg">Create account / Request access</button>' +
      '<p class="muted" style="font-size:12px;margin-top:10px">If you are the first user, you will become the admin instantly. Otherwise your request goes to the admin for approval.</p>';
    formEl.querySelector('#doReg').onclick = doRegister;
  };
  wrap.querySelector('#tabLogin').onclick = () => { setActive('#tabLogin'); showLogin(); };
  wrap.querySelector('#tabReg').onclick = () => { setActive('#tabReg'); showReg(); };
  function setActive(sel) {
    wrap.querySelectorAll('.row .btn').forEach(b => b.classList.remove('primary'));
    wrap.querySelector(sel).classList.add('primary');
  }
  showLogin();
}

async function doLogin() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const box = document.getElementById('authMsg');
  const { ok, data } = await api('/api/login', { method: 'POST', body: { email, password } });
  if (!ok) { box.innerHTML = msg(data.error || 'Login failed.', 'error'); return; }
  go('home');
}

async function doRegister() {
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const reason = document.getElementById('reason') ? document.getElementById('reason').value : '';
  const box = document.getElementById('authMsg');
  const { ok, data } = await api('/api/register', { method: 'POST', body: { name, email, password, reason } });
  if (!ok) { box.innerHTML = msg(data.error || 'Registration failed.', 'error'); return; }
  if (data.isFirstUser) { go('admin'); }
  else { go('home'); }
}

function viewPending() {
  app.innerHTML = '';
  app.appendChild(h(
    '<div class="card center">' +
      '<h1>Access requested</h1>' +
      '<p class="sub">Thanks, ' + esc(STATE.user.name) + '! Your request has been sent to the admin.</p>' +
      '<p class="muted">You will be able to work on assignments as soon as the admin approves you. Check back later or refresh this page.</p>' +
      '<div style="height:10px"></div>' +
      '<button class="btn primary" onclick="location.reload()">Refresh status</button>' +
    '</div>'
  ));
}

function viewDenied() {
  app.innerHTML = '';
  app.appendChild(h(
    '<div class="card center">' +
      '<h1>Access not granted</h1>' +
      '<p class="sub">The admin has not granted access to this account.</p>' +
      '<p class="muted">If you think this is a mistake, contact the admin.</p>' +
    '</div>'
  ));
}

async function viewHome() {
  app.innerHTML = '<div class="loading">Loading assignments...</div>';
  const { data } = await api('/api/assignments');
  const assignments = data.assignments || [];
  app.innerHTML = '';
  const intro = STATE.user.role === 'admin'
    ? 'These are the assignments you generated. Share the app with others so they can request access and practice.'
    : 'Work through the assignments below. Your answers are graded instantly.';
  app.appendChild(h('<div class="card"><h1>Assignments</h1><p class="sub">' + intro + '</p></div>'));
  if (assignments.length === 0) {
    const hint = STATE.user.role === 'admin' ? ' Go to Admin to upload notes and generate one.' : ' Check back soon.';
    app.appendChild(h('<div class="card"><p class="muted center">No assignments yet.' + hint + '</p></div>'));
    return;
  }
  const list = h('<div class="grid"></div>');
  for (const a of assignments) {
    const card = h(
      '<div class="card"><div class="row">' +
        '<div><h3>' + esc(a.title) + '</h3>' +
        '<span class="muted">' + a.questions.length + ' questions - ' + new Date(a.createdAt).toLocaleString() + ' - <span class="pill">' + (a.generator === 'ai' ? 'AI-generated' : 'built-in') + '</span></span></div>' +
        '<div class="spacer"></div>' +
      '</div></div>'
    );
    const rowEl = card.querySelector('.row');
    rowEl.appendChild(mkBtn(STATE.user.role === 'admin' ? 'Preview' : 'Start', 'btn primary small', () => go('take', { id: a.id })));
    if (STATE.user.role === 'admin') {
      rowEl.appendChild(mkBtn('Delete', 'btn danger small', async () => {
        if (!confirm('Delete this assignment? Saved scores for it will also be removed.')) return;
        const r = await api('/api/assignments/' + encodeURIComponent(a.id), { method: 'DELETE' });
        if (r.ok) viewHome(); else alert(r.data.error || 'Failed to delete.');
      }));
    }
    list.appendChild(card);
  }
  app.appendChild(list);
}

async function viewTake(id) {
  app.innerHTML = '<div class="loading">Loading...</div>';
  const { ok, data } = await api('/api/assignments/' + encodeURIComponent(id));
  if (!ok) { app.innerHTML = msg(data.error || 'Could not load assignment.', 'error'); return; }
  const a = data.assignment;
  const isAdmin = STATE.user.role === 'admin';
  app.innerHTML = '';
  app.appendChild(h(
    '<div class="card"><div class="row">' +
      '<div><h1>' + esc(a.title) + '</h1><span class="muted">' + a.questions.length + ' questions</span></div>' +
      '<div class="spacer"></div><button class="btn small" id="backBtn">Back</button>' +
    '</div></div>'
  ));
  document.getElementById('backBtn').onclick = () => go('home');

  const form = h('<div class="card"></div>');
  a.questions.forEach((q, i) => {
    const labels = { mcq: 'multiple choice', truefalse: 'true / false', short: 'short answer', matching: 'matching', ordering: 'ordering' };
    const label = labels[q.type] || q.type;
    const block = h('<div class="q"><div class="qtype">' + label + '</div><h3>Q' + (i + 1) + '. ' + esc(q.prompt) + '</h3><div class="body"></div></div>');
    const body = block.querySelector('.body');

    if (q.type === 'mcq' || q.type === 'truefalse') {
      (q.options || []).forEach(opt => {
        const optEl = h('<label class="opt"><input type="radio" name="q' + i + '" value="' + esc(opt) + '"/> <span>' + esc(opt) + '</span></label>');
        body.appendChild(optEl);
      });
    } else if (q.type === 'matching') {
      (q.left || []).forEach((leftItem, li) => {
        const row = h('<div class="row" style="margin:6px 0"><span style="min-width:40%"><b>' + esc(leftItem) + '</b></span></div>');
        const sel = h('<select name="q' + i + '_' + li + '" data-left="' + esc(leftItem) + '"><option value="">-- choose --</option></select>');
        (q.choices || []).forEach(c => sel.appendChild(h('<option value="' + esc(c) + '">' + esc(c) + '</option>')));
        row.appendChild(sel);
        body.appendChild(row);
      });
    } else if (q.type === 'ordering') {
      const listEl = h('<div class="order-list" data-q="' + i + '"></div>');
      (q.items || []).forEach((item) => {
        const itemEl = h(
          '<div class="order-item" data-val="' + esc(item) + '">' +
            '<span class="order-text">' + esc(item) + '</span>' +
            '<span class="spacer"></span>' +
            '<button type="button" class="btn small order-up">Up</button>' +
            '<button type="button" class="btn small order-down">Down</button>' +
          '</div>'
        );
        itemEl.querySelector('.order-up').onclick = () => { const p = itemEl.previousElementSibling; if (p) listEl.insertBefore(itemEl, p); };
        itemEl.querySelector('.order-down').onclick = () => { const n = itemEl.nextElementSibling; if (n) listEl.insertBefore(n, itemEl); };
        listEl.appendChild(itemEl);
      });
      body.appendChild(h('<p class="muted" style="font-size:12px;margin:0 0 6px">Use Up / Down to put these in the correct order.</p>'));
      body.appendChild(listEl);
    } else {
      body.appendChild(h('<textarea name="q' + i + '" placeholder="Type your answer..."></textarea>'));
    }

    if (isAdmin && q.answer != null) {
      let keyText;
      if (q.type === 'matching') keyText = Object.entries(q.answer).map(([k, v]) => k + ' = ' + v).join('; ');
      else if (q.type === 'ordering') keyText = (q.answer || []).map((v, idx) => (idx + 1) + '. ' + v).join('  ');
      else keyText = q.answer;
      body.appendChild(h('<p class="muted" style="margin-top:8px">Answer key: <b>' + esc(keyText) + '</b></p>'));
    }
    form.appendChild(block);
  });
  app.appendChild(form);

  if (!isAdmin) {
    const actions = h('<div class="card"><div id="result"></div><button class="btn success" id="submitBtn">Submit answers</button></div>');
    app.appendChild(actions);
    actions.querySelector('#submitBtn').onclick = () => submitAnswers(a, form);
  } else {
    app.appendChild(h('<div class="card">' + msg('Admin preview - answer keys are shown above. Approved users see these without the answers and get graded on submit.', 'info') + '</div>'));
  }
}

async function submitAnswers(a, form) {
  const answers = a.questions.map((q, i) => {
    if (q.type === 'mcq' || q.type === 'truefalse') {
      const sel = form.querySelector('input[name="q' + i + '"]:checked');
      return sel ? sel.value : '';
    }
    if (q.type === 'matching') {
      const obj = {};
      form.querySelectorAll('select[name^="q' + i + '_"]').forEach(sel => { obj[sel.dataset.left] = sel.value; });
      return obj;
    }
    if (q.type === 'ordering') {
      const listEl = form.querySelector('.order-list[data-q="' + i + '"]');
      return listEl ? [].slice.call(listEl.querySelectorAll('.order-item')).map(el => el.dataset.val) : [];
    }
    const ta = form.querySelector('textarea[name="q' + i + '"]');
    return ta ? ta.value : '';
  });
  const { ok, data } = await api('/api/assignments/' + encodeURIComponent(a.id) + '/submit', { method: 'POST', body: { answers } });
  const resultBox = document.getElementById('result');
  if (!ok) { resultBox.innerHTML = msg(data.error || 'Could not grade.', 'error'); return; }

  data.results.forEach(r => {
    const block = form.children[r.index];
    if (!block) return;
    const body = block.querySelector('.body');
    if (r.type === 'mcq' || r.type === 'truefalse') {
      block.querySelectorAll('.opt').forEach(optEl => {
        const val = optEl.querySelector('input').value;
        if (val === r.answer) optEl.classList.add('correct');
        if (val === r.given && !r.correct) optEl.classList.add('wrong');
      });
    } else if (r.type === 'matching') {
      const key = Object.entries(r.answer).map(([k, v]) => k + ' = ' + v).join('; ');
      body.appendChild(h('<p class="msg ' + (r.correct ? 'ok' : 'error') + '" style="margin-top:8px">' + (r.correct ? 'Correct' : 'Not quite') + ' - key: <b>' + esc(key) + '</b></p>'));
    } else if (r.type === 'ordering') {
      const key = (r.answer || []).map((v, idx) => (idx + 1) + '. ' + v).join('  ');
      body.appendChild(h('<p class="msg ' + (r.correct ? 'ok' : 'error') + '" style="margin-top:8px">' + (r.correct ? 'Correct order' : 'Not the right order') + ' - correct: <b>' + esc(key) + '</b></p>'));
    } else {
      body.appendChild(h('<p class="muted" style="margin-top:8px">Model answer: <b>' + esc(r.answer) + '</b></p>'));
    }
  });
  const openNote = data.open ? (' - ' + data.open + ' open-ended (self-check)') : '';
  resultBox.innerHTML = msg('Score: ' + data.score + ' / ' + data.total + ' auto-graded' + openNote + '.', (data.total && data.score === data.total) ? 'ok' : 'info');
}

async function viewScores() {
  app.innerHTML = '<div class="loading">Loading scores...</div>';
  const isAdmin = STATE.user.role === 'admin';
  const { data } = await api(isAdmin ? '/api/admin/attempts' : '/api/attempts/me');
  const attempts = data.attempts || [];
  app.innerHTML = '';
  const sub = isAdmin ? 'Every assignment attempt submitted by approved users.' : 'Your assignment attempts and results.';
  app.appendChild(h('<div class="card"><h1>' + (isAdmin ? 'All student scores' : 'My scores') + '</h1><p class="sub">' + sub + '</p></div>'));
  if (attempts.length === 0) {
    app.appendChild(h('<div class="card"><p class="muted center">No attempts recorded yet.</p></div>'));
    return;
  }
  const card = h('<div class="card"></div>');
  const table = h('<table class="table"><thead><tr>' + (isAdmin ? '<th>Student</th>' : '') + '<th>Assignment</th><th>Score</th><th>When</th></tr></thead><tbody></tbody></table>');
  const tb = table.querySelector('tbody');
  attempts.forEach(t => {
    const pct = t.total ? Math.round((t.score / t.total) * 100) : null;
    const studentCell = isAdmin ? ('<td>' + esc(t.userName || '-') + '</td>') : '';
    const pctCell = pct != null ? (' <span class="pill">' + pct + '%</span>') : '';
    const openCell = t.open ? (' <span class="muted">+' + t.open + ' open</span>') : '';
    tb.appendChild(h(
      '<tr>' + studentCell +
      '<td>' + esc(t.assignmentTitle || t.assignmentId) + '</td>' +
      '<td>' + t.score + '/' + t.total + pctCell + openCell + '</td>' +
      '<td class="muted">' + new Date(t.createdAt).toLocaleString() + '</td>' +
      '</tr>'
    ));
  });
  card.appendChild(table);
  app.appendChild(card);
}

function viewAccount() {
  app.innerHTML = '';
  app.appendChild(h(
    '<div class="card" style="max-width:520px">' +
      '<h1>Account</h1>' +
      '<p class="sub">Signed in as <b>' + esc(STATE.user.email) + '</b>' + (STATE.user.role === 'admin' ? ' (admin)' : '') + '.</p>' +
      '<h3 style="margin-top:16px">Change password</h3>' +
      '<div id="pwMsg"></div>' +
      '<label>Current password</label><input id="curPw" type="password" />' +
      '<label>New password</label><input id="newPw" type="password" placeholder="at least 6 characters" />' +
      '<div style="height:12px"></div>' +
      '<button class="btn primary" id="savePw">Update password</button>' +
    '</div>'
  ));
  document.getElementById('savePw').onclick = async () => {
    const currentPassword = document.getElementById('curPw').value;
    const newPassword = document.getElementById('newPw').value;
    const box = document.getElementById('pwMsg');
    const { ok, data } = await api('/api/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    if (!ok) { box.innerHTML = msg(data.error || 'Could not update password.', 'error'); return; }
    box.innerHTML = msg('Password updated successfully.', 'ok');
    document.getElementById('curPw').value = '';
    document.getElementById('newPw').value = '';
  };
}

async function viewAdmin() {
  app.innerHTML = '<div class="loading">Loading admin...</div>';
  const results = await Promise.all([api('/api/admin/users'), api('/api/notes')]);
  const users = results[0].data.users || [];
  const pending = users.filter(u => u.status === 'pending');
  const notes = results[1].data.notes || [];
  app.innerHTML = '';

  const upload = h(
    '<div class="card">' +
      '<h2>1 - Upload notes / module</h2>' +
      '<p class="sub">Paste your study material. The question engine will turn it into an assignment.</p>' +
      '<div id="genMsg"></div>' +
      '<label>Title (optional)</label>' +
      '<input id="noteTitle" placeholder="e.g. Week 4 - Therapeutic communication" />' +
      '<label>Notes content</label>' +
      '<textarea id="noteContent" placeholder="Paste your mental health nursing notes or module text here..."></textarea>' +
      '<label>...or upload a PDF (text-based)</label>' +
      '<input id="pdfFile" type="file" accept="application/pdf,.pdf" />' +
      '<div class="row" style="margin-top:12px">' +
        '<label style="margin:0">Number of questions</label>' +
        '<input id="qCount" type="number" min="1" max="25" value="8" style="width:90px" />' +
        '<div class="spacer"></div>' +
        '<button class="btn primary" id="genBtn">Upload and generate assignment</button>' +
      '</div>' +
    '</div>'
  );
  app.appendChild(upload);
  upload.querySelector('#genBtn').onclick = adminGenerate;

  const reqCard = h(
    '<div class="card">' +
      '<h2>2 - Access requests ' + (pending.length ? '<span class="badge pending">' + pending.length + ' pending</span>' : '') + '</h2>' +
      '<p class="sub">People who registered and are waiting for you to approve them.</p>' +
      '<div id="usersTable"></div>' +
    '</div>'
  );
  app.appendChild(reqCard);
  renderUsersTable(reqCard.querySelector('#usersTable'), users);

  const notesCard = h('<div class="card"><h2>3 - Your uploaded notes</h2>' + (notes.length === 0 ? '<p class="muted">No notes uploaded yet.</p>' : '') + '<div id="notesList"></div></div>');
  app.appendChild(notesCard);
  const nl = notesCard.querySelector('#notesList');
  notes.forEach(n => {
    const row = h('<div class="row" style="border-bottom:1px solid var(--border);padding:8px 0"><div><b>' + esc(n.title) + '</b> <span class="muted">- ' + new Date(n.createdAt).toLocaleString() + '</span></div><div class="spacer"></div></div>');
    row.appendChild(mkBtn('Generate another assignment', 'btn small', async () => {
      const r = await api('/api/assignments/generate', { method: 'POST', body: { noteId: n.id, count: 8 } });
      if (r.ok) go('home'); else alert(r.data.error || 'Failed');
    }));
    row.appendChild(mkBtn('Delete', 'btn danger small', async () => {
      if (!confirm('Delete "' + n.title + '"? This also removes assignments made from it.')) return;
      const r = await api('/api/notes/' + encodeURIComponent(n.id), { method: 'DELETE' });
      if (r.ok) viewAdmin(); else alert(r.data.error || 'Failed to delete.');
    }));
    nl.appendChild(row);
  });
}

function renderUsersTable(container, users) {
  const others = users.filter(u => u.role !== 'admin');
  if (others.length === 0) { container.innerHTML = '<p class="muted">No one else has registered yet. Share the site link so others can request access.</p>'; return; }
  const table = h('<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Reason for access</th><th>Status</th><th></th></tr></thead><tbody></tbody></table>');
  const tbody = table.querySelector('tbody');
  others.forEach(u => {
    const reasonCell = u.reason ? esc(u.reason) : '-';
    const tr = h(
      '<tr>' +
        '<td>' + esc(u.name) + '</td>' +
        '<td class="muted">' + esc(u.email) + '</td>' +
        '<td class="muted" style="max-width:280px">' + reasonCell + '</td>' +
        '<td><span class="badge ' + u.status + '">' + u.status + '</span></td>' +
        '<td class="row" style="justify-content:flex-end"></td>' +
      '</tr>'
    );
    const actions = tr.querySelector('td.row');
    if (u.status !== 'active') actions.appendChild(mkBtn('Approve', 'btn success small', () => setStatus(u.id, 'active')));
    if (u.status !== 'denied') actions.appendChild(mkBtn('Deny', 'btn danger small', () => setStatus(u.id, 'denied')));
    if (u.status === 'active') actions.appendChild(mkBtn('Revoke', 'btn small', () => setStatus(u.id, 'pending')));
    actions.appendChild(mkBtn('Reset password', 'btn small', () => resetUserPassword(u)));
    tbody.appendChild(tr);
  });
  container.innerHTML = '';
  container.appendChild(table);
}

function mkBtn(label, cls, onclick) { const b = h('<button class="' + cls + '">' + label + '</button>'); b.onclick = onclick; return b; }

async function setStatus(userId, status) {
  const { ok, data } = await api('/api/admin/users/status', { method: 'POST', body: { userId, status } });
  if (!ok) { alert(data.error || 'Failed'); return; }
  viewAdmin();
}

async function resetUserPassword(u) {
    const newPassword = prompt('New password for ' + u.name + ' (' + u.email + ') - at least 6 characters:');
  if (newPassword == null) return;
  if (String(newPassword).length < 6) { alert('Password must be at least 6 characters.'); return; }
  const { ok, data } = await api('/api/admin/users/password', { method: 'POST', body: { userId: u.id, newPassword: newPassword } });
  if (!ok) { alert(data.error || 'Failed to reset password.'); return; }
  alert('Password reset for ' + u.name + '. Tell them their new password.');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result || '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function adminGenerate() {
  const title = document.getElementById('noteTitle').value;
  const content = document.getElementById('noteContent').value;
  const count = document.getElementById('qCount').value;
  const pdfInput = document.getElementById('pdfFile');
  const box = document.getElementById('genMsg');
  const pdfFile = pdfInput && pdfInput.files && pdfInput.files[0];

  if (!content.trim() && !pdfFile) { box.innerHTML = msg('Paste some notes or choose a PDF first.', 'error'); return; }
  box.innerHTML = msg('Uploading and generating...', 'info');

  let body = { title: title, content: content };
  if (pdfFile) {
    try {
      const pdfBase64 = await fileToBase64(pdfFile);
      body = { title: title || pdfFile.name.replace(/\.pdf$/i, ''), pdfBase64: pdfBase64 };
    } catch (e) { box.innerHTML = msg('Could not read the PDF file.', 'error'); return; }
  }
  const noteRes = await api('/api/notes', { method: 'POST', body: body });
  if (!noteRes.ok) { box.innerHTML = msg(noteRes.data.error || 'Upload failed.', 'error'); return; }
  const genRes = await api('/api/assignments/generate', { method: 'POST', body: { noteId: noteRes.data.note.id, count: count } });
  if (!genRes.ok) { box.innerHTML = msg(genRes.data.error || 'Generation failed.', 'error'); return; }
  const g = genRes.data.assignment;
  box.innerHTML = msg('Created "' + g.title + '" with ' + g.questions.length + ' questions (' + (g.generator === 'ai' ? 'AI' : 'built-in') + ').', 'ok');
  document.getElementById('noteContent').value = '';
  document.getElementById('noteTitle').value = '';
  if (document.getElementById('pdfFile')) document.getElementById('pdfFile').value = '';
}

go('home');
