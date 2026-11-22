// Wer darf was sehen und ändern: Projektzugriff, Tabellenrechte und ausgeblendete Felder.
import { all, db, get, insert, PROJECT_TABLES, remove, TABLES, tables, tx, update } from './db.js';
import { bad, forbidden, notFound } from './errors.js';

const VIEW = {
  tasks: 'termine.ansehen',
  costs: 'kosten.ansehen',
  aufwand: 'ressourcen.ansehen',
  bereiche: 'ressourcen.ansehen',
  aenderungen: 'aenderungen.ansehen',
  maengel: 'qualitaet.ansehen',
  risiken: 'risiken.ansehen',
  feedback: 'feedback.ansehen',
};
const WRITE = {
  projects: 'projekte.bearbeiten',
  tasks: 'termine.bearbeiten',
  costs: 'kosten.bearbeiten',
  aufwand: 'ressourcen.bearbeiten',
  bereiche: 'ressourcen.bearbeiten',
  aenderungen: 'aenderungen.bearbeiten',
  maengel: 'qualitaet.bearbeiten',
  risiken: 'risiken.bearbeiten',
  feedback: 'feedback.bearbeiten',
};
/** Felder, die nur mit der genannten Berechtigung ausgeliefert und angenommen werden. */
const HIDDEN = {
  projects: { budget: 'kosten.ansehen', auftragswert: 'kpi.management' },
  aenderungen: { kosten: 'kosten.ansehen' },
};

const can = (user, permission) => user.permissions.has(permission);

/** Bereiche gelten für alle Projekte (Kapazität, Aufwand über den Namen) – ändern darf sie nur, wer auch alle Projekte sieht. */
function assertWrite(user, table) {
  if (!can(user, WRITE[table]) || (table === 'bereiche' && !can(user, 'projekte.alle'))) throw forbidden();
}
/** Antwort auf Schreibzugriffe: ohne Ansehen-Recht für die Tabelle nur die ID, sonst ließen sich Datensätze über PUT auslesen. */
const answer = (user, table, row) => (table === 'projects' || can(user, VIEW[table]) ? strip(user, table, row) : { id: row.id });

/** Sichtbare Projekt-IDs; null = alle. */
function scope(user) {
  if (can(user, 'projekte.alle')) return null;
  return new Set(db.prepare('SELECT project_id FROM user_projects WHERE user_id=?').all(user.id).map((r) => r.project_id));
}

function strip(user, table, row) {
  const out = { ...row };
  for (const [field, permission] of Object.entries(HIDDEN[table] ?? {})) if (!can(user, permission)) delete out[field];
  return out;
}

/** Datenbestand in der Form `Data`, gefiltert auf das, was der Benutzer sehen darf. */
export function visibleData(user) {
  const ids = scope(user);
  const out = {};
  for (const table of TABLES) {
    let rows = [];
    if (table === 'projects') rows = all(table).filter((p) => !ids || ids.has(p.id));
    else if (can(user, VIEW[table])) rows = all(table).filter((r) => !ids || !('project_id' in r) || ids.has(r.project_id));
    out[table] = rows.map((r) => strip(user, table, r));
  }
  return out;
}

function assertProject(ids, projectId) {
  if (ids && !ids.has(projectId)) throw forbidden('Kein Zugriff auf dieses Projekt');
}

/** Projekt eines bestehenden Datensatzes (bei projects die eigene ID, bei bereiche keines). */
const projectOf = (table, row) => (table === 'projects' ? row.id : PROJECT_TABLES.includes(table) ? row.project_id : null);

function loadForWrite(user, table, id) {
  const row = Number.isInteger(id) && id > 0 ? get(table, id) : null;
  const ids = scope(user);
  const pid = row && projectOf(table, row);
  // Fremde Datensätze melden wir wie nicht vorhandene, damit sich IDs nicht ausforschen lassen
  if (!row || (pid !== null && ids && !ids.has(pid))) throw notFound();
  return { row, ids };
}

/** Nicht sichtbare Felder kann der Benutzer auch nicht setzen. */
function writable(user, table, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Ungültige Daten');
  return strip(user, table, body);
}

/** Zielprojekt aus dem Body prüfen: Zugriff und Existenz. */
function assertTarget(ids, table, body) {
  if (!PROJECT_TABLES.includes(table) || body.project_id === undefined) return;
  let pid;
  try {
    pid = tables[table].project_id(body.project_id);
  } catch (e) {
    throw bad(`project_id: ${e.message}`);
  }
  assertProject(ids, pid);
  if (!get('projects', pid)) throw bad('project_id: Projekt nicht gefunden');
}

export function createRow(user, table, rawBody) {
  const mayWrite = can(user, WRITE[table]) && (table !== 'bereiche' || can(user, 'projekte.alle'));
  // Kunden dürfen Feedback abgeben, aber nur unter eigenem Namen und mit heutigem Datum
  const ownFeedback = table === 'feedback' && !mayWrite && can(user, 'feedback.abgeben');
  if (!mayWrite && !ownFeedback) throw forbidden();
  let body = writable(user, table, rawBody);
  if (ownFeedback) body = { ...body, von: user.name, datum: new Date().toISOString().slice(0, 10) };
  const ids = scope(user);
  if (PROJECT_TABLES.includes(table) && body.project_id === undefined) throw bad('project_id: Ungültige Projekt-ID');
  assertTarget(ids, table, body);
  return tx(() => {
    const row = insert(table, body);
    // Ohne "alle Projekte" sähe der Ersteller sein neues Projekt sonst nicht
    if (table === 'projects' && ids) db.prepare('INSERT INTO user_projects (user_id, project_id) VALUES (?,?)').run(user.id, row.id);
    // Eigenes Feedback darf der Absender als Bestätigung zurückbekommen
    return ownFeedback ? strip(user, table, row) : answer(user, table, row);
  });
}

export function updateRow(user, table, id, rawBody) {
  assertWrite(user, table);
  const { ids } = loadForWrite(user, table, id);
  const body = writable(user, table, rawBody);
  // Auch das Ziel prüfen: sonst ließe sich ein Datensatz in ein fremdes Projekt verschieben
  assertTarget(ids, table, body);
  const row = update(table, id, body);
  if (!row) throw notFound();
  return answer(user, table, row);
}

export function deleteRow(user, table, id) {
  assertWrite(user, table);
  loadForWrite(user, table, id);
  if (!remove(table, id)) throw notFound();
}
