import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addUser, setupAdmin, startApp } from './helpers.js';

const KEYS = ['projects', 'tasks', 'costs', 'aufwand', 'bereiche', 'aenderungen', 'maengel', 'risiken', 'feedback'];
let app;
let admin;
let mgmt;
let pl; // Projektleitung, Projekt 1
let kunde; // Kunde / Bauherr, Projekte 1 und 2
let full; // ungefilterter Bestand

const data = async (c) => (await c.get('/api/data')).body;
const first = (table, projectId) => full[table].find((r) => r.project_id === projectId);

before(async () => {
  app = await startApp();
  admin = await setupAdmin(app);
  (await import('../seed.js')).seed();
  full = app.db.exportAll();
  mgmt = (await addUser(app, admin, 'Management', 'mgmt')).client;
  pl = (await addUser(app, admin, 'Projektleitung', 'leiter', [1])).client;
  kunde = (await addUser(app, admin, 'Kunde / Bauherr', 'bauherr', [1, 2])).client;
});
after(() => app.close());

test('Beispieldaten decken alle Bereiche ab', () => {
  for (const k of KEYS) assert.ok(full[k].length > 0, k);
  assert.equal(full.projects.length, 5);
  assert.equal(app.db.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 4, 'Seed legt keine Benutzer an');
  assert.equal(full.risiken.filter((r) => r.eskalation === 1).length, 2);
  assert.equal(full.maengel.filter((m) => m.schwere === 'kritisch' && m.status === 'offen').length, 1);
  assert.ok(full.tasks.some((t) => t.kritisch === 1 && t.typ === 'meilenstein' && t.name === 'Abnahme'));
  assert.ok(full.projects.every((p) => p.auftragswert > p.budget));
  // mindestens ein Bereich ist in den nächsten drei Monaten überbucht
  const now = new Date();
  const months = [1, 2, 3].map((n) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 1)).toISOString().slice(0, 7));
  const over = full.bereiche.some((b) => months.some((m) => full.aufwand.filter((a) => a.bereich === b.name && a.monat === m).reduce((s, a) => s + a.stunden_soll, 0) > b.kapazitaet));
  assert.ok(over);
});

test('Administrator und Management sehen alles inklusive Budget und Auftragswert', async () => {
  for (const c of [admin, mgmt]) {
    const d = await data(c);
    assert.deepEqual(Object.keys(d).sort(), [...KEYS].sort());
    for (const k of KEYS) assert.equal(d[k].length, full[k].length, k);
    assert.equal(d.projects[0].budget, full.projects[0].budget);
    assert.equal(d.projects[0].auftragswert, full.projects[0].auftragswert);
    assert.equal(typeof d.aenderungen[0].kosten, 'number');
  }
});

test('Projektleitung: nur zugewiesene Projekte, Budget ja, Auftragswert nein', async () => {
  const d = await data(pl);
  assert.deepEqual(d.projects.map((p) => p.id), [1]);
  assert.equal(typeof d.projects[0].budget, 'number');
  assert.equal('auftragswert' in d.projects[0], false);
  for (const k of KEYS.filter((k) => k !== 'projects' && k !== 'bereiche')) {
    assert.ok(d[k].length > 0, k);
    assert.ok(d[k].every((r) => r.project_id === 1), k);
  }
  assert.equal(d.bereiche.length, full.bereiche.length);
});

test('Kunde: keine Kosten, kein Budget, kein Auftragswert, keine Risiken – nur zugewiesene Projekte', async () => {
  const d = await data(kunde);
  assert.deepEqual(Object.keys(d).sort(), [...KEYS].sort());
  assert.deepEqual(d.projects.map((p) => p.id), [1, 2]);
  for (const p of d.projects) {
    assert.equal('budget' in p, false);
    assert.equal('auftragswert' in p, false);
  }
  for (const k of ['costs', 'aufwand', 'bereiche', 'maengel', 'risiken', 'feedback']) assert.deepEqual(d[k], [], k);
  assert.ok(d.tasks.length > 0 && d.tasks.every((t) => [1, 2].includes(t.project_id)));
  assert.ok(d.aenderungen.length > 0 && d.aenderungen.every((a) => [1, 2].includes(a.project_id) && !('kosten' in a)));
});

