// Anmeldung: Passwörter (scrypt), Sessions (Cookie, in der DB nur als Hash) und Login-Bremse.
import { Router } from 'express';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, tx } from './db.js';
import { HttpError, bad } from './errors.js';
import { ALL_KEYS } from './permissions.js';

const scryptAsync = promisify(scrypt);
const COOKIE = 'pd_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const LOG_N = 15; // scrypt-Kostenfaktor N = 2^15, steht im Hash und kann später erhöht werden
const KEYLEN = 64;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

/* ---------- Passwörter ---------- */

const derive = (password, salt, logN) => scryptAsync(password, salt, KEYLEN, { N: 2 ** logN, maxmem: 256 * 2 ** logN * 8 });

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw bad(`Das Passwort muss mindestens ${MIN_PASSWORD} Zeichen haben`);
  if (password.length > MAX_PASSWORD) throw bad(`Das Passwort darf höchstens ${MAX_PASSWORD} Zeichen haben`);
  return password;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, LOG_N);
  return `scrypt$${LOG_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, logN, salt, hash] = String(stored).split('$');
  const n = Number(logN);
  if (scheme !== 'scrypt' || !hash || typeof password !== 'string' || password.length > MAX_PASSWORD || !Number.isInteger(n) || n < 10 || n > 20) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), n);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Auch bei unbekanntem Benutzernamen wird gerechnet, damit die Antwortzeit nichts verrät.
let dummyHash;
const dummy = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

/* ---------- Benutzer ---------- */

const USER_SQL = `SELECT u.id, u.benutzername, u.name, u.email, u.aktiv, u.password_hash, r.id AS role_id, r.name AS role_name, r.permissions, r.system
  FROM users u JOIN roles r ON r.id = u.role_id`;

export function rolePermissions(role) {
  if (role.system) return ALL_KEYS;
  let list = [];
  try {
    list = JSON.parse(role.permissions);
  } catch {
    // defekter Eintrag = keine Rechte
  }
  return ALL_KEYS.filter((k) => Array.isArray(list) && list.includes(k));
}

function toUser(row) {
  return {
    id: row.id,
    benutzername: row.benutzername,
    name: row.name,
    email: row.email,
    role: { id: row.role_id, name: row.role_name },
    permissions: new Set(rolePermissions(row)),
  };
}

/** Form `Me` aus src/types.ts */
export const me = (user) => ({ ...user, permissions: [...user.permissions] });

export const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

/** Stammdaten eines Benutzers prüfen (Ersteinrichtung und Verwaltung). */
export function cleanUser(body) {
  const benutzername = String(body.benutzername ?? '').trim();
  if (!/^\S{3,64}$/.test(benutzername)) throw bad('benutzername: 3 bis 64 Zeichen ohne Leerzeichen');
  const name = String(body.name ?? '').trim().slice(0, 200);
  if (!name) throw bad('name: Pflichtfeld fehlt');
  const email = String(body.email ?? '').trim().slice(0, 200);
  if (email && !/^\S+@\S+$/.test(email)) throw bad('email: Ungültige E-Mail-Adresse');
  return { benutzername, name, email };
}

/* ---------- Sessions ---------- */

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function setCookie(req, res, token, maxAgeMs) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`);
}

function readToken(req) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return null;
}

let lastSweep = 0;
function sweep(now) {
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

function startSession(req, res, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), userId, now + SESSION_MS);
  db.prepare('UPDATE users SET last_login=? WHERE id=?').run(new Date(now).toISOString(), userId);
  setCookie(req, res, token, SESSION_MS);
}

/** Beendet alle Sessions eines Benutzers, optional außer der angegebenen. */
export function revokeSessions(userId, exceptHash = '') {
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, exceptHash);
}

/** Setzt req.user, wenn ein gültiges Session-Cookie vorliegt; verlängert die Session gleitend. */
export function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  const now = Date.now();
  sweep(now);
  const hash = sha256(token);
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash=?').get(hash);
  if (!session || session.expires_at <= now) return next();
  const row = db.prepare(`${USER_SQL} WHERE u.id=?`).get(session.user_id);
  if (!row || !row.aktiv) return next();
  req.user = toUser(row);
  req.sessionHash = hash;
  // Nicht bei jedem Aufruf schreiben: höchstens einmal je Minute verlängern
  if (session.expires_at - now < SESSION_MS - 60 * 1000) {
    db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(now + SESSION_MS, hash);
    setCookie(req, res, token, SESSION_MS);
  }
  next();
}

