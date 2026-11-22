import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { bad } from './errors.js';
import { ADMIN_ROLE, ALL_KEYS, DEFAULT_ROLES } from './permissions.js';

const dbPath = resolve(process.env.DB_PATH || 'data/dashboard.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

const PROJECT_FK = 'project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE';

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
  beschreibung TEXT NOT NULL DEFAULT '',
  auftragswert REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  name TEXT NOT NULL,
  typ TEXT NOT NULL DEFAULT 'phase',
  start_soll TEXT NOT NULL,
  ende_soll TEXT NOT NULL,
  start_ist TEXT,
  ende_ist TEXT,
  fortschritt REAL NOT NULL DEFAULT 0,
  kritisch INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  datum TEXT NOT NULL,
  kategorie TEXT NOT NULL DEFAULT 'Sonstiges',
  bezeichnung TEXT NOT NULL DEFAULT '',
  art TEXT NOT NULL DEFAULT 'ist',
  betrag REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS aufwand (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  bereich TEXT NOT NULL,
  monat TEXT NOT NULL,
  stunden_soll REAL NOT NULL DEFAULT 0,
  stunden_ist REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bereiche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kapazitaet REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS aenderungen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  datum TEXT NOT NULL,
  titel TEXT NOT NULL,
  beschreibung TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen',
  kosten REAL NOT NULL DEFAULT 0,
  tage REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS maengel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  datum TEXT NOT NULL,
  titel TEXT NOT NULL,
  schwere TEXT NOT NULL DEFAULT 'mittel',
  status TEXT NOT NULL DEFAULT 'offen',
  nacharbeit_stunden REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS risiken (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  titel TEXT NOT NULL,
  wahrscheinlichkeit INTEGER NOT NULL DEFAULT 3,
  auswirkung INTEGER NOT NULL DEFAULT 3,
  massnahme TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen',
  eskalation INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${PROJECT_FK},
  datum TEXT NOT NULL,
  score INTEGER NOT NULL,
  kommentar TEXT NOT NULL DEFAULT '',
  von TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  beschreibung TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  system INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  benutzername TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  aktiv INTEGER NOT NULL DEFAULT 1,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS user_projects (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`);

// Migration von Datenbanken der Vorversion: fehlende Spalten ergänzen (CREATE TABLE IF NOT EXISTS ändert bestehende Tabellen nicht).
for (const [table, column, ddl] of [
  ['projects', 'auftragswert', 'REAL NOT NULL DEFAULT 0'],
  ['tasks', 'kritisch', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

/** Führt fn in einer Transaktion aus (verschachtelte Aufrufe laufen in der äußeren mit). */
let depth = 0;
export function tx(fn) {
  if (depth) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

// Standardrollen nur in einer leeren Rollentabelle anlegen (gelöschte Rollen kommen nicht wieder);
// die Administrator-Systemrolle wird immer sichergestellt.
tx(() => {
  const addRole = db.prepare('INSERT INTO roles (name, beschreibung, permissions, system) VALUES (?,?,?,?)');
  const add = (r) => addRole.run(r.name, r.beschreibung, JSON.stringify(r.permissions), r.system);
  if (db.prepare('SELECT COUNT(*) AS n FROM roles').get().n === 0) DEFAULT_ROLES.forEach(add);
  else if (!db.prepare('SELECT 1 FROM roles WHERE system=1').get()) {
    const admin = DEFAULT_ROLES[0];
    const taken = db.prepare('SELECT 1 FROM roles WHERE name=?').get(admin.name);
    add({ ...admin, name: taken ? `${ADMIN_ROLE} (System)` : admin.name });
  }
  db.prepare('UPDATE roles SET permissions=? WHERE system=1').run(JSON.stringify(ALL_KEYS));
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const missing = (v) => v === null || v === undefined || v === '';
const text = (v) => String(v ?? '').trim().slice(0, 2000);
const req = (v) => {
  const s = text(v);
  if (!s) throw new Error('Pflichtfeld fehlt');
  return s;
};
const date = (v) => {
  if (!DATE.test(String(v)) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Error('Ungültiges Datum');
  return String(v);
};
const optDate = (v) => (missing(v) ? null : date(v));
const month = (v) => {
  if (!MONTH.test(String(v))) throw new Error('Ungültiger Monat (JJJJ-MM)');
  return String(v);
};
const num = (v) => {
  const n = missing(v) || typeof v === 'boolean' ? NaN : Number(v);
  if (!Number.isFinite(n)) throw new Error('Ungültige Zahl');
  return n;
};
const nonNeg = (v) => {
  const n = num(v);
  if (n < 0) throw new Error('Wert darf nicht negativ sein');
  return n;
};
const int = (min, max) => (v) => {
  const n = num(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Ganze Zahl von ${min} bis ${max} erwartet`);
  return n;
};
const flag = (v) => {
  if (missing(v) || v === false || v === 0 || v === '0') return 0;
  if (v === true || v === 1 || v === '1') return 1;
  throw new Error('0 oder 1 erwartet');
};
/** Fehlt der Wert, gilt der Standard – sonst die Validierung. */
const opt = (validate, fallback) => (v) => (missing(v) ? fallback : validate(v));
const oneOf = (...opts) => (v) => {
  if (!opts.includes(v)) throw new Error(`Ungültiger Wert: ${String(v).slice(0, 50)}`);
  return v;
};
const fk = (v) => {
  const n = Number(v);
  if (missing(v) || !Number.isInteger(n) || n < 1) throw new Error('Ungültige Projekt-ID');
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
    budget: opt(nonNeg, 0),
    auftragswert: opt(nonNeg, 0),
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
    kritisch: flag,
  },
  costs: {
    project_id: fk,
    datum: date,
    kategorie: req,
    bezeichnung: text,
    art: oneOf('soll', 'ist'),
    betrag: num,
  },
  aufwand: {
    project_id: fk,
    bereich: req,
    monat: month,
    stunden_soll: opt(nonNeg, 0),
    stunden_ist: opt(nonNeg, 0),
  },
  bereiche: {
    name: req,
    kapazitaet: opt(nonNeg, 0),
  },
  aenderungen: {
    project_id: fk,
    datum: date,
    titel: req,
    beschreibung: text,
    status: oneOf('offen', 'genehmigt', 'abgelehnt'),
    kosten: opt(num, 0),
    tage: opt(num, 0),
  },
  maengel: {
    project_id: fk,
    datum: date,
    titel: req,
    schwere: oneOf('gering', 'mittel', 'kritisch'),
    status: oneOf('offen', 'behoben'),
    nacharbeit_stunden: opt(nonNeg, 0),
  },
  risiken: {
    project_id: fk,
    titel: req,
    wahrscheinlichkeit: int(1, 5),
    auswirkung: int(1, 5),
    massnahme: text,
    status: oneOf('offen', 'geschlossen'),
    eskalation: flag,
  },
  feedback: {
    project_id: fk,
    datum: date,
    score: int(0, 10),
    kommentar: text,
    von: text,
  },
};

/** Tabellen in Einfügereihenfolge (Projekte vor abhängigen Daten). */
export const TABLES = Object.keys(tables);
/** Tabellen mit Projektbezug – alle außer projects selbst und den globalen Bereichen. */
export const PROJECT_TABLES = TABLES.filter((t) => 'project_id' in tables[t]);

/** Prüfungen über mehrere Felder: [früheres Feld, späteres Feld, Meldung] (ISO-Daten sind als Text vergleichbar). */
const ORDER = {
  projects: [['start_soll', 'ende_soll', 'Das Ende (Soll) darf nicht vor dem Start (Soll) liegen']],
  tasks: [
    ['start_soll', 'ende_soll', 'Das Ende (Soll) darf nicht vor dem Start (Soll) liegen'],
    ['start_ist', 'ende_ist', 'Das Ende (Ist) darf nicht vor dem Start (Ist) liegen'],
  ],
};

function clean(table, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Ungültige Daten');
  const out = {};
  for (const [col, validate] of Object.entries(tables[table])) {
    try {
      out[col] = validate(body[col]);
    } catch (e) {
      throw bad(`${col}: ${e.message}`);
    }
  }
  for (const [from, to, message] of ORDER[table] ?? []) if (out[from] && out[to] && out[to] < out[from]) throw bad(`${to}: ${message}`);
  return out;
}

export function all(table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

export function get(table, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) ?? null;
}

export function insert(table, body) {
  const row = clean(table, body);
  const cols = Object.keys(row);
  const info = db
    .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...Object.values(row));
  return { id: Number(info.lastInsertRowid), ...row };
}

