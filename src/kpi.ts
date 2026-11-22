// Kennzahlen über den Soll-/Ist-Vergleich hinaus: Standard-KPIs für das Projektteam
// und Management-KPIs für die Portfoliosicht. Reine Funktionen ohne UI.
import { taskDelay, toDay, todayIso, type Metrics } from './calc';
import type { Aenderung, Aufwand, Bereich, Feedback, Mangel, Project, Risiko, Task } from './types';

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);

/** Anteil des laufenden Monats, der am Stichtag bereits vergangen ist (0..1); vergangene Monate 1, künftige 0. */
export function monthShare(monat: string, todayStr = todayIso()): number {
  const current = todayStr.slice(0, 7);
  if (monat < current) return 1;
  if (monat > current) return 0;
  const [y, m] = monat.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Number(todayStr.slice(8, 10)) / daysInMonth;
}

/* ---------- Standard-KPIs (operativ, je Projekt) ---------- */

export interface StandardKpis {
  /** Schedule Performance Index = Leistungswert / Planwert; < 1 = Verzug */
  spi: number | null;
  /** Cost Performance Index = Leistungswert / Ist-Kosten; < 1 = Kostenüberschreitung */
  cpi: number | null;
  /** Fertigstellungsgrad 0..1 */
  fertig: number;
  phasenFertig: number;
  phasenGesamt: number;
  msGesamt: number;
  /** bis heute fällige Meilensteine */
  msFaellig: number;
  msErreicht: number;
  /** erreichte Meilensteine, die spätestens zum Soll-Termin erreicht wurden */
  msTermingerecht: number;
  /** Termintreue der Meilensteine 0..1 (termingerecht / fällig oder erreicht) */
  msQuote: number | null;
  stundenSollGesamt: number;
  /** geplante Stunden bis zum Stichtag (laufender Monat anteilig) */
  stundenSoll: number;
  stundenIst: number;
  /** Aufwandsabweichung: Ist / Soll bis heute − 1 */
  aufwandAbw: number | null;
  crGesamt: number;
  crOffen: number;
  crGenehmigt: number;
  /** Summe der genehmigten Mehrkosten (0, wenn Kosten nicht sichtbar) */
  crKosten: number;
  crTage: number;
  /** genehmigte Mehrkosten / Budget */
  aenderungsquote: number | null;
  maengelGesamt: number;
  maengelOffen: number;
  maengelKritischOffen: number;
  nacharbeitStunden: number;
  /** behobene / alle Mängel */
  behebungsquote: number | null;
}

export function standardKpis(
  p: Project,
  m: Metrics,
  tasks: Task[],
  aufwand: Aufwand[],
  aenderungen: Aenderung[],
  maengel: Mangel[],
  todayStr = todayIso(),
): StandardKpis {
  const today = toDay(todayStr);
  const phasen = tasks.filter((t) => t.typ === 'phase');
  const ms = tasks.filter((t) => t.typ === 'meilenstein');
  const erreicht = ms.filter((t) => t.ende_ist || t.fortschritt >= 100);
  const faellig = ms.filter((t) => toDay(t.ende_soll) <= today);
  const termingerecht = erreicht.filter((t) => !t.ende_ist || toDay(t.ende_ist) <= toDay(t.ende_soll));
  const bewertbar = new Set([...faellig, ...erreicht]).size;

  const stundenSoll = sum(aufwand, (a) => a.stunden_soll * monthShare(a.monat, todayStr));
  const stundenIst = sum(aufwand, (a) => a.stunden_ist);

  const genehmigt = aenderungen.filter((c) => c.status === 'genehmigt');
  const crKosten = sum(genehmigt, (c) => c.kosten ?? 0);
  const behoben = maengel.filter((x) => x.status === 'behoben').length;
  const offen = maengel.filter((x) => x.status === 'offen');

  return {
    spi: m.spi,
    cpi: m.cpi,
    fertig: m.istPct,
    phasenFertig: phasen.filter((t) => t.fortschritt >= 100).length,
    phasenGesamt: phasen.length,
    msGesamt: ms.length,
    msFaellig: faellig.length,
    msErreicht: erreicht.length,
    msTermingerecht: termingerecht.length,
    msQuote: bewertbar ? termingerecht.length / bewertbar : null,
    stundenSollGesamt: sum(aufwand, (a) => a.stunden_soll),
    stundenSoll,
    stundenIst,
    aufwandAbw: stundenSoll > 0 ? stundenIst / stundenSoll - 1 : null,
    crGesamt: aenderungen.length,
    crOffen: aenderungen.filter((c) => c.status === 'offen').length,
    crGenehmigt: genehmigt.length,
    crKosten,
    crTage: sum(genehmigt, (c) => c.tage),
    aenderungsquote: p.budget ? crKosten / p.budget : null,
    maengelGesamt: maengel.length,
    maengelOffen: offen.length,
    maengelKritischOffen: offen.filter((x) => x.schwere === 'kritisch').length,
    nacharbeitStunden: sum(maengel, (x) => x.nacharbeit_stunden),
    behebungsquote: maengel.length ? behoben / maengel.length : null,
  };
}

