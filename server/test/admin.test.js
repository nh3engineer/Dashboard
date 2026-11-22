import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, addUser, setupAdmin, startApp } from './helpers.js';

let app;
let admin;
let roles;
const role = (name) => roles.find((r) => r.name === name);
before(async () => {
  app = await startApp();
  admin = await setupAdmin(app);
  roles = (await admin.get('/api/admin/roles')).body;
});
after(() => app.close());

test('Standardrollen laut Vertrag', async () => {
  const perms = (await admin.get('/api/admin/permissions')).body;
  assert.equal(perms.length, 22);
  assert.deepEqual(Object.keys(perms[0]).sort(), ['group', 'key', 'label']);
  assert.deepEqual(roles.map((r) => r.name), ['Administrator', 'Geschäftsführung', 'Management', 'Projektleitung', 'Kunde / Bauherr']);
  assert.equal(role('Administrator').system, true);
  assert.equal(role('Administrator').permissions.length, 22);
  const gf = role('Geschäftsführung').permissions;
  assert.equal(gf.length, 21);
  assert.equal(gf.includes('benutzer.verwalten'), false);
  const mgmt = role('Management').permissions;
  assert.ok(mgmt.includes('kpi.management') && mgmt.includes('projekte.alle') && mgmt.includes('kosten.ansehen'));
  assert.equal(mgmt.some((p) => p.endsWith('.bearbeiten')), false);
  const pl = role('Projektleitung').permissions;
  assert.equal(pl.includes('projekte.alle'), false);
  assert.equal(pl.includes('kpi.management'), false);
  assert.ok(pl.includes('risiken.bearbeiten') && pl.includes('feedback.ansehen'));
  assert.deepEqual([...role('Kunde / Bauherr').permissions].sort(), ['aenderungen.ansehen', 'berichte.erstellen', 'feedback.abgeben', 'termine.ansehen']);
});

test('Verwaltung nur mit benutzer.verwalten', async () => {
  const { client: gf } = await addUser(app, admin, 'Geschäftsführung', 'chefin');
  for (const path of ['/api/admin/users', '/api/admin/roles', '/api/admin/permissions']) assert.equal((await gf.get(path)).status, 403, path);
  assert.equal((await gf.post('/api/admin/users', {})).status, 403);
  assert.equal((await gf.del('/api/admin/users/1')).status, 403);
});

test('Systemrolle ist unveränderlich', async () => {
  const id = role('Administrator').id;
  assert.equal((await admin.put(`/api/admin/roles/${id}`, { permissions: [] })).status, 400);
  assert.equal((await admin.del(`/api/admin/roles/${id}`)).status, 400);
  assert.equal((await admin.get('/api/admin/roles')).body[0].permissions.length, 22);
});

test('Rollen anlegen, ändern, löschen; unbekannte Berechtigungen werden abgelehnt', async () => {
  assert.equal((await admin.post('/api/admin/roles', { name: 'Test', permissions: ['kosten.ansehen', 'alles.duerfen'] })).status, 400);
  assert.equal((await admin.post('/api/admin/roles', { name: '', permissions: [] })).status, 400);
  assert.equal((await admin.post('/api/admin/roles', { name: 'Management', permissions: [] })).status, 400);
  const created = await admin.post('/api/admin/roles', { name: 'Controlling', beschreibung: 'nur Kosten', permissions: ['kosten.ansehen', 'projekte.alle'] });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: created.body.id, name: 'Controlling', beschreibung: 'nur Kosten', permissions: ['projekte.alle', 'kosten.ansehen'], system: false });
  const changed = await admin.put(`/api/admin/roles/${created.body.id}`, { permissions: ['kosten.ansehen'] });
  assert.deepEqual(changed.body.permissions, ['kosten.ansehen']);
  assert.equal(changed.body.name, 'Controlling');
  assert.equal((await admin.put(`/api/admin/roles/${created.body.id}`, { permissions: ['x'] })).status, 400);

  // Rechteänderung wirkt sofort auf angemeldete Benutzer
  const { client: c, user } = await addUser(app, admin, 'Controlling', 'controller');
  assert.equal((await c.get('/api/auth/status')).body.user.permissions.length, 1);
  const blocked = await admin.del(`/api/admin/roles/${created.body.id}`);
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /zugewiesen/);
  await admin.put(`/api/admin/users/${user.id}`, { role_id: role('Management').id });
  assert.ok((await c.get('/api/auth/status')).body.user.permissions.includes('kpi.management'));
  assert.equal((await admin.del(`/api/admin/roles/${created.body.id}`)).status, 204);
});