test('Benutzer ohne Zuweisung sieht nichts', async () => {
  const { client } = await addUser(app, admin, 'Projektleitung', 'ohne');
  const d = await data(client);
  for (const k of KEYS.filter((k) => k !== 'bereiche')) assert.deepEqual(d[k], [], k);
});

test('Schreibverbote: 403 ohne Berechtigung', async () => {
  const task = first('tasks', 1);
  const checks = [
    [kunde, 'post', '/api/tasks', { ...task }],
    [kunde, 'put', `/api/tasks/${task.id}`, { ...task, name: 'gehackt' }],
    [kunde, 'del', `/api/tasks/${task.id}`],
    [kunde, 'put', '/api/projects/1', { ...full.projects[0] }],
    [kunde, 'del', '/api/projects/1'],
    [kunde, 'post', '/api/costs', { ...first('costs', 1) }],
    [kunde, 'post', '/api/bereiche', { name: 'Neu', kapazitaet: 1 }],
    [kunde, 'put', `/api/feedback/${first('feedback', 1).id}`, { score: 0 }],
    [kunde, 'del', `/api/feedback/${first('feedback', 1).id}`],
    [mgmt, 'post', '/api/projects', { ...full.projects[0] }],
    [mgmt, 'put', `/api/risiken/${full.risiken[0].id}`, { status: 'geschlossen' }],
    [mgmt, 'del', `/api/maengel/${full.maengel[0].id}`],
    [mgmt, 'post', '/api/feedback', { ...first('feedback', 1) }],
    [pl, 'put', `/api/feedback/${first('feedback', 1).id}`, { score: 10 }],
    [pl, 'get', '/api/export'],
    [pl, 'post', '/api/import', { projects: [] }],
    [kunde, 'get', '/api/export'],
  ];
  for (const [c, method, path, body] of checks) {
    const res = await c[method](path, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(typeof res.body.error, 'string');
  }
  assert.deepEqual(app.db.exportAll(), full, 'nichts wurde verändert');
});

test('Projektzugriff lässt sich nicht über fremde project_id umgehen', async () => {
  const own = first('tasks', 1);
  const foreign = first('tasks', 2);
  // anlegen im fremden Projekt
  assert.equal((await pl.post('/api/tasks', { ...own, project_id: 2 })).status, 403);
  assert.equal((await pl.post('/api/costs', { ...first('costs', 1), project_id: 2 })).status, 403);
  assert.equal((await pl.post('/api/risiken', { ...first('risiken', 1), project_id: 9999 })).status, 403);
  // eigenen Datensatz ins fremde Projekt verschieben
  assert.equal((await pl.put(`/api/tasks/${own.id}`, { ...own, project_id: 2 })).status, 403);
  // fremden Datensatz ändern, ins eigene Projekt holen oder löschen
  assert.equal((await pl.put(`/api/tasks/${foreign.id}`, { ...foreign, name: 'gehackt' })).status, 404);
  assert.equal((await pl.put(`/api/tasks/${foreign.id}`, { ...foreign, project_id: 1 })).status, 404);
  assert.equal((await pl.del(`/api/tasks/${foreign.id}`)).status, 404);
  assert.equal((await pl.del(`/api/costs/${first('costs', 2).id}`)).status, 404);
  assert.equal((await pl.put('/api/projects/2', { ...full.projects[1], name: 'gehackt' })).status, 404);
  assert.equal((await pl.del('/api/projects/2')).status, 404);
  // Kunde: Feedback nur für eigene Projekte
  assert.equal((await kunde.post('/api/feedback', { project_id: 3, score: 0, kommentar: '' })).status, 403);
  assert.deepEqual(app.db.exportAll(), full, 'nichts wurde verändert');
});

test('Projektleitung bearbeitet das eigene Projekt; verborgene Felder bleiben erhalten', async () => {
  const own = first('tasks', 1);
  const saved = await pl.put(`/api/tasks/${own.id}`, { ...own, fortschritt: 55, kritisch: 1 });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.fortschritt, 55);
  const before = app.db.get('projects', 1);
  const res = await pl.put('/api/projects/1', { name: 'Neuer Name', budget: 500000, auftragswert: 1 });
  assert.equal(res.status, 200);
  assert.equal('auftragswert' in res.body, false);
  const row = app.db.get('projects', 1);
  assert.equal(row.name, 'Neuer Name');
  assert.equal(row.budget, 500000);
  assert.equal(row.auftragswert, before.auftragswert, 'Auftragswert ohne kpi.management nicht änderbar');
  assert.equal(row.kunde, before.kunde, 'fehlende Felder bleiben unverändert');
  await admin.put('/api/projects/1', before);
  await admin.put(`/api/tasks/${own.id}`, own);
});