/* ---------- Management-KPIs (strategisch) ---------- */

export interface ManagementKpis {
  auftragswert: number;
  budget: number;
  istKosten: number;
  /** Prognose Endkosten */
  eac: number;
  /** Deckungsbeitrag laut Prognose = Auftragswert − Prognose Endkosten; null ohne Auftragswert */
  deckungsbeitrag: number | null;
  /** Projekte ohne Auftragswert – in Deckungsbeitrag, Marge und ROI nicht enthalten */
  ohneAuftragswert: number;
  /** Deckungsbeitrag / Auftragswert */
  marge: number | null;
  /** ROI = (Auftragswert − Prognose Endkosten) / Prognose Endkosten */
  roi: number | null;
  /** Ist-Kosten / Budget */
  budgetauslastung: number | null;
  /** Gesamtkostenabweichung = Prognose Endkosten − Budget */
  kostenabweichung: number;
  /** nötige Nachfinanzierung = max(0, Kostenabweichung) */
  nachfinanzierung: number;
  /** größter Verzug offener Aufgaben auf dem kritischen Pfad, in Tagen */
  kritischerPfadVerzug: number;
  kritischeAufgaben: number;
}

export function managementKpis(p: Project, m: Metrics, tasks: Task[], todayStr = todayIso()): ManagementKpis {
  const today = toDay(todayStr);
  const auftragswert = p.auftragswert ?? 0;
  const kritisch = tasks.filter((t) => t.kritisch);
  // Abgeschlossene kritische Aufgaben zählen nur, wenn nichts mehr offen ist (dann: tatsächlicher Endverzug)
  const offen = kritisch.filter((t) => t.fortschritt < 100 && !t.ende_ist);
  const basis = offen.length ? offen : kritisch.slice().sort((a, b) => toDay(b.ende_soll) - toDay(a.ende_soll)).slice(0, 1);
  const kostenabweichung = m.eac - m.bac;
  return {
    auftragswert,
    budget: m.bac,
    istKosten: m.ac,
    eac: m.eac,
    // Ohne Auftragswert (z. B. nach der Migration) ist der Erlös unbekannt – kein Verlust in Höhe der Kosten
    deckungsbeitrag: auftragswert > 0 ? auftragswert - m.eac : null,
    ohneAuftragswert: auftragswert > 0 ? 0 : 1,
    marge: auftragswert > 0 ? (auftragswert - m.eac) / auftragswert : null,
    roi: auftragswert > 0 && m.eac > 0 ? (auftragswert - m.eac) / m.eac : null,
    budgetauslastung: m.bac > 0 ? m.ac / m.bac : null,
    kostenabweichung,
    nachfinanzierung: Math.max(0, kostenabweichung),
    kritischerPfadVerzug: Math.max(0, ...basis.map((t) => taskDelay(t, today))),
    kritischeAufgaben: kritisch.length,
  };
}

/**
 * Summiert Management-KPIs über mehrere Projekte; Quoten werden aus den Summen neu gebildet.
 * Deckungsbeitrag, Marge und ROI zählen nur Projekte mit Auftragswert – sonst gingen deren Kosten als reiner Verlust ein.
 */
