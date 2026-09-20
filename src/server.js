// Assignment Helper — zero-dependency Node.js HTTP server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { load, save, getUsers, getNotes, getAssignments, getAttempts, newId } from './db.js';
import {
  registerUser, login, logout, userFromRequest, publicUser, setUserStatus,
  changePassword, adminSetPassword, seedAdmin, sessionCookieHeader, clearCookieHeader,
} from './auth.js';
import { generateAssignment, aiConfigured } from './generator.js';
import { extractPdfText } from './pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const body = await readBody(req);
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function requireUser(req, res) {
  const user = userFromRequest(req);
  if (!user) { json(res, 401, { error: 'Not signed in.' }); return null; }
  return user;
}
function requireActive(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.status !== 'active') {
    json(res, 403, { error: 'Your access is not approved yet.', status: user.status });
    return null;
  }
  return user;
}
function requireAdmin(req, res) {
  const user = requireActive(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { json(res, 403, { error: 'Admin only.' }); return null; }
  return user;
}

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/register' && req.method === 'POST') {
    const { name, email, password, reason } = await readJson(req);
    const result = registerUser({ name, email, password, reason });
    if (result.error) return json(res, 400, result);
    const li = login({ email, password });
    return json(res, 200, { user: result.user, isFirstUser: result.isFirstUser },
      { 'Set-Cookie': sessionCookieHeader(li.token) });
  }

  if (p === '/api/change-password' && req.method === 'POST') {
    const user = requireUser(req, res); if (!user) return;
    const { currentPassword, newPassword } = await readJson(req);
    const result = changePassword(user.id, currentPassword, newPassword);
    if (result.error) return json(res, 400, result);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/login' && req.method === 'POST') {
    const { email, password } = await readJson(req);
    const result = login({ email, password });
    if (result.error) return json(res, 400, result);
    return json(res, 200, { user: result.user }, { 'Set-Cookie': sessionCookieHeader(result.token) });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim())
      .find(s => s.startsWith('ah_session='));
    if (token) logout(decodeURIComponent(token.split('=')[1]));
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader() });
  }

  if (p === '/api/me' && req.method === 'GET') {
    const user = userFromRequest(req);
    return json(res, 200, { user: publicUser(user), aiEnabled: aiConfigured() });
  }

  if (p === '/api/admin/users' && req.method === 'GET') {
    const admin = requireAdmin(req, res); if (!admin) return;
    return json(res, 200, { users: getUsers().map(publicUser) });
  }

  if (p === '/api/admin/users/status' && req.method === 'POST') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const { userId, status } = await readJson(req);
    const result = setUserStatus(userId, status);
    if (result.error) return json(res, 400, result);
    return json(res, 200, result);
  }

  if (p === '/api/admin/users/password' && req.method === 'POST') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const { userId, newPassword } = await readJson(req);
    const result = adminSetPassword(userId, newPassword);
    if (result.error) return json(res, 400, result);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/notes' && req.method === 'GET') {
    const user = requireActive(req, res); if (!user) return;
    const notes = getNotes().map(n => ({ id: n.id, title: n.title, createdAt: n.createdAt }));
    return json(res, 200, { notes });
  }

  if (p === '/api/notes' && req.method === 'POST') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const body = await readJson(req);
    let { title, content } = body;
    if (body.pdfBase64) {
      try {
        const buf = Buffer.from(String(body.pdfBase64), 'base64');
        const extracted = extractPdfText(buf);
        if (!extracted || extracted.trim().length < 20) {
          return json(res, 400, { error: 'Could not extract readable text from that PDF. It may be a scanned image - please paste the text instead.' });
        }
        content = extracted;
      } catch (err) {
        return json(res, 400, { error: 'Failed to read the PDF file.' });
      }
    }
    if (!content || !String(content).trim()) return json(res, 400, { error: 'Note content is required.' });
    const db = load();
    const note = {
      id: newId('note'),
      title: (title && String(title).trim()) || 'Untitled notes',
      content: String(content),
      ownerId: admin.id,
      createdAt: new Date().toISOString(),
    };
    db.notes.push(note);
    save();
    return json(res, 201, { note: { id: note.id, title: note.title, createdAt: note.createdAt } });
  }

  const noteDelMatch = p.match(/^\/api\/notes\/([^/]+)$/);
  if (noteDelMatch && req.method === 'DELETE') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const db = load();
    const id = noteDelMatch[1];
    const before = db.notes.length;
    db.notes = db.notes.filter(n => n.id !== id);
    if (db.notes.length === before) return json(res, 404, { error: 'Note not found.' });
    db.assignments = db.assignments.filter(a => a.noteId !== id);
    save();
    return json(res, 200, { ok: true });
  }

  const asgDelMatch = p.match(/^\/api\/assignments\/([^/]+)$/);
  if (asgDelMatch && req.method === 'DELETE') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const db = load();
    const id = asgDelMatch[1];
    const before = db.assignments.length;
    db.assignments = db.assignments.filter(a => a.id !== id);
    if (db.assignments.length === before) return json(res, 404, { error: 'Assignment not found.' });
    db.attempts = db.attempts.filter(t => t.assignmentId !== id);
    save();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/assignments/generate' && req.method === 'POST') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const { noteId, count } = await readJson(req);
    const note = getNotes().find(n => n.id === noteId);
    if (!note) return json(res, 404, { error: 'Note not found.' });
    const n = Math.min(Math.max(parseInt(count, 10) || 8, 1), 25);
    const { generator, questions } = await generateAssignment(note.content, n);
    const db = load();
    const assignment = {
      id: newId('asg'),
      noteId: note.id,
      title: 'Assignment: ' + note.title,
      questions,
      generator,
      createdAt: new Date().toISOString(),
    };
    db.assignments.push(assignment);
    save();
    return json(res, 201, { assignment: publicAssignment(assignment, true) });
  }

  if (p === '/api/assignments' && req.method === 'GET') {
    const user = requireActive(req, res); if (!user) return;
    const includeAnswers = user.role === 'admin';
    const assignments = getAssignments()
      .map(a => publicAssignment(a, includeAnswers))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json(res, 200, { assignments });
  }

  const takeMatch = p.match(/^\/api\/assignments\/([^/]+)$/);
  if (takeMatch && req.method === 'GET') {
    const user = requireActive(req, res); if (!user) return;
    const a = getAssignments().find(x => x.id === takeMatch[1]);
    if (!a) return json(res, 404, { error: 'Assignment not found.' });
    const includeAnswers = user.role === 'admin';
    return json(res, 200, { assignment: publicAssignment(a, includeAnswers) });
  }

  const submitMatch = p.match(/^\/api\/assignments\/([^/]+)\/submit$/);
  if (submitMatch && req.method === 'POST') {
    const user = requireActive(req, res); if (!user) return;
    const a = getAssignments().find(x => x.id === submitMatch[1]);
    if (!a) return json(res, 404, { error: 'Assignment not found.' });
    const { answers } = await readJson(req);
    const results = a.questions.map((q, i) => gradeQuestion(q, i, answers ? answers[i] : undefined));
    const gradable = results.filter(r => r.correct !== null);
    const score = gradable.filter(r => r.correct).length;
    const total = gradable.length;
    const open = results.length - gradable.length;
    if (user.role !== 'admin') {
      const db = load();
      db.attempts.push({
        id: newId('att'),
        assignmentId: a.id,
        assignmentTitle: a.title,
        userId: user.id,
        userName: user.name,
        score, total, open,
        createdAt: new Date().toISOString(),
      });
      save();
    }
    return json(res, 200, { results, score, total, open });
  }

  if (p === '/api/attempts/me' && req.method === 'GET') {
    const user = requireActive(req, res); if (!user) return;
    const mine = getAttempts().filter(t => t.userId === user.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json(res, 200, { attempts: mine });
  }

  if (p === '/api/admin/attempts' && req.method === 'GET') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const all = getAttempts().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json(res, 200, { attempts: all });
  }

  return json(res, 404, { error: 'Not found.' });
}

