import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, addUser, setupAdmin, startApp } from './helpers.js';

let app;
let admin;
before(async () => {
  app = await startApp();
});
after(() => app.close());

test('ohne Benutzer: Einrichtung nötig, Daten gesperrt', async () => {
  const c = app.client();
  assert.deepEqual((await c.get('/api/auth/status')).body, { setupRequired: true, user: null });
  for (const path of ['/api/data', '/api/export', '/api/admin/users', '/api/gibt-es-nicht']) {
    const res = await c.get(path);
    assert.equal(res.status, 401, path);
    assert.equal(typeof res.body.error, 'string');
  }
  assert.equal((await c.post('/api/projects', { name: 'x' })).status, 401);
  assert.equal((await c.post('/api/auth/password', { current: 'a', next: 'bbbbbbbbb' })).status, 401);
});

test('Einrichtung: Passwortregel, legt Administrator an, danach gesperrt', async () => {
  const c = app.client();
  assert.equal((await c.post('/api/auth/setup', { ...ADMIN, password: 'kurz' })).status, 400);
  assert.equal((await c.post('/api/auth/setup', { ...ADMIN, benutzername: '' })).status, 400);
  admin = await setupAdmin(app);
  const status = (await admin.get('/api/auth/status')).body;
  assert.equal(status.setupRequired, false);
  assert.equal(status.user.role.name, 'Administrator');
  assert.ok(status.user.permissions.includes('benutzer.verwalten'));
  assert.equal('password_hash' in status.user, false);
  assert.equal((await app.client().post('/api/auth/setup', { ...ADMIN, benutzername: 'zweiter' })).status, 403);
});

test('Session-Cookie: httpOnly, SameSite=Strict, Secure nur über HTTPS; in der DB nur als Hash', async () => {
  const c = app.client();
  const res = await c.post('/api/auth/login', ADMIN);
  assert.equal(res.status, 200);
  const cookie = res.setCookie[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Secure/);
  const token = c.cookie.split('=')[1];
  assert.equal(app.db.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash=?').get(token).n, 0);
  const https = await app.client().post('/api/auth/login', ADMIN, { 'X-Forwarded-Proto': 'https' });
  assert.match(https.setCookie[0], /Secure/);
});

test('Login mit falschen Daten: 401 mit einheitlicher Meldung', async () => {
  const wrong = await app.client().post('/api/auth/login', { benutzername: ADMIN.benutzername, password: 'falsch-falsch' });
  const unknown = await app.client().post('/api/auth/login', { benutzername: 'niemand', password: 'falsch-falsch' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
  assert.equal((await app.client().post('/api/auth/login', {})).status, 401);
});

test('Logout beendet die Session serverseitig', async () => {
  const c = app.client();
  await c.post('/api/auth/login', ADMIN);
  const old = c.cookie;
  assert.equal((await c.get('/api/data')).status, 200);
  assert.equal((await c.post('/api/auth/logout')).status, 204);
  c.cookie = old; // auch ein aufbewahrtes Cookie darf nicht mehr gelten
  assert.equal((await c.get('/api/data')).status, 401);
});

test('abgelaufene Session gilt nicht mehr', async () => {
  const c = app.client();
  await c.post('/api/auth/login', ADMIN);
  app.db.db.exec('UPDATE sessions SET expires_at = 1');
  assert.equal((await c.get('/api/data')).status, 401);
  await admin.post('/api/auth/login', ADMIN);
});

test('Passwort ändern: altes Passwort nötig, andere Sitzungen werden beendet', async () => {
  const { client: a, user, password } = await addUser(app, admin, 'Management', 'wechsler');
  const b = app.client();
  await b.post('/api/auth/login', { benutzername: user.benutzername, password });
  assert.equal((await a.post('/api/auth/password', { current: 'falsch', next: 'neues-passwort-1' })).status, 400);
  assert.equal((await a.post('/api/auth/password', { current: password, next: 'kurz' })).status, 400);
  assert.equal((await a.post('/api/auth/password', { current: password, next: 'neues-passwort-1' })).status, 204);
  assert.equal((await a.get('/api/data')).status, 200);
  assert.equal((await b.get('/api/data')).status, 401);
  assert.equal((await app.client().post('/api/auth/login', { benutzername: user.benutzername, password })).status, 401);
  assert.equal((await app.client().post('/api/auth/login', { benutzername: user.benutzername, password: 'neues-passwort-1' })).status, 200);
});

test('deaktivierte Benutzer: Sitzung endet sofort, kein Login', async () => {
  const { client: c, user, password } = await addUser(app, admin, 'Management', 'gesperrt');
  assert.equal((await c.get('/api/data')).status, 200);
  assert.equal((await admin.put(`/api/admin/users/${user.id}`, { aktiv: false })).status, 200);
  assert.equal((await c.get('/api/data')).status, 401);
  assert.equal((await app.client().post('/api/auth/login', { benutzername: user.benutzername, password })).status, 401);
});

test('gelöschte Benutzer und vom Admin neu gesetztes Passwort beenden Sitzungen', async () => {
  const one = await addUser(app, admin, 'Management', 'reset');
  assert.equal((await admin.put(`/api/admin/users/${one.user.id}`, { password: 'vom-admin-gesetzt' })).status, 200);
  assert.equal((await one.client.get('/api/data')).status, 401);
  const two = await addUser(app, admin, 'Management', 'weg');
  assert.equal((await admin.del(`/api/admin/users/${two.user.id}`)).status, 204);
  assert.equal((await two.client.get('/api/data')).status, 401);
});

test('Login-Bremse: nach 10 Fehlversuchen 429, auch mit richtigem Passwort', async () => {
  const { resetLoginThrottle } = await import('../auth.js');
  const { user, password } = await addUser(app, admin, 'Management', 'bremse');
  const c = app.client();
  for (let i = 0; i < 10; i++) assert.equal((await c.post('/api/auth/login', { benutzername: 'Bremse', password: 'falsch-falsch' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { benutzername: user.benutzername, password })).status, 429);
  // andere Benutzer sind nicht betroffen
  assert.equal((await app.client().post('/api/auth/login', ADMIN)).status, 200);
  resetLoginThrottle();
  assert.equal((await c.post('/api/auth/login', { benutzername: user.benutzername, password })).status, 200);
});

test('Login-Bremse greift auch bei gleichzeitigen Anfragen', async () => {
  const { resetLoginThrottle } = await import('../auth.js');
  const { user, password } = await addUser(app, admin, 'Management', 'parallel');
  resetLoginThrottle();
  const login = (pw) => app.client().post('/api/auth/login', { benutzername: user.benutzername, password: pw });
  // 60 auf einmal, das richtige Passwort als letztes: höchstens 10 werden überhaupt geprüft
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => login(i === 59 ? password : `falsch-${i}`)));
  const count = (status) => results.filter((r) => r.status === status).length;
  assert.equal(count(401), 10);
  assert.equal(count(429), 50);
  assert.equal(count(200), 0);
  assert.equal((await login(password)).status, 429);
  resetLoginThrottle();
  // eine erfolgreiche Anmeldung setzt den Zähler zurück
  for (let i = 0; i < 9; i++) assert.equal((await login('falsch-falsch')).status, 401);
  assert.equal((await login(password)).status, 200);
  for (let i = 0; i < 9; i++) assert.equal((await login('falsch-falsch')).status, 401);
  assert.equal((await login(password)).status, 200);
});

test('unbekannte API-Pfade liefern 404 als JSON', async () => {
  const res = await admin.get('/api/gibt-es-nicht');
  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, 'string');
});
