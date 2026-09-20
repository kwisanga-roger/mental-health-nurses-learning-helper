// Authentication + roles + approval logic. Uses Node's built-in crypto (no deps).
import crypto from 'node:crypto';
import { load, save, getUsers, getSessions, findUserByEmail, findSession, findUserById, newId } from './db.js';

const SESSION_COOKIE = 'ah_session';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function registerUser({ name, email, password, reason }) {
  const db = load();
  if (!name || !email || !password) {
    return { error: 'Name, email, and password are required.' };
  }
  if (String(password).length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }
  if (findUserByEmail(email)) {
    return { error: 'An account with that email already exists.' };
  }
  const isFirstUser = db.users.length === 0;
  const { hash, salt } = hashPassword(password);
  const user = {
    id: newId('user'),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: hash,
    salt,
    role: isFirstUser ? 'admin' : 'user',
    status: isFirstUser ? 'active' : 'pending',
    reason: reason ? String(reason).trim().slice(0, 500) : '',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save();
  return { user: publicUser(user), isFirstUser };
}

export function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Roger';
  if (!email || !password) return { seeded: false };
  if (findUserByEmail(email)) return { seeded: false, reason: 'exists' };
  const db = load();
  const { hash, salt } = hashPassword(password);
  const user = {
    id: newId('user'),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: hash,
    salt,
    role: 'admin',
    status: 'active',
    reason: '',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save();
  return { seeded: true, email: user.email };
}

export function login({ email, password }) {
  const user = findUserByEmail(email);
  if (!user) return { error: 'Invalid email or password.' };
  if (!verifyPassword(password, user.salt, user.passwordHash)) {
    return { error: 'Invalid email or password.' };
  }
  const token = crypto.randomBytes(32).toString('hex');
  const db = load();
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  save();
  return { token, user: publicUser(user) };
}

export function logout(token) {
  const db = load();
  db.sessions = db.sessions.filter(s => s.token !== token);
  save();
}

export function userFromRequest(req) {
  const token = readSessionCookie(req);
  if (!token) return null;
  const session = findSession(token);
  if (!session) return null;
  const user = findUserById(session.userId);
  return user || null;
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, reason: u.reason || '', createdAt: u.createdAt };
}

export function changePassword(userId, currentPassword, newPassword) {
  const db = load();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { error: 'User not found.' };
  if (!verifyPassword(currentPassword, user.salt, user.passwordHash)) {
    return { error: 'Current password is incorrect.' };
  }
  if (!newPassword || String(newPassword).length < 6) {
    return { error: 'New password must be at least 6 characters.' };
  }
  const { hash, salt } = hashPassword(newPassword);
  user.passwordHash = hash;
  user.salt = salt;
  save();
  return { ok: true };
}

export function adminSetPassword(userId, newPassword) {
  const db = load();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { error: 'User not found.' };
  if (user.role === 'admin') return { error: 'Cannot reset the admin password here. Use the Account page.' };
  if (!newPassword || String(newPassword).length < 6) {
    return { error: 'New password must be at least 6 characters.' };
  }
  const { hash, salt } = hashPassword(newPassword);
  user.passwordHash = hash;
  user.salt = salt;
  save();
  return { ok: true };
}

export function setUserStatus(userId, status) {
  const db = load();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { error: 'User not found.' };
  if (user.role === 'admin') return { error: 'Cannot change the admin account status.' };
  if (!['active', 'pending', 'denied'].includes(status)) return { error: 'Invalid status.' };
  user.status = status;
  save();
  return { user: publicUser(user) };
}

export function readSessionCookie(req) {
  const raw = req.headers['cookie'] || '';
  const parts = raw.split(';').map(s => s.trim());
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx);
    const v = p.slice(idx + 1);
    if (k === SESSION_COOKIE) return decodeURIComponent(v);
  }
  return null;
}

export function sessionCookieHeader(token) {
  const maxAge = 7 * 24 * 60 * 60;
  return SESSION_COOKIE + '=' + encodeURIComponent(token) + '; HttpOnly; Path=/; Max-Age=' + maxAge + '; SameSite=Lax';
}

export function clearCookieHeader() {
  return SESSION_COOKIE + '=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}