test('Rolle ohne Kosteneinsicht: Budget und Änderungskosten bleiben beim Speichern erhalten', async () => {
  const role = await admin.post('/api/admin/roles', { name: 'Terminplanung', permissions: ['projekte.bearbeiten', 'aenderungen.ansehen', 'aenderungen.bearbeiten'] });
  const { client } = await addUser(app, admin, 'Terminplanung', 'planer', [1]);
  const cr = first('aenderungen', 1);
  const visible = (await data(client)).aenderungen.find((a) => a.id === cr.id);
  assert.equal('kosten' in visible, false);
  const res = await client.put(`/api/aenderungen/${cr.id}`, { ...visible, titel: 'umbenannt', kosten: 1 });
  assert.equal(res.status, 200);
  assert.equal('kosten' in res.body, false);
  assert.equal(app.db.get('aenderungen', cr.id).kosten, cr.kosten);
  assert.equal(app.db.get('aenderungen', cr.id).titel, 'umbenannt');
  const p = (await data(client)).projects[0];
  assert.equal((await client.put('/api/projects/1', { ...p, leiter: 'X' })).status, 200);
  assert.equal(app.db.get('projects', 1).budget, full.projects[0].budget);
  // neu angelegte Datensätze bekommen den Standardwert
  const created = await client.post('/api/aenderungen', { project_id: 1, datum: '2026-01-15', titel: 'Neu', beschreibung: '', status: 'offen', kosten: 5000, tage: 2 });
  assert.equal(created.status, 201);
  assert.equal(app.db.get('aenderungen', created.body.id).kosten, 0);
  await admin.del(`/api/aenderungen/${created.body.id}`);
  await admin.put(`/api/aenderungen/${cr.id}`, cr);
  await admin.put('/api/projects/1', full.projects[0]);
  assert.equal(role.status, 201);
});

test('neues Projekt wird dem Ersteller ohne projekte.alle automatisch zugewiesen', async () => {
  const body = { name: 'Eigenes Projekt', kunde: '', leiter: '', status: 'geplant', start_soll: '2026-01-01', ende_soll: '2026-06-30', budget: 1000, auftragswert: 5000, beschreibung: '' };
  const created = await pl.post('/api/projects', body);
  assert.equal(created.status, 201);
  assert.deepEqual((await data(pl)).projects.map((p) => p.id), [1, created.body.id]);
  assert.equal(app.db.get('projects', created.body.id).auftragswert, 0);
  assert.equal((await pl.post('/api/tasks', { project_id: created.body.id, name: 'Phase', typ: 'phase', start_soll: '2026-01-01', ende_soll: '2026-02-01', fortschritt: 0 })).status, 201);
  // Administrator (projekte.alle) braucht keine Zuweisung
  const byAdmin = await admin.post('/api/projects', body);
  assert.equal(byAdmin.body.auftragswert, 5000);
  assert.equal(app.db.db.prepare('SELECT COUNT(*) AS n FROM user_projects WHERE project_id=?').get(byAdmin.body.id).n, 0);
  assert.equal((await pl.del(`/api/projects/${created.body.id}`)).status, 204);
  assert.equal((await admin.del(`/api/projects/${byAdmin.body.id}`)).status, 204);
  assert.equal(app.db.all('tasks').length, full.tasks.length, 'abhängige Daten werden mitgelöscht');
});

test('Kunde gibt Feedback unter eigenem Namen ab, sieht fremdes Feedback aber nicht', async () => {
  const res = await kunde.post('/api/feedback', { project_id: 2, datum: '2020-01-01', score: 9, kommentar: 'Danke', von: 'Jemand anderes' });
  assert.equal(res.status, 201);
  assert.equal(res.body.von, 'Test bauherr');
  assert.equal(res.body.datum, new Date().toISOString().slice(0, 10));
  assert.deepEqual((await data(kunde)).feedback, []);
  assert.equal((await kunde.post('/api/feedback', { project_id: 2, score: 11 })).status, 400);
  assert.equal((await admin.del(`/api/feedback/${res.body.id}`)).status, 204);
});

