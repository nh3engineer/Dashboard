// Formularfelder aller Fachtabellen. Jede Funktion liefert eine fertige FormConfig für openForm().
import { todayIso } from './calc';
import type { FormConfig } from './app-context';
import type { Field } from './components/ui';
import { STATUS_OPTIONS } from './components/ui';
import type { Aenderung, Aufwand, Bereich, Cost, Data, Feedback, Mangel, Project, Risiko, Task } from './types';

type Can = (permission: string) => boolean;
type Values = Record<string, unknown>;

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const uniq = (...lists: string[][]) => [...new Set(lists.flat().filter(Boolean))].sort((a, b) => a.localeCompare(b));

export const KATEGORIEN = ['Personal', 'Material', 'Fremdleistung', 'Sonstiges'];
export const CR_STATUS = { offen: 'Offen', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt' } as const;
export const MANGEL_SCHWERE = { gering: 'Gering', mittel: 'Mittel', kritisch: 'Kritisch' } as const;
export const MANGEL_STATUS = { offen: 'Offen', behoben: 'Behoben' } as const;
export const RISIKO_STATUS = { offen: 'Offen', geschlossen: 'Geschlossen' } as const;
export const SKALA = ['sehr gering', 'gering', 'mittel', 'hoch', 'sehr hoch'];
const skalaOptions = SKALA.map((label, i) => ({ value: String(i + 1), label: `${i + 1} – ${label}` }));

/** Wirft die Meldung für den Dialog, wenn ein Ende vor seinem Start liegt (der Server prüft dasselbe). */
function checkOrder(v: Values, pairs: [string, string, string][]): Values {
  for (const [from, to, what] of pairs) if (v[from] && v[to] && String(v[to]) < String(v[from])) throw new Error(`Das Ende (${what}) darf nicht vor dem Start (${what}) liegen.`);
  return v;
}

/* ---------- Projekt ---------- */

/** Budget nur mit kosten.ansehen, Auftragswert nur mit kpi.management – der Server lässt fehlende Felder unverändert. */
export const projectFields = (can: Can): Field[] => [
  { key: 'name', label: 'Projektname', required: true, wide: true },
  { key: 'kunde', label: 'Kunde / Bauherr' },
  { key: 'leiter', label: 'Projektleitung' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  ...(can('kosten.ansehen') ? [{ key: 'budget', label: 'Budget (€)', type: 'number', required: true, min: 0, hint: 'Geplante Gesamtkosten' } as Field] : []),
  { key: 'start_soll', label: 'Start (Soll)', type: 'date', required: true },
  { key: 'ende_soll', label: 'Ende (Soll)', type: 'date', required: true },
  ...(can('kpi.management') ? [{ key: 'auftragswert', label: 'Auftragswert (€)', type: 'number', min: 0, hint: 'Erlös – Grundlage für Deckungsbeitrag und ROI' } as Field] : []),
  { key: 'beschreibung', label: 'Beschreibung', type: 'textarea', wide: true },
];

export function projectForm(can: Can, p?: Project, onSaved?: FormConfig['onSaved']): FormConfig {
  const today = todayIso();
  return {
    table: 'projects',
    title: p ? 'Projekt bearbeiten' : 'Neues Projekt',
    fields: projectFields(can),
    initial: p ? { ...p } : { name: '', kunde: '', leiter: '', status: 'geplant', start_soll: today, ende_soll: today, beschreibung: '', ...(can('kosten.ansehen') ? { budget: '' } : {}), ...(can('kpi.management') ? { auftragswert: '' } : {}) },
    transform: (v) => checkOrder(v, [['start_soll', 'ende_soll', 'Soll']]),
    onSaved,
  };
}

/* ---------- Terminplan ---------- */

const isMilestone = (v: Values) => v.typ === 'meilenstein';
export const taskFields: Field[] = [
  { key: 'name', label: 'Bezeichnung', required: true, wide: true },
  { key: 'typ', label: 'Typ', type: 'select', options: opts({ phase: 'Phase', meilenstein: 'Meilenstein' }) },
  { key: 'fortschritt', label: 'Fortschritt (%)', type: 'number', required: true, min: 0, max: 100 },
  { key: 'start_soll', label: 'Start (Soll)', type: 'date', required: true, hidden: isMilestone },
  { key: 'ende_soll', label: 'Ende / Termin (Soll)', type: 'date', required: true },
  { key: 'start_ist', label: 'Start (Ist)', type: 'date', hidden: isMilestone },
  { key: 'ende_ist', label: 'Ende / Termin (Ist)', type: 'date' },
  { key: 'kritisch', label: 'Kritischer Pfad', type: 'checkbox', wide: true, hint: 'Ein Verzug dieses Eintrags verschiebt das Projektende.' },
];

export function taskForm(projectId: number, t?: Task): FormConfig {
  const today = todayIso();
  return {
    table: 'tasks',
    title: t ? 'Termin bearbeiten' : 'Neuer Termin',
    fields: taskFields,
    initial: t ? { ...t } : { project_id: projectId, name: '', typ: 'phase', fortschritt: 0, start_soll: today, ende_soll: today, start_ist: '', ende_ist: '', kritisch: 0 },
    // Ein Meilenstein hat nur einen Termin
    transform: (v) => (v.typ === 'meilenstein' ? { ...v, start_soll: v.ende_soll, start_ist: null } : checkOrder(v, [['start_soll', 'ende_soll', 'Soll'], ['start_ist', 'ende_ist', 'Ist']])),
  };
}

/* ---------- Kosten ---------- */

export const costFields = (data: Data): Field[] => [
  { key: 'datum', label: 'Datum', type: 'date', required: true },
  { key: 'art', label: 'Art', type: 'select', options: opts({ ist: 'Ist (Buchung)', soll: 'Soll (Plan)' }) },
  { key: 'kategorie', label: 'Kategorie', required: true, suggestions: uniq(KATEGORIEN, data.costs.map((c) => c.kategorie)) },
  { key: 'betrag', label: 'Betrag (€)', type: 'number', required: true },
  { key: 'bezeichnung', label: 'Bezeichnung', wide: true },
];

export function costForm(projectId: number, data: Data, c?: Cost): FormConfig {
  return {
    table: 'costs',
    title: c ? 'Kostenposition bearbeiten' : 'Neue Kostenposition',
    fields: costFields(data),
    initial: c ? { ...c } : { project_id: projectId, datum: todayIso(), art: 'ist', kategorie: '', bezeichnung: '', betrag: '' },
  };
}

/* ---------- Ressourcen ---------- */

export const aufwandFields = (data: Data): Field[] => [
  { key: 'bereich', label: 'Bereich', required: true, suggestions: uniq(data.bereiche.map((b) => b.name), data.aufwand.map((a) => a.bereich)) },
  { key: 'monat', label: 'Monat', type: 'month', required: true },
  { key: 'stunden_soll', label: 'Stunden Soll', type: 'number', min: 0, hint: 'Geplanter Aufwand im Monat' },
  { key: 'stunden_ist', label: 'Stunden Ist', type: 'number', min: 0, hint: 'Geleisteter Aufwand im Monat' },
];

export function aufwandForm(projectId: number, data: Data, a?: Aufwand, preset: Partial<Aufwand> = {}): FormConfig {
  return {
    table: 'aufwand',
    title: a ? 'Aufwand bearbeiten' : 'Aufwand erfassen',
    fields: aufwandFields(data),
    initial: a ? { ...a } : { project_id: projectId, bereich: '', monat: todayIso().slice(0, 7), stunden_soll: '', stunden_ist: '', ...preset },
  };
}

export const bereichFields: Field[] = [
  { key: 'name', label: 'Bereich', required: true, hint: 'Muss der Bezeichnung in der Aufwandserfassung entsprechen' },
  { key: 'kapazitaet', label: 'Kapazität (h pro Monat)', type: 'number', required: true, min: 0 },
];

export function bereichForm(b?: Partial<Bereich>): FormConfig {
  return { table: 'bereiche', title: b?.id ? 'Bereich bearbeiten' : 'Neuer Bereich', fields: bereichFields, initial: { name: '', kapazitaet: '', ...b } };
}

/* ---------- Änderungen (Change Requests) ---------- */

/** Mehrkosten nur mit kosten.ansehen – ohne das Recht liefert der Server das Feld nicht. */
export const aenderungFields = (can: Can): Field[] => [
  { key: 'titel', label: 'Titel', required: true, wide: true },
  { key: 'datum', label: 'Datum', type: 'date', required: true },
  { key: 'status', label: 'Status', type: 'select', options: opts(CR_STATUS) },
  ...(can('kosten.ansehen') ? [{ key: 'kosten', label: 'Mehrkosten (€)', type: 'number', hint: 'Negativ = Einsparung' } as Field] : []),
  { key: 'tage', label: 'Terminauswirkung (Tage)', type: 'number', hint: 'Positiv = spätere Fertigstellung' },
  { key: 'beschreibung', label: 'Beschreibung', type: 'textarea', wide: true },
];

export function aenderungForm(projectId: number, can: Can, c?: Aenderung): FormConfig {
  return {
    table: 'aenderungen',
    title: c ? 'Änderung bearbeiten' : 'Neue Änderung',
    fields: aenderungFields(can),
    initial: c ? { ...c } : { project_id: projectId, datum: todayIso(), titel: '', beschreibung: '', status: 'offen', tage: 0, ...(can('kosten.ansehen') ? { kosten: 0 } : {}) },
  };
}

/* ---------- Qualität (Mängel) ---------- */

export const mangelFields: Field[] = [
  { key: 'titel', label: 'Mangel', required: true, wide: true },
  { key: 'datum', label: 'Festgestellt am', type: 'date', required: true },
  { key: 'schwere', label: 'Schwere', type: 'select', options: opts(MANGEL_SCHWERE) },
  { key: 'status', label: 'Status', type: 'select', options: opts(MANGEL_STATUS) },
  { key: 'nacharbeit_stunden', label: 'Nacharbeit (h)', type: 'number', min: 0 },
];

export function mangelForm(projectId: number, x?: Mangel): FormConfig {
  return {
    table: 'maengel',
    title: x ? 'Mangel bearbeiten' : 'Neuer Mangel',
    fields: mangelFields,
    initial: x ? { ...x } : { project_id: projectId, datum: todayIso(), titel: '', schwere: 'mittel', status: 'offen', nacharbeit_stunden: 0 },
  };
}

/* ---------- Risiken ---------- */

export const risikoFields: Field[] = [
  { key: 'titel', label: 'Risiko', required: true, wide: true },
  { key: 'wahrscheinlichkeit', label: 'Wahrscheinlichkeit', type: 'select', options: skalaOptions },
  { key: 'auswirkung', label: 'Auswirkung', type: 'select', options: skalaOptions },
  { key: 'status', label: 'Status', type: 'select', options: opts(RISIKO_STATUS) },
  { key: 'massnahme', label: 'Maßnahme', type: 'textarea', wide: true },
  { key: 'eskalation', label: 'Eskalation an das Management', type: 'checkbox', wide: true, hint: 'Entscheidung des Managements nötig' },
];

export function risikoForm(projectId: number, r?: Risiko): FormConfig {
  return {
    table: 'risiken',
    title: r ? 'Risiko bearbeiten' : 'Neues Risiko',
    fields: risikoFields,
    initial: r ? { ...r } : { project_id: projectId, titel: '', wahrscheinlichkeit: 3, auswirkung: 3, massnahme: '', status: 'offen', eskalation: 0 },
    // Auswahlfelder liefern Text, der Server erwartet ganze Zahlen
    transform: (v) => ({ ...v, wahrscheinlichkeit: Number(v.wahrscheinlichkeit), auswirkung: Number(v.auswirkung) }),
  };
}

/* ---------- Kundenfeedback ---------- */

export const feedbackFields: Field[] = [
  { key: 'score', label: 'Weiterempfehlung (0–10)', type: 'number', required: true, min: 0, max: 10, step: 1, hint: '0 = keinesfalls, 10 = auf jeden Fall' },
  { key: 'datum', label: 'Datum', type: 'date', required: true },
  { key: 'von', label: 'Von', wide: true },
  { key: 'kommentar', label: 'Kommentar', type: 'textarea', wide: true },
];

/** `frei = false` (nur `feedback.abgeben`): Name und Datum setzt der Server, die Felder entfallen. */
export function feedbackForm(projectId: number, von: string, f?: Feedback, onSaved?: FormConfig['onSaved'], frei = true): FormConfig {
  return {
    table: 'feedback',
    title: f ? 'Bewertung bearbeiten' : 'Bewertung abgeben',
    fields: frei ? feedbackFields : feedbackFields.filter((x) => x.key !== 'datum' && x.key !== 'von'),
    initial: f ? { ...f } : { project_id: projectId, datum: todayIso(), score: '', kommentar: '', von },
    onSaved,
  };
}