test('Benutzer: Validierung, kein Passwort-Hash in Antworten', async () => {
  const base = { benutzername: 'neu', name: 'Neu', email: '', role_id: role('Management').id, aktiv: true, project_ids: [] };
  assert.equal((await admin.post('/api/admin/users', base)).status, 400, 'Passwort fehlt');
  assert.equal((await admin.post('/api/admin/users', { ...base, password: '1234567' })).status, 400);
  assert.equal((await admin.post('/api/admin/users', { ...base, password: '12345678', role_id: 999 })).status, 400);
  assert.equal((await admin.post('/api/admin/users', { ...base, password: '12345678', project_ids: [999] })).status, 400);
  assert.equal((await admin.post('/api/admin/users', { ...base, password: '12345678', email: 'kein-at' })).status, 400);
  assert.equal((await admin.post('/api/admin/users', { ...base, password: '12345678', benutzername: 'ADMIN' })).status, 400, 'Benutzername vergeben');
  const ok = await admin.post('/api/admin/users', { ...base, password: '12345678', email: 'neu@example.org' });
  assert.equal(ok.status, 201);
  assert.deepEqual(Object.keys(ok.body).sort(), ['aktiv', 'benutzername', 'email', 'id', 'last_login', 'name', 'project_ids', 'role_id']);
  assert.equal(ok.body.aktiv, true);
  assert.equal(ok.body.last_login, null);
  const list = (await admin.get('/api/admin/users')).body;
  assert.equal(JSON.stringify(list).includes('scrypt'), false);
  assert.match(list.find((u) => u.benutzername === ADMIN.benutzername).last_login, /^\d{4}-\d{2}-\d{2}T/);
});

test('Schutz des letzten aktiven Administrators', async () => {
  const me = (await admin.get('/api/auth/status')).body.user;
  const deactivate = await admin.put(`/api/admin/users/${me.id}`, { aktiv: false });
  assert.equal(deactivate.status, 400);
  assert.match(deactivate.body.error, /letzte/);
  assert.equal((await admin.put(`/api/admin/users/${me.id}`, { role_id: role('Management').id })).status, 400);
  assert.equal((await admin.del(`/api/admin/users/${me.id}`)).status, 400);
  assert.equal((await admin.get('/api/data')).status, 200);

  // Mit einem zweiten Administrator geht es – sich selbst löschen aber nie
  const second = await addUser(app, admin, 'Administrator', 'admin2');
  assert.equal((await second.client.del(`/api/admin/users/${second.user.id}`)).status, 400);
  // Ein deaktivierter zweiter Administrator zählt nicht
  await admin.put(`/api/admin/users/${second.user.id}`, { aktiv: false });
  assert.equal((await admin.put(`/api/admin/users/${me.id}`, { role_id: role('Management').id })).status, 400);
  await admin.put(`/api/admin/users/${second.user.id}`, { aktiv: true });
  assert.equal((await admin.put(`/api/admin/users/${me.id}`, { role_id: role('Management').id })).status, 200);
  assert.equal((await admin.get('/api/admin/users')).status, 403);
  const second2 = app.client();
  await second2.post('/api/auth/login', { benutzername: 'admin2', password: second.password });
  assert.equal((await second2.put(`/api/admin/users/${second.user.id}`, { aktiv: false })).status, 400);
  assert.equal((await second2.del(`/api/admin/users/${me.id}`)).status, 204);
});