export function requireLogin(req, _res, next) {
  next(req.user ? undefined : new HttpError(401, 'Nicht angemeldet'));
}

export const requirePermission = (...anyOf) => (req, _res, next) =>
  next(anyOf.some((p) => req.user.permissions.has(p)) ? undefined : new HttpError(403, 'Keine Berechtigung'));

/* ---------- Login-Bremse ---------- */

const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const fails = new Map(); // "benutzername|ip" -> { count, until }

function throttleKey(req, benutzername) {
  return `${benutzername.toLowerCase()}|${req.ip}`;
}
function blockedFor(key, now) {
  const f = fails.get(key);
  if (f && f.until <= now) fails.delete(key);
  return f && f.until > now && f.count >= MAX_FAILS ? f.until - now : 0;
}
/** Zählt einen Versuch – vor der Passwortprüfung, damit parallele Anfragen die Sperre nicht unterlaufen. */
function noteAttempt(key, now) {
  if (fails.size > 5000) for (const [k, f] of fails) if (f.until <= now) fails.delete(k);
  // Notbremse gegen Speicherverbrauch durch massenhaft erfundene Benutzernamen
  if (fails.size > 50000) fails.clear();
  const f = fails.get(key);
  if (f && f.until > now) f.count++;
  else fails.set(key, { count: 1, until: now + FAIL_WINDOW_MS });
}
export const resetLoginThrottle = () => fails.clear();

/* ---------- Routen ---------- */

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  res.json({ setupRequired: userCount() === 0, user: req.user ? me(req.user) : null });
});

authRouter.post('/setup', async (req, res) => {
  const body = req.body ?? {};
  if (userCount() > 0) throw new HttpError(403, 'Die Ersteinrichtung ist bereits abgeschlossen');
  const fields = cleanUser(body);
  const hash = await hashPassword(checkPassword(body.password));
  const id = tx(() => {
    // Erneut prüfen: während der Hash-Berechnung könnte eine zweite Einrichtung durchgelaufen sein
    if (userCount() > 0) throw new HttpError(403, 'Die Ersteinrichtung ist bereits abgeschlossen');
    const role = db.prepare('SELECT id FROM roles WHERE system=1').get();
    const info = db
      .prepare('INSERT INTO users (benutzername, name, email, password_hash, role_id, aktiv) VALUES (?,?,?,?,?,1)')
      .run(fields.benutzername, fields.name, fields.email, hash, role.id);
    return Number(info.lastInsertRowid);
  });
  startSession(req, res, id);
  res.status(201).json(me(toUser(db.prepare(`${USER_SQL} WHERE u.id=?`).get(id))));
});

authRouter.post('/login', async (req, res) => {
  const benutzername = String(req.body?.benutzername ?? '').trim().slice(0, 64);
  const password = req.body?.password;
  const key = throttleKey(req, benutzername);
  const wait = blockedFor(key, Date.now());
  if (wait) {
    res.setHeader('Retry-After', Math.ceil(wait / 1000));
    throw new HttpError(429, `Zu viele Fehlversuche. Bitte in ${Math.ceil(wait / 60000)} Minuten erneut versuchen.`);
  }
  // Synchron vor dem ersten await zählen; eine erfolgreiche Anmeldung setzt den Zähler zurück
  noteAttempt(key, Date.now());
  const row = db.prepare(`${USER_SQL} WHERE u.benutzername=?`).get(benutzername);
  const ok = await verifyPassword(password, row ? row.password_hash : await dummy());
  // Gleiche Meldung für unbekannt, falsches Passwort und deaktiviert – kein Hinweis auf gültige Benutzernamen
  if (!row || !ok || !row.aktiv) throw new HttpError(401, 'Benutzername oder Passwort ist falsch');
  fails.delete(key);
  sweep(Date.now());
  startSession(req, res, row.id);
  res.json(me(toUser(row)));
});

authRouter.post('/logout', (req, res) => {
  if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
  setCookie(req, res, '', 0);
  res.status(204).end();
});

authRouter.post('/password', requireLogin, async (req, res) => {
  const { current, next } = req.body ?? {};
  const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!(await verifyPassword(current, row.password_hash))) throw bad('Das aktuelle Passwort ist falsch');
  const hash = await hashPassword(checkPassword(next));
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  revokeSessions(req.user.id, req.sessionHash);
  res.status(204).end();
});
