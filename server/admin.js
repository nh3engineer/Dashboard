// Benutzer- und Rollenverwaltung (nur mit benutzer.verwalten).
import { Router } from 'express';
import { checkPassword, cleanUser, hashPassword, revokeSessions, rolePermissions } from './auth.js';
import { db, tx } from './db.js';
import { bad, notFound } from './errors.js';
import { cleanPermissions, PERMISSIONS } from './permissions.js';

export const adminRouter = Router();

const idOf = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw notFound();
  return id;
};
const object = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Ungültige Daten');
  return body;
};

adminRouter.get('/permissions', (_req, res) => res.json(PERMISSIONS));

/* ---------- Rollen ---------- */

const toRole = (r) => ({ id: r.id, name: r.name, beschreibung: r.beschreibung, permissions: rolePermissions(r), system: !!r.system });
const getRole = (id) => db.prepare('SELECT * FROM roles WHERE id=?').get(id);

function cleanRole(body) {
  const name = String(body.name ?? '').trim().slice(0, 100);
  if (!name) throw bad('name: Pflichtfeld fehlt');
  let permissions;
  try {
    permissions = cleanPermissions(body.permissions ?? []);
  } catch (e) {
    throw bad(e.message);
  }
  return { name, beschreibung: String(body.beschreibung ?? '').trim().slice(0, 500), permissions };
}
function assertRoleNameFree(name, exceptId = 0) {
  if (db.prepare('SELECT 1 FROM roles WHERE name=? AND id<>?').get(name, exceptId)) throw bad(`Eine Rolle mit dem Namen „${name}“ gibt es bereits`);
}

adminRouter.get('/roles', (_req, res) => res.json(db.prepare('SELECT * FROM roles ORDER BY system DESC, id').all().map(toRole)));

adminRouter.post('/roles', (req, res) => {
  const r = cleanRole(object(req.body));
  assertRoleNameFree(r.name);
  const info = db.prepare('INSERT INTO roles (name, beschreibung, permissions, system) VALUES (?,?,?,0)').run(r.name, r.beschreibung, JSON.stringify(r.permissions));
  res.status(201).json(toRole(getRole(Number(info.lastInsertRowid))));
});

adminRouter.put('/roles/:id', (req, res) => {
  const id = idOf(req);
  const existing = getRole(id);
  if (!existing) throw notFound();
  if (existing.system) throw bad('Die Systemrolle „Administrator“ kann nicht geändert werden');
  const r = cleanRole({ ...toRole(existing), ...object(req.body) });
  assertRoleNameFree(r.name, id);
  db.prepare('UPDATE roles SET name=?, beschreibung=?, permissions=? WHERE id=?').run(r.name, r.beschreibung, JSON.stringify(r.permissions), id);
  res.json(toRole(getRole(id)));
});

adminRouter.delete('/roles/:id', (req, res) => {
  const id = idOf(req);
  const existing = getRole(id);
  if (!existing) throw notFound();
  if (existing.system) throw bad('Die Systemrolle „Administrator“ kann nicht gelöscht werden');
  const n = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role_id=?').get(id).n;
  if (n) throw bad(`Die Rolle ist noch ${n === 1 ? 'einem Benutzer' : `${n} Benutzern`} zugewiesen. Bitte zuerst eine andere Rolle zuweisen.`);
  db.prepare('DELETE FROM roles WHERE id=?').run(id);
  res.status(204).end();
});

/* ---------- Benutzer ---------- */

const USERS = 'SELECT u.*, r.system FROM users u JOIN roles r ON r.id = u.role_id';
const getUser = (id) => db.prepare(`${USERS} WHERE u.id=?`).get(id);
const projectIds = (userId) => db.prepare('SELECT project_id FROM user_projects WHERE user_id=? ORDER BY project_id').all(userId).map((r) => r.project_id);
const toUser = (u) => ({
  id: u.id,
  benutzername: u.benutzername,
  name: u.name,
  email: u.email,
  role_id: u.role_id,
  aktiv: !!u.aktiv,
  project_ids: projectIds(u.id),
  last_login: u.last_login,
});