test('Wertebereiche werden geprüft', async () => {
  const risk = first('risiken', 1);
  const bad = [
    ['/api/risiken', { ...risk, wahrscheinlichkeit: 6 }],
    ['/api/risiken', { ...risk, auswirkung: 0 }],
    ['/api/risiken', { ...risk, auswirkung: 2.5 }],
    ['/api/risiken', { ...risk, eskalation: 2 }],
    ['/api/risiken', { ...risk, status: 'vielleicht' }],
    ['/api/feedback', { ...first('feedback', 1), score: -1 }],
    ['/api/aufwand', { ...first('aufwand', 1), monat: '2026-13' }],
    ['/api/aufwand', { ...first('aufwand', 1), monat: '2026-1' }],
    ['/api/aufwand', { ...first('aufwand', 1), stunden_soll: -5 }],
    ['/api/tasks', { ...first('tasks', 1), kritisch: 'ja' }],
    ['/api/tasks', { ...first('tasks', 1), start_soll: '2026-02-31x' }],
    ['/api/maengel', { ...first('maengel', 1), schwere: 'egal' }],
    ['/api/aenderungen', { ...first('aenderungen', 1), status: 'neu' }],
    ['/api/costs', { ...first('costs', 1), project_id: 9999 }],
    ['/api/costs', { ...first('costs', 1), project_id: undefined }],
    ['/api/bereiche', { name: 'Montage', kapazitaet: 10 }],
    ['/api/bereiche', { name: 'Neu', kapazitaet: -1 }],
    ['/api/projects', []],
  ];
  for (const [path, body] of bad) {
    const res = await admin.post(path, body);
    assert.equal(res.status, 400, `${path} ${JSON.stringify(body).slice(0, 80)}`);
    assert.equal(typeof res.body.error, 'string');
  }
  assert.equal((await admin.put('/api/tasks/abc', {})).status, 404);
  assert.equal((await admin.del('/api/tasks/99999')).status, 404);
  assert.deepEqual(app.db.exportAll(), full);
});

test('Bereiche sind global; Umbenennen zieht den Aufwand mit', async () => {
  const b = full.bereiche.find((x) => x.name === 'Montage');
  const n = full.aufwand.filter((a) => a.bereich === 'Montage').length;
  const res = await admin.put(`/api/bereiche/${b.id}`, { name: 'Montage & Rohrbau', kapazitaet: 450 });
  assert.equal(res.status, 200);
  assert.equal(app.db.all('aufwand').filter((a) => a.bereich === 'Montage & Rohrbau').length, n);
  await admin.put(`/api/bereiche/${b.id}`, b);
  assert.deepEqual(app.db.exportAll(), full);
});

test('Bereiche ändern nur mit „alle Projekte“: Projektleitung kann fremde Aufwandsdaten nicht über Bereiche verändern', async () => {
  const b = full.bereiche[0];
  assert.equal((await pl.put(`/api/bereiche/${b.id}`, { name: 'GEHACKT', kapazitaet: 1 })).status, 403);
  assert.equal((await pl.del(`/api/bereiche/${full.bereiche[1].id}`)).status, 403);
  assert.equal((await pl.post('/api/bereiche', { name: 'Neu', kapazitaet: 1 })).status, 403);
  // Aufwand im eigenen Projekt bleibt bearbeitbar
  const a = first('aufwand', 1);
  assert.equal((await pl.put(`/api/aufwand/${a.id}`, a)).status, 200);
  assert.deepEqual(app.db.exportAll(), full, 'nichts wurde verändert');
});