/** Aktualisiert einen Datensatz; im Body fehlende Felder behalten ihren bisherigen Wert. */
export function update(table, id, body) {
  return tx(() => {
    const existing = get(table, id);
    if (!existing) return null;
    const row = clean(table, { ...existing, ...body });
    const cols = Object.keys(row);
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).run(...Object.values(row), id);
    // Aufwand verweist über den Namen auf den Bereich – Umbenennung mitziehen
    if (table === 'bereiche' && row.name !== existing.name) db.prepare('UPDATE aufwand SET bereich=? WHERE bereich=?').run(row.name, existing.name);
    return { id, ...row };
  });
}

export function remove(table, id) {
  return db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes > 0;
}

/** Vollständige Fachdaten (ohne Benutzer, Rollen, Sessions). */
export function exportAll() {
  return Object.fromEntries(TABLES.map((t) => [t, all(t)]));
}

/** Löscht alle Fachdaten; Benutzer und Rollen bleiben (Projektzuweisungen entfallen über ON DELETE CASCADE). */
export function clearData() {
  for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
}

/**
 * Ersetzt die gesamten Fachdaten (Backup-Import). IDs werden neu vergeben.
 * Akzeptiert auch Exportdateien der Vorversion (nur projects/tasks/costs).
 * Liefert, wie viele Projektzuweisungen von Benutzern nicht übernommen werden konnten.
 */
