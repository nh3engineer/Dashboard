import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || 'data/dashboard.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kunde TEXT NOT NULL DEFAULT '',
  leiter TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'geplant',
  start_soll TEXT NOT NULL,
  ende_soll TEXT NOT NULL,
  budget REAL NOT NULL DEFAULT 0,
  beschreibung TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  typ TEXT NOT NULL DEFAULT 'phase',
  start_soll TEXT NOT NULL,
  ende_soll TEXT NOT NULL,
  start_ist TEXT,
  ende_ist TEXT,
  fortschritt REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  datum TEXT NOT NULL,
  kategorie TEXT NOT NULL DEFAULT 'Sonstiges',
  bezeichnung TEXT NOT NULL DEFAULT '',
  art TEXT NOT NULL DEFAULT 'ist',
  betrag REAL NOT NULL DEFAULT 0
);
`);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v) => String(v ?? '').trim().slice(0, 2000);
const req = (v) => {
  const s = text(v);
  if (!s) throw new Error('Pflichtfeld fehlt');
  return s;
};
const date = (v) => {
  if (!DATE.test(String(v))) throw new Error('Ungültiges Datum');
  return String(v);
};
const optDate = (v) => (v === null || v === undefined || v === '' ? null : date(v));
const num = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Ungültige Zahl');
  return n;
};
const oneOf = (...opts) => (v) => {
  if (!opts.includes(v)) throw new Error(`Ungültiger Wert: ${v}`);
  return v;
};
const fk = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error('Ungültige Projekt-ID');
  return n;
};

/** Spalten je Tabelle mit Validierung – einzige Quelle für erlaubte Felder. */
export const tables = {
  projects: {
    name: req,
    kunde: text,
    leiter: text,
    status: oneOf('geplant', 'laufend', 'pausiert', 'abgeschlossen'),
    start_soll: date,
    ende_soll: date,
    budget: num,
    beschreibung: text,
  },
  tasks: {
    project_id: fk,
    name: req,
    typ: oneOf('phase', 'meilenstein'),
    start_soll: date,
    ende_soll: date,
    start_ist: optDate,
    ende_ist: optDate,
    fortschritt: (v) => Math.min(100, Math.max(0, num(v))),
  },
  costs: {
    project_id: fk,
    datum: date,
    kategorie: req,
    bezeichnung: text,
    art: oneOf('soll', 'ist'),
    betrag: num,
  },
};

function clean(table, body) {
  const out = {};
  for (const [col, validate] of Object.entries(tables[table])) {
    try {
      out[col] = validate(body[col]);
    } catch (e) {
      throw new Error(`${col}: ${e.message}`);
    }
  }
  return out;
}

export function all(table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

export function insert(table, body) {
  const row = clean(table, body);
  const cols = Object.keys(row);
  const info = db
    .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...Object.values(row));
  return { id: Number(info.lastInsertRowid), ...row };
}

export function update(table, id, body) {
  const row = clean(table, body);
  const cols = Object.keys(row);
  const info = db
    .prepare(`UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`)
    .run(...Object.values(row), id);
  return info.changes ? { id, ...row } : null;
}

export function remove(table, id) {
  return db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes > 0;
}

export function exportAll() {
  return { projects: all('projects'), tasks: all('tasks'), costs: all('costs') };
}

/** Ersetzt den gesamten Datenbestand (Backup-Import). IDs werden neu vergeben. */
export function importAll(data) {
  if (!Array.isArray(data?.projects)) throw new Error('Ungültiges Format: "projects" fehlt');
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM costs; DELETE FROM tasks; DELETE FROM projects;');
    const idMap = new Map();
    for (const p of data.projects) idMap.set(p.id, insert('projects', p).id);
    for (const table of ['tasks', 'costs']) {
      for (const r of data[table] ?? []) {
        const project_id = idMap.get(r.project_id);
        if (project_id) insert(table, { ...r, project_id });
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
