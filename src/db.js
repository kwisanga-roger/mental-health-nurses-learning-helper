// Simple JSON-file database. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  users: [],
  sessions: [],
  notes: [],
  assignments: [],
  attempts: [],
  meta: { initialized: true },
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = null;

export function load() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    cache = structuredClone(DEFAULT_DATA);
    save();
    return cache;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = { ...structuredClone(DEFAULT_DATA), ...parsed };
    return cache;
  } catch (err) {
    console.error('Failed to read db.json, starting fresh:', err.message);
    cache = structuredClone(DEFAULT_DATA);
    save();
    return cache;
  }
}

export function save() {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

export function getUsers() { return load().users; }
export function getSessions() { return load().sessions; }
export function getNotes() { return load().notes; }
export function getAssignments() { return load().assignments; }
export function getAttempts() { return load().attempts; }

export function findUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === String(email).toLowerCase());
}
export function findUserById(id) {
  return getUsers().find(u => u.id === id);
}
export function findSession(token) {
  return getSessions().find(s => s.token === token);
}

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