test('Schreibrecht ohne Ansehen-Recht gibt keine Datensätze preis', async () => {
  // Über die Verwaltung wird das Ansehen-Recht automatisch mitvergeben …
  const viaApi = await admin.post('/api/admin/roles', { name: 'Kostenpflege', permissions: ['kosten.bearbeiten', 'feedback.bearbeiten'] });
  assert.deepEqual(viaApi.body.permissions, ['kosten.ansehen', 'kosten.bearbeiten', 'feedback.ansehen', 'feedback.bearbeiten']);
  // … Altbestände können aber noch Rollen ohne Ansehen enthalten
  app.db.db.prepare('INSERT INTO roles (name, permissions) VALUES (?,?)').run('NurSchreiben', JSON.stringify(['kosten.bearbeiten', 'risiken.bearbeiten', 'projekte.bearbeiten']));
  const { client } = await addUser(app, admin, 'NurSchreiben', 'nurschreiben', [1]);
  const d = await data(client);
  assert.deepEqual(d.costs, []);
  assert.deepEqual(d.risiken, []);
  const cost = first('costs', 1);
  const risk = first('risiken', 1);
  for (const [path, row] of [[`/api/costs/${cost.id}`, cost], [`/api/risiken/${risk.id}`, risk]]) {
    const res = await client.put(path, {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { id: row.id }, path);
  }
  const created = await client.post('/api/costs', { ...cost });
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.body), ['id']);
  // Projekte bleiben ohne die verborgenen Felder sichtbar
  const p = await client.put('/api/projects/1', {});
  assert.equal(p.body.name, full.projects[0].name);
  assert.equal('budget' in p.body, false);
  assert.equal((await admin.del(`/api/costs/${created.body.id}`)).status, 204);
  assert.deepEqual(app.db.exportAll(), full, 'nichts wurde verändert');
});

test('ungültige project_id ergibt 400, nicht 500', async () => {
  const task = first('tasks', 1);
  const checks = [
    [pl, 'post', '/api/tasks', { ...task, project_id: 'abc' }],
    [pl, 'put', `/api/tasks/${task.id}`, { project_id: null }],
    [pl, 'post', '/api/costs', { ...first('costs', 1), project_id: 1.5 }],
    [kunde, 'post', '/api/feedback', { project_id: '2 OR 1=1', score: 5 }],
  ];
  for (const [c, method, path, body] of checks) {
    const res = await c[method](path, body);
    assert.equal(res.status, 400, `${method} ${path}`);
    assert.equal(res.body.error, 'project_id: Ungültige Projekt-ID');
  }
  assert.deepEqual(app.db.exportAll(), full);
});

test('Export und Import brauchen zusätzlich „alle Projekte“', async () => {
  await admin.post('/api/admin/roles', { name: 'NurExport', permissions: ['daten.export'] });
  const { client } = await addUser(app, admin, 'NurExport', 'nurexport', [1]);
  assert.equal((await client.get('/api/export')).status, 403);
  assert.equal((await client.post('/api/import', { projects: [] })).status, 403);
  assert.deepEqual(app.db.exportAll(), full);
});

test('Ende vor Start und negative Beträge werden abgelehnt', async () => {
  const p = full.projects[0];
  const task = first('tasks', 1);
  const bad = [
    ['post', '/api/projects', { ...p, start_soll: '2026-12-31', ende_soll: '2026-10-01' }],
    ['post', '/api/projects', { ...p, budget: -5000 }],
    ['post', '/api/projects', { ...p, auftragswert: -1 }],
    ['put', `/api/projects/${p.id}`, { ende_soll: '1999-01-01' }],
    ['post', '/api/tasks', { ...task, start_soll: '2026-12-01', ende_soll: '2026-11-01' }],
    ['post', '/api/tasks', { ...task, start_ist: '2026-12-01', ende_ist: '2026-11-01' }],
    ['put', `/api/tasks/${task.id}`, { start_soll: '2999-01-01' }],
  ];
  for (const [method, path, body] of bad) {
    const res = await admin[method](path, body);
    assert.equal(res.status, 400, `${method} ${path} ${JSON.stringify(body).slice(-80)}`);
    assert.match(res.body.error, /darf nicht/);
  }
  // gleicher Tag ist erlaubt (Meilenstein)
  const ok = await admin.post('/api/tasks', { ...task, typ: 'meilenstein', start_soll: '2026-12-01', ende_soll: '2026-12-01', start_ist: null, ende_ist: null });
  assert.equal(ok.status, 201);
  await admin.del(`/api/tasks/${ok.body.id}`);
  assert.deepEqual(app.db.exportAll(), full);
});

test('Export enthält nur Fachdaten', async () => {
  const { client: gf } = await addUser(app, admin, 'Geschäftsführung', 'gfuehrung');
  const res = await gf.get('/api/export');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, JSON.parse(JSON.stringify(full)));
  assert.deepEqual(Object.keys(res.body).sort(), [...KEYS].sort());
});