export function importAll(data) {
  if (!Array.isArray(data?.projects)) throw bad('Ungültiges Format: "projects" fehlt');
  for (const t of TABLES) if (data[t] !== undefined && !Array.isArray(data[t])) throw bad(`Ungültiges Format: "${t}" ist keine Liste`);
  const each = (table, fn) => {
    for (const [i, r] of (data[table] ?? []).entries()) {
      try {
        fn(r ?? {});
      } catch (e) {
        const message = /UNIQUE constraint failed/.test(e.message) ? 'Der Name ist bereits vergeben' : e.message;
        throw bad(`${table}, Eintrag ${i + 1}: ${message}`);
      }
    }
  };
  return tx(() => {
    // Zuweisungen wandern über den Projektnamen mit (die IDs ändern sich bei jedem Import). Das geht nur,
    // wenn der Name vorher und in der Datei eindeutig ist – sonst bekäme ein Benutzer womöglich das falsche Projekt.
    const assigned = db.prepare('SELECT up.user_id, p.name FROM user_projects up JOIN projects p ON p.id = up.project_id').all();
    const count = (map, name) => map.set(name, (map.get(name) ?? 0) + 1);
    const before = new Map();
    for (const p of all('projects')) count(before, p.name);
    clearData();
    const idMap = new Map();
    const after = new Map();
    const byName = new Map();
    each('projects', (p) => {
      const row = insert('projects', p);
      idMap.set(p.id, row.id);
      count(after, row.name);
      byName.set(row.name, row.id);
    });
    each('bereiche', (b) => insert('bereiche', b));
    for (const table of PROJECT_TABLES) {
      each(table, (r) => {
        const project_id = idMap.get(r.project_id);
        if (project_id) insert(table, { ...r, project_id });
      });
    }
    const assign = db.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?,?)');
    let entfallen = 0;
    for (const a of assigned) {
      if (before.get(a.name) === 1 && after.get(a.name) === 1) assign.run(a.user_id, byName.get(a.name));
      else entfallen++;
    }
    return { entfallen };
  });
}