export function portfolioManagement(rows: ManagementKpis[]): ManagementKpis {
  const s = (f: (k: ManagementKpis) => number) => sum(rows, f);
  const bewertet = rows.filter((k) => k.deckungsbeitrag !== null);
  const auftragswert = sum(bewertet, (k) => k.auftragswert);
  const eacBewertet = sum(bewertet, (k) => k.eac);
  const eac = s((k) => k.eac);
  const budget = s((k) => k.budget);
  const istKosten = s((k) => k.istKosten);
  return {
    auftragswert,
    budget,
    istKosten,
    eac,
    deckungsbeitrag: bewertet.length ? auftragswert - eacBewertet : null,
    ohneAuftragswert: s((k) => k.ohneAuftragswert),
    marge: auftragswert > 0 ? (auftragswert - eacBewertet) / auftragswert : null,
    roi: auftragswert > 0 && eacBewertet > 0 ? (auftragswert - eacBewertet) / eacBewertet : null,
    budgetauslastung: budget > 0 ? istKosten / budget : null,
    kostenabweichung: eac - budget,
    nachfinanzierung: s((k) => k.nachfinanzierung),
    kritischerPfadVerzug: Math.max(0, ...rows.map((k) => k.kritischerPfadVerzug)),
    kritischeAufgaben: s((k) => k.kritischeAufgaben),
  };
}

export interface RisikoBewertet extends Risiko {
  /** Wahrscheinlichkeit × Auswirkung, 1..25 */
  score: number;
  stufe: 'niedrig' | 'mittel' | 'hoch';
  projekt: string;
}

export const risikoStufe = (score: number): RisikoBewertet['stufe'] => (score >= 15 ? 'hoch' : score >= 8 ? 'mittel' : 'niedrig');

/** Offene Risiken, sortiert nach Eskalation und Risikowert (höchste zuerst). */
export function topRisiken(risiken: Risiko[], projects: Project[], limit = Infinity): RisikoBewertet[] {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  return risiken
    .filter((r) => r.status === 'offen')
    .map((r) => {
      const score = r.wahrscheinlichkeit * r.auswirkung;
      return { ...r, score, stufe: risikoStufe(score), projekt: names.get(r.project_id) ?? '' };
    })
    .sort((a, b) => b.eskalation - a.eskalation || b.score - a.score || a.titel.localeCompare(b.titel))
    .slice(0, limit);
}

export interface KapazitaetZelle {
  monat: string;
  soll: number;
  ist: number;
  /** geplante Stunden / Kapazität; null ohne hinterlegte Kapazität */
  auslastung: number | null;
}
export interface KapazitaetZeile {
  bereich: string;
  kapazitaet: number;
  zellen: KapazitaetZelle[];
  /** Monate mit Auslastung > 100 % */
  engpaesse: number;
}
export interface Kapazitaet {
  monate: string[];
  zeilen: KapazitaetZeile[];
}

const addMonths = (monat: string, n: number) => {
  const [y, m] = monat.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** Auslastung je Bereich und Monat über alle Projekte; Fenster: Vormonat bis `voraus` Monate nach heute. */
export function kapazitaet(aufwand: Aufwand[], bereiche: Bereich[], voraus = 6, todayStr = todayIso()): Kapazitaet {
  const start = addMonths(todayStr.slice(0, 7), -1);
  const monate = Array.from({ length: voraus + 2 }, (_, i) => addMonths(start, i));
  const namen = [...new Set([...bereiche.map((b) => b.name), ...aufwand.map((a) => a.bereich)])];
  const zeilen = namen.map((bereich) => {
    const kap = bereiche.find((b) => b.name === bereich)?.kapazitaet ?? 0;
    const eigene = aufwand.filter((a) => a.bereich === bereich);
    const zellen = monate.map((monat) => {
      const imMonat = eigene.filter((a) => a.monat === monat);
      const soll = sum(imMonat, (a) => a.stunden_soll);
      return { monat, soll, ist: sum(imMonat, (a) => a.stunden_ist), auslastung: kap > 0 ? soll / kap : null };
    });
    return { bereich, kapazitaet: kap, zellen, engpaesse: zellen.filter((z) => (z.auslastung ?? 0) > 1).length };
  });
  return { monate, zeilen };
}

export interface Nps {
  /** −100 … +100; null ohne Bewertungen */
  nps: number | null;
  anzahl: number;
  promotoren: number;
  passive: number;
  detraktoren: number;
  mittelwert: number | null;
}

/** Net Promoter Score: Anteil Promotoren (9–10) minus Anteil Detraktoren (0–6). */
export function nps(feedback: Feedback[]): Nps {
  const n = feedback.length;
  const promotoren = feedback.filter((f) => f.score >= 9).length;
  const detraktoren = feedback.filter((f) => f.score <= 6).length;
  return {
    nps: n ? Math.round(((promotoren - detraktoren) / n) * 100) : null,
    anzahl: n,
    promotoren,
    passive: n - promotoren - detraktoren,
    detraktoren,
    mittelwert: n ? sum(feedback, (f) => f.score) / n : null,
  };
}
