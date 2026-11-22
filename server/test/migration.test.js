import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { addUser, setupAdmin, startApp } from './helpers.js';

// Schema der Vorversion: nur projects/tasks/costs, ohne auftragswert und kritisch
function createLegacyDb(file) {
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunde TEXT NOT NULL DEFAULT '', leiter TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'geplant', start_soll TEXT NOT NULL, ende_soll TEXT NOT NULL, budget REAL NOT NULL DEFAULT 0, beschreibung TEXT NOT NULL DEFAULT '');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
      typ TEXT NOT NULL DEFAULT 'phase', start_soll TEXT NOT NULL, ende_soll TEXT NOT NULL, start_ist TEXT, ende_ist TEXT, fortschritt REAL NOT NULL DEFAULT 0);
    CREATE TABLE costs (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, datum TEXT NOT NULL,
      kategorie TEXT NOT NULL DEFAULT 'Sonstiges', bezeichnung TEXT NOT NULL DEFAULT '', art TEXT NOT NULL DEFAULT 'ist', betrag REAL NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name, kunde, start_soll, ende_soll, budget) VALUES (7, 'Altprojekt', 'Altkunde', '2025-01-01', '2025-12-31', 120000);
    INSERT INTO tasks (project_id, name, typ, start_soll, ende_soll, start_ist, fortschritt) VALUES (7, 'Montage', 'phase', '2025-03-01', '2025-06-30', '2025-03-05', 40);
    INSERT INTO costs (project_id, datum, kategorie, bezeichnung, art, betrag) VALUES (7, '2025-04-15', 'Material', 'Rohre', 'ist', 4321.5);
  `);
  old.close();
}

// Exportdatei der Vorversion
const LEGACY_EXPORT = {
  projects: [
    { id: 3, name: 'Import A', kunde: 'K', leiter: 'L', status: 'laufend', start_soll: '2025-01-01', ende_soll: '2025-12-31', budget: 1000, beschreibung: '' },
    { id: 8, name: 'Import B', kunde: '', leiter: '', status: 'geplant', start_soll: '2025-02-01', ende_soll: '2025-08-31', budget: 2000, beschreibung: '' },
  ],
  tasks: [
    { id: 11, project_id: 8, name: 'Phase B', typ: 'phase', start_soll: '2025-02-01', ende_soll: '2025-03-01', start_ist: null, ende_ist: null, fortschritt: 0 },
    { id: 12, project_id: 99, name: 'verwaist', typ: 'phase', start_soll: '2025-02-01', ende_soll: '2025-03-01', start_ist: null, ende_ist: null, fortschritt: 0 },
  ],
  costs: [{ id: 5, project_id: 3, datum: '2025-03-01', kategorie: 'Personal', bezeichnung: '', art: 'soll', betrag: 500 }],
};

let app;
let admin;
before(async () => {
  app = await startApp(createLegacyDb);
  admin = await setupAdmin(app);
});
after(() => app.close());

test('Alt-Datenbank wird ohne Datenverlust migriert', async () => {
  const d = (await admin.get('/api/data')).body;
  assert.deepEqual(d.projects, [
    { id: 7, name: 'Altprojekt', kunde: 'Altkunde', leiter: '', status: 'geplant', start_soll: '2025-01-01', ende_soll: '2025-12-31', budget: 120000, beschreibung: '', auftragswert: 0 },
  ]);
  assert.equal(d.tasks.length, 1);
  assert.equal(d.tasks[0].fortschritt, 40);
  assert.equal(d.tasks[0].kritisch, 0);
  assert.equal(d.costs[0].betrag, 4321.5);
  for (const k of ['aufwand', 'bereiche', 'aenderungen', 'maengel', 'risiken', 'feedback']) assert.deepEqual(d[k], [], k);
  assert.equal((await admin.get('/api/admin/roles')).body.length, 5, 'Standardrollen wurden angelegt');
});

test('migrierte Daten sind mit den neuen Feldern bearbeitbar', async () => {
  const task = (await admin.get('/api/data')).body.tasks[0];
  assert.equal((await admin.put(`/api/tasks/${task.id}`, { ...task, kritisch: 1 })).body.kritisch, 1);
  assert.equal((await admin.put('/api/projects/7', { auftragswert: 150000 })).body.auftragswert, 150000);
  assert.equal((await admin.post('/api/risiken', { project_id: 7, titel: 'R', wahrscheinlichkeit: 2, auswirkung: 3, massnahme: '', status: 'offen', eskalation: 0 })).status, 201);
});

test('Import: ungültige Datei ändert nichts (Transaktion)', async () => {
  const before = app.db.exportAll();
  assert.equal((await admin.post('/api/import', { tasks: [] })).status, 400);
  assert.equal((await admin.post('/api/import', { projects: 'x' })).status, 400);
  const broken = { ...LEGACY_EXPORT, costs: [{ ...LEGACY_EXPORT.costs[0], datum: 'gestern' }] };
  const res = await admin.post('/api/import', broken);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /costs, Eintrag 1/);
  assert.deepEqual(app.db.exportAll(), before);
});

test('Exportdatei der Vorversion ist importierbar; Benutzer und Rollen bleiben', async () => {
  const { client: leiter, user } = await addUser(app, admin, 'Projektleitung', 'leiter', [7]);
  assert.equal((await leiter.get('/api/data')).body.projects.length, 1);

  const res = await admin.post('/api/import', LEGACY_EXPORT);
  assert.equal(res.status, 200);
  const d = res.body;
  assert.deepEqual(d.projects.map((p) => p.name), ['Import A', 'Import B']);
  assert.ok(d.projects.every((p) => p.auftragswert === 0));
  const b = d.projects.find((p) => p.name === 'Import B');
  assert.equal(d.tasks.length, 1, 'verwaiste Aufgabe entfällt');
  assert.equal(d.tasks[0].project_id, b.id, 'project_id wurde umgeschrieben');
  assert.equal(d.tasks[0].kritisch, 0);
  assert.equal(d.costs[0].project_id, d.projects.find((p) => p.name === 'Import A').id);
  assert.deepEqual(d.risiken, [], 'alte Fachdaten wurden ersetzt');

  assert.equal((await admin.get('/api/admin/users')).body.length, 2);
  assert.equal((await admin.get('/api/admin/roles')).body.length, 5);
  // Zuweisung auf das ersetzte Projekt ist weg – kein Zugriff auf ein zufällig gleich nummeriertes
  assert.deepEqual((await admin.get('/api/admin/users')).body.find((u) => u.id === user.id).project_ids, []);
  assert.deepEqual((await leiter.get('/api/data')).body.projects, []);
  assert.equal(app.db.db.prepare('SELECT COUNT(*) AS n FROM user_projects').get().n, 0);
});

test('vollständiger Export lässt sich wieder einspielen; Zuweisungen gleicher Projekte bleiben', async () => {
  (await import('../seed.js')).seed();
  const users = (await admin.get('/api/admin/users')).body;
  const leiter = users.find((u) => u.benutzername === 'leiter');
  const target = app.db.all('projects').find((p) => p.name === 'Retrofit Kühlhaus Süd');
  await admin.put(`/api/admin/users/${leiter.id}`, { project_ids: [target.id] });
  const exported = (await admin.get('/api/export')).body;
  assert.equal(exported.projects.length, 7);

  const res = await admin.post('/api/import', exported);
  assert.equal(res.status, 200);
  const strip = (rows) => rows.map(({ id, project_id, ...rest }) => rest);
  for (const k of Object.keys(exported)) assert.deepEqual(strip(res.body[k]), strip(exported[k]), k);
  const after = app.db.all('projects').find((p) => p.name === 'Retrofit Kühlhaus Süd');
  assert.notEqual(after.id, target.id, 'IDs werden neu vergeben');
  assert.deepEqual((await admin.get('/api/admin/users')).body.find((u) => u.id === leiter.id).project_ids, [after.id]);
});

test('wiederholter Import derselben Sicherung behält die Zuweisungen; entfallene werden gemeldet', async () => {
  const leiter = (await admin.get('/api/admin/users')).body.find((u) => u.benutzername === 'leiter');
  const exported = (await admin.get('/api/export')).body;
  const assigned = () => app.db.db.prepare('SELECT p.name FROM user_projects up JOIN projects p ON p.id = up.project_id WHERE up.user_id=?').all(leiter.id).map((r) => r.name);
  assert.deepEqual(assigned(), ['Retrofit Kühlhaus Süd']);
  for (let i = 0; i < 2; i++) {
    const res = await admin.post('/api/import', exported);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-zuweisungen-entfallen'), '0');
    assert.deepEqual(assigned(), ['Retrofit Kühlhaus Süd'], `Import ${i + 1}`);
  }
  // Ist der Name in der Datei nicht eindeutig, wird nicht geraten
  const doppelt = { ...exported, projects: [...exported.projects, { ...exported.projects.find((p) => p.name === 'Retrofit Kühlhaus Süd'), id: 99999 }] };
  const res = await admin.post('/api/import', doppelt);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-zuweisungen-entfallen'), '1');
  assert.deepEqual(assigned(), []);
});

test('Importfehler durch doppelten Bereichsnamen: deutsche Meldung, Bestand unverändert', async () => {
  const before = app.db.exportAll();
  const res = await admin.post('/api/import', { projects: [], bereiche: [{ name: 'A' }, { name: 'A' }] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'bereiche, Eintrag 2: Der Name ist bereits vergeben');
  assert.deepEqual(app.db.exportAll(), before);
});
