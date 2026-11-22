export type Status = 'geplant' | 'laufend' | 'pausiert' | 'abgeschlossen';

/** Felder mit `?` liefert der Server nur bei passender Berechtigung. */
export interface Project {
  id: number;
  name: string;
  kunde: string;
  leiter: string;
  status: Status;
  start_soll: string;
  ende_soll: string;
  /** nur mit `kosten.ansehen` */
  budget?: number;
  /** Auftragswert (Erlös), nur mit `kpi.management` */
  auftragswert?: number;
  beschreibung: string;
}

export interface Task {
  id: number;
  project_id: number;
  name: string;
  typ: 'phase' | 'meilenstein';
  start_soll: string;
  ende_soll: string;
  start_ist: string | null;
  ende_ist: string | null;
  fortschritt: number;
  /** 1 = liegt auf dem kritischen Pfad */
  kritisch: number;
}

export interface Cost {
  id: number;
  project_id: number;
  datum: string;
  kategorie: string;
  bezeichnung: string;
  art: 'soll' | 'ist';
  betrag: number;
}

/** Geplante und geleistete Stunden je Projekt, Bereich und Monat. */
export interface Aufwand {
  id: number;
  project_id: number;
  bereich: string;
  /** YYYY-MM */
  monat: string;
  stunden_soll: number;
  stunden_ist: number;
}

/** Organisationsbereich mit verfügbarer Kapazität in Stunden pro Monat. */
export interface Bereich {
  id: number;
  name: string;
  kapazitaet: number;
}

/** Change Request */
export interface Aenderung {
  id: number;
  project_id: number;
  datum: string;
  titel: string;
  beschreibung: string;
  status: 'offen' | 'genehmigt' | 'abgelehnt';
  /** nur mit `kosten.ansehen` */
  kosten?: number;
  /** Terminauswirkung in Tagen */
  tage: number;
}

export interface Mangel {
  id: number;
  project_id: number;
  datum: string;
  titel: string;
  schwere: 'gering' | 'mittel' | 'kritisch';
  status: 'offen' | 'behoben';
  nacharbeit_stunden: number;
}

export interface Risiko {
  id: number;
  project_id: number;
  titel: string;
  /** 1 (sehr gering) … 5 (sehr hoch) */
  wahrscheinlichkeit: number;
  /** 1 (sehr gering) … 5 (sehr hoch) */
  auswirkung: number;
  massnahme: string;
  status: 'offen' | 'geschlossen';
  /** 1 = Entscheidung des Managements nötig */
  eskalation: number;
}

/** Kundenbewertung, Skala 0–10 (Grundlage für den NPS). */
export interface Feedback {
  id: number;
  project_id: number;
  datum: string;
  score: number;
  kommentar: string;
  von: string;
}

/** Tabellen ohne Berechtigung kommen als leeres Array. */
export interface Data {
  projects: Project[];
  tasks: Task[];
  costs: Cost[];
  aufwand: Aufwand[];
  bereiche: Bereich[];
  aenderungen: Aenderung[];
  maengel: Mangel[];
  risiken: Risiko[];
  feedback: Feedback[];
}

export type Table = keyof Data;

export type Ampel = 'gruen' | 'gelb' | 'rot' | 'neutral';

/* ---------- Benutzer & Rechte ---------- */

export interface Me {
  id: number;
  benutzername: string;
  name: string;
  email: string;
  role: { id: number; name: string };
  permissions: string[];
}

export interface Role {
  id: number;
  name: string;
  beschreibung: string;
  permissions: string[];
  /** Systemrolle (Administrator): nicht änder- oder löschbar */
  system: boolean;
}

export interface User {
  id: number;
  benutzername: string;
  name: string;
  email: string;
  role_id: number;
  aktiv: boolean;
  /** zugewiesene Projekte; relevant, wenn die Rolle `projekte.alle` nicht hat */
  project_ids: number[];
  last_login: string | null;
}

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
}