function cleanAccount(body) {
  const fields = cleanUser(body);
  const role = Number.isInteger(body.role_id) ? getRole(body.role_id) : null;
  if (!role) throw bad('role_id: Rolle nicht gefunden');
  if (typeof body.aktiv !== 'boolean' && body.aktiv !== 0 && body.aktiv !== 1) throw bad('aktiv: true oder false erwartet');
  const ids = body.project_ids ?? [];
  if (!Array.isArray(ids) || ids.some((p) => !Number.isInteger(p))) throw bad('project_ids: Liste von Projekt-IDs erwartet');
  const project_ids = [...new Set(ids)];
  const known = new Set(db.prepare('SELECT id FROM projects').all().map((p) => p.id));
  if (project_ids.some((p) => !known.has(p))) throw bad('project_ids: Projekt nicht gefunden');
  return { ...fields, role, aktiv: body.aktiv ? 1 : 0, project_ids };
}
function assertUsernameFree(benutzername, exceptId = 0) {
  if (db.prepare('SELECT 1 FROM users WHERE benutzername=? AND id<>?').get(benutzername, exceptId)) throw bad(`Den Benutzernamen „${benutzername}“ gibt es bereits`);
}
function setProjects(userId, ids) {
  db.prepare('DELETE FROM user_projects WHERE user_id=?').run(userId);
  const add = db.prepare('INSERT INTO user_projects (user_id, project_id) VALUES (?,?)');
  for (const p of ids) add.run(userId, p);
}
/** Ohne aktiven Administrator ließe sich die Benutzerverwaltung nie wieder öffnen. */
function assertAdminRemains(exceptId) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.system=1 AND u.aktiv=1 AND u.id<>?`).get(exceptId).n;
  if (!n) throw bad('Das ist der letzte aktive Administrator. Mindestens ein aktiver Administrator muss bestehen bleiben.');
}

adminRouter.get('/users', (_req, res) => res.json(db.prepare(`${USERS} ORDER BY u.name COLLATE NOCASE, u.id`).all().map(toUser)));

adminRouter.post('/users', async (req, res) => {
  const body = object(req.body);
  const u = cleanAccount({ aktiv: true, ...body });
  assertUsernameFree(u.benutzername);
  const hash = await hashPassword(checkPassword(body.password));
  const id = tx(() => {
    assertUsernameFree(u.benutzername);
    const info = db
      .prepare('INSERT INTO users (benutzername, name, email, password_hash, role_id, aktiv) VALUES (?,?,?,?,?,?)')
      .run(u.benutzername, u.name, u.email, hash, u.role.id, u.aktiv);
    setProjects(Number(info.lastInsertRowid), u.project_ids);
    return Number(info.lastInsertRowid);
  });
  res.status(201).json(toUser(getUser(id)));
});

adminRouter.put('/users/:id', async (req, res) => {
  const id = idOf(req);
  const body = object(req.body);
  if (!getUser(id)) throw notFound();
  const password = body.password === undefined || body.password === null || body.password === '' ? null : checkPassword(body.password);
  const hash = password && (await hashPassword(password));
  tx(() => {
    // Nach der Hash-Berechnung neu lesen – der Stand kann sich inzwischen geändert haben
    const existing = getUser(id);
    if (!existing) throw notFound();
    const u = cleanAccount({ ...toUser(existing), ...body });
    assertUsernameFree(u.benutzername, id);
    const wasAdmin = existing.system && existing.aktiv;
    if (wasAdmin && !(u.role.system && u.aktiv)) assertAdminRemains(id);
    db.prepare('UPDATE users SET benutzername=?, name=?, email=?, role_id=?, aktiv=? WHERE id=?').run(u.benutzername, u.name, u.email, u.role.id, u.aktiv, id);
    if (hash) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, id);
    setProjects(id, u.project_ids);
    // Deaktiviert: überall abmelden. Neues Passwort: alle anderen Sitzungen beenden (die eigene bleibt, wenn man sich selbst bearbeitet).
    if (!u.aktiv) revokeSessions(id);
    else if (hash) revokeSessions(id, id === req.user.id ? req.sessionHash : '');
  });
  res.json(toUser(getUser(id)));
});

adminRouter.delete('/users/:id', (req, res) => {
  const id = idOf(req);
  const existing = getUser(id);
  if (!existing) throw notFound();
  if (id === req.user.id) throw bad('Das eigene Benutzerkonto kann nicht gelöscht werden');
  if (existing.system && existing.aktiv) assertAdminRemains(id);
  // Sessions und Projektzuweisungen gehen über ON DELETE CASCADE mit
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.status(204).end();
});