function gradeQuestion(q, index, rawGiven) {
  if (q.type === 'mcq' || q.type === 'truefalse') {
    const given = rawGiven != null ? String(rawGiven).trim() : '';
    const correct = given.toLowerCase() === String(q.answer).trim().toLowerCase();
    return { index, type: q.type, given, answer: q.answer, correct };
  }
  if (q.type === 'ordering') {
    const given = Array.isArray(rawGiven) ? rawGiven.map(String) : [];
    const answer = q.answer;
    const correct = given.length === answer.length && given.every((v, i) => v === answer[i]);
    return { index, type: q.type, given, answer, correct };
  }
  if (q.type === 'matching') {
    const given = (rawGiven && typeof rawGiven === 'object') ? rawGiven : {};
    const pairs = q.answer;
    const keys = Object.keys(pairs);
    const correct = keys.length > 0 && keys.every(k => String(given[k] || '') === String(pairs[k]));
    return { index, type: q.type, given, answer: pairs, correct };
  }
  const given = rawGiven != null ? String(rawGiven).trim() : '';
  return { index, type: q.type, given, answer: q.answer, correct: null };
}

function publicAssignment(a, includeAnswers) {
  return {
    id: a.id,
    noteId: a.noteId,
    title: a.title,
    generator: a.generator,
    createdAt: a.createdAt,
    questions: a.questions.map(q => {
      const base = { type: q.type, prompt: q.prompt, options: q.options || [] };
      if (q.type === 'matching') {
        base.left = q.left || Object.keys(q.answer || {});
        base.choices = q.choices || shuffleArr(Object.values(q.answer || {}));
      }
      if (q.type === 'ordering') {
        base.items = q.items || shuffleArr((q.answer || []).slice());
      }
      if (includeAnswers) base.answer = q.answer;
      return base;
    }),
  };
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (!path.extname(rel)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, d2) => {
          if (e2) return send(res, 404, 'Not found');
          send(res, 200, d2, { 'Content-Type': MIME['.html'] });
        });
      }
      return send(res, 404, 'Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    console.error('Request error:', err);
    json(res, 500, { error: 'Server error.' });
  }
});

server.listen(PORT, () => {
  load();
  const seed = seedAdmin();
  console.log('Assignment Helper running at http://localhost:' + PORT);
  console.log('AI provider: ' + (aiConfigured() ? (process.env.AI_PROVIDER || 'configured') : 'built-in generator (no key set)'));
  if (seed.seeded) console.log('Seeded admin account: ' + seed.email);
  console.log('The FIRST account you register becomes the admin (unless one was seeded).');
});
