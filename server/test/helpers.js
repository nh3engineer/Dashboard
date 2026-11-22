// Gemeinsame Testhilfen: App gegen eine temporäre Datenbank starten, HTTP-Client mit Cookie.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ADMIN = { benutzername: 'admin', name: 'Anna Admin', password: 'sehr-geheim-1' };

export function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-test-'));
  return { dir, file: join(dir, 'test.db') };
}

/** Startet die App auf einem freien Port. DB_PATH muss vor dem ersten Import von db.js gesetzt sein. */
export async function startApp(prepare) {
  const { dir, file } = tempDbPath();
  process.env.DB_PATH = file;
  prepare?.(file);
  const { createApp } = await import('../app.js');
  const dbm = await import('../db.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    db: dbm,
    client: () => client(base),
    async close() {
      await new Promise((r) => server.close(r));
      dbm.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Kleiner Client, der das Session-Cookie wie ein Browser mitführt. */
export function client(base) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set[set.length - 1].split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), setCookie: set, headers: res.headers };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b, h) => call('POST', p, b, h),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
    get cookie() {
      return cookie;
    },
    set cookie(v) {
      cookie = v;
    },
  };
}

/** Ersteinrichtung durchführen; liefert den angemeldeten Administrator-Client. */
export async function setupAdmin(app) {
  const admin = app.client();
  const res = await admin.post('/api/auth/setup', ADMIN);
  if (res.status !== 201) throw new Error(`Setup fehlgeschlagen: ${JSON.stringify(res.body)}`);
  return admin;
}

/** Legt über die Verwaltung einen Benutzer an und meldet ihn an. */
export async function addUser(app, admin, roleName, benutzername, project_ids = []) {
  const roles = (await admin.get('/api/admin/roles')).body;
  const role = roles.find((r) => r.name === roleName);
  const password = `pw-${benutzername}-12345`;
  const created = await admin.post('/api/admin/users', { benutzername, name: `Test ${benutzername}`, email: '', role_id: role.id, aktiv: true, project_ids, password });
  if (created.status !== 201) throw new Error(`Benutzer anlegen fehlgeschlagen: ${JSON.stringify(created.body)}`);
  const c = app.client();
  const login = await c.post('/api/auth/login', { benutzername, password });
  if (login.status !== 200) throw new Error(`Login fehlgeschlagen: ${JSON.stringify(login.body)}`);
  return { client: c, user: created.body, password };
}
