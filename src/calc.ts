import type { Ampel, Cost, Project, Task } from './types';

const DAY = 86400000;

/** ISO-Datum (YYYY-MM-DD) -> Tagesnummer */
export const toDay = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
export const fromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Soll-Fortschritt einer Aufgabe zum Stichtag (0..1), linear über die Plandauer. */
export function taskSoll(t: Task, today: number): number {
  const s = toDay(t.start_soll);
  const e = toDay(t.ende_soll);
  if (t.typ === 'meilenstein' || e <= s) return today >= e ? 1 : 0;
  return clamp01((today - s) / (e - s));
}

/** Terminverzug einer Aufgabe in Tagen (positiv = zu spät). */
export function taskDelay(t: Task, today: number): number {
  const s = toDay(t.start_soll);
  const e = toDay(t.ende_soll);
  if (t.ende_ist) return toDay(t.ende_ist) - e;
  if (t.fortschritt >= 100) return 0;
  if (today > e) return today - e;
  if (t.start_ist) return toDay(t.start_ist) - s;
  if (t.typ === 'phase' && today > s) return today - s;
  return 0;
}

export interface Metrics {
  sollPct: number; // 0..1
  istPct: number; // 0..1
  delayDays: number;
  forecastEnd: string;
  bac: number; // Budget
  pv: number; // Plankosten bis heute
  planTotal: number; // Summe aller Soll-Positionen
  ac: number; // Ist-Kosten
  ev: number; // Leistungswert
  spi: number | null;
  cpi: number | null;
  eac: number; // Prognose Endkosten
  terminAmpel: Ampel;
  kostenAmpel: Ampel;
}

export function projectMetrics(p: Project, tasks: Task[], costs: Cost[], todayStr = todayIso()): Metrics {
  const today = toDay(todayStr);

  // Fortschritt: nach Plandauer gewichteter Mittelwert der Phasen
  let weight = 0;
  let soll = 0;
  let ist = 0;
  for (const t of tasks) {
    if (t.typ !== 'phase') continue;
    const w = Math.max(1, toDay(t.ende_soll) - toDay(t.start_soll));
    weight += w;
    soll += w * taskSoll(t, today);
    ist += w * clamp01(t.fortschritt / 100);
  }
  let sollPct: number;
  let istPct: number;
  if (weight > 0) {
    sollPct = soll / weight;
    istPct = ist / weight;
  } else {
    // Ohne Terminplan: Soll linear über die Projektlaufzeit, Ist unbekannt (= 0)
    const s = toDay(p.start_soll);
    const e = toDay(p.ende_soll);
    sollPct = e > s ? clamp01((today - s) / (e - s)) : today >= e ? 1 : 0;
    istPct = p.status === 'abgeschlossen' ? 1 : 0;
  }

  // Verzug: größter Verzug der offenen Aufgaben; sind alle fertig, zählt die zuletzt geplante
  const open = tasks.filter((t) => t.fortschritt < 100 && !t.ende_ist);
  let delayDays = 0;
  if (open.length) {
    delayDays = Math.max(0, ...open.map((t) => taskDelay(t, today)));
  } else if (tasks.length) {
    const last = tasks.reduce((a, b) => (toDay(b.ende_soll) >= toDay(a.ende_soll) ? b : a));
    delayDays = taskDelay(last, today);
  }
  const forecastEnd = fromDay(toDay(p.ende_soll) + delayDays);

  let pv = 0;
  let planTotal = 0;
  let ac = 0;
  for (const c of costs) {
    if (c.art === 'ist') ac += c.betrag;
    else {
      planTotal += c.betrag;
      if (toDay(c.datum) <= today) pv += c.betrag;
    }
  }
  const bac = p.budget;
  const ev = bac * istPct;
  const spi = sollPct > 0 ? istPct / sollPct : null;
  const cpi = ac > 0 && ev > 0 ? ev / ac : null;
  // Prognose: Rest wird mit bisheriger Kosteneffizienz abgewickelt (mind. bereits angefallene Kosten)
  const eac = Math.max(ac, cpi ? bac / cpi : bac);

  const notStarted = p.status === 'geplant' && ac === 0 && istPct === 0;
  const terminAmpel: Ampel = notStarted && delayDays <= 0 ? 'neutral' : delayDays <= 3 ? 'gruen' : delayDays <= 14 ? 'gelb' : 'rot';
  const over = bac > 0 ? eac / bac - 1 : 0;
  const kostenAmpel: Ampel = notStarted ? 'neutral' : over <= 0.02 ? 'gruen' : over <= 0.1 ? 'gelb' : 'rot';

  return { sollPct, istPct, delayDays, forecastEnd, bac, pv, planTotal, ac, ev, spi, cpi, eac, terminAmpel, kostenAmpel };
}

export interface CostPoint {
  day: number;
  soll: number;
  ist: number | null;
}

/** Kumulierte Soll-/Ist-Kosten je Monatsende (Ist nur bis zum Stichtag). */
export function costCurve(costs: Cost[], todayStr = todayIso()): CostPoint[] {
  if (!costs.length) return [];
  const today = toDay(todayStr);
  const days = costs.map((c) => toDay(c.datum));
  const first = new Date(Math.min(...days) * DAY);
  const lastDay = Math.max(...days);
  const points: CostPoint[] = [];
  // Startpunkt bei 0 am Monatsanfang
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  const startDay = Math.round(Date.UTC(y, m, 1) / DAY);
  points.push({ day: startDay, soll: 0, ist: startDay <= today ? 0 : null });
  for (;;) {
    const end = Math.round(Date.UTC(y, m + 1, 0) / DAY);
    // Laufenden Monat am Stichtag auswerten, damit Soll und Ist vergleichbar sind
    const cut = end > today && startDay <= today && Math.round(Date.UTC(y, m, 1) / DAY) <= today ? today : end;
    const sum = (art: string, until: number) => costs.reduce((a, c) => (c.art === art && toDay(c.datum) <= until ? a + c.betrag : a), 0);
    if (cut !== end) points.push({ day: cut, soll: sum('soll', cut), ist: sum('ist', cut) });
    points.push({ day: end, soll: sum('soll', end), ist: end <= today ? sum('ist', end) : null });
    if (end >= lastDay) break;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return points;
}

export interface CategoryRow {
  kategorie: string;
  soll: number;
  sollBisHeute: number;
  ist: number;
}

export function byCategory(costs: Cost[], todayStr = todayIso()): CategoryRow[] {
  const today = toDay(todayStr);
  const map = new Map<string, CategoryRow>();
  for (const c of costs) {
    let row = map.get(c.kategorie);
    if (!row) map.set(c.kategorie, (row = { kategorie: c.kategorie, soll: 0, sollBisHeute: 0, ist: 0 }));
    if (c.art === 'ist') row.ist += c.betrag;
    else {
      row.soll += c.betrag;
      if (toDay(c.datum) <= today) row.sollBisHeute += c.betrag;
    }
  }
  return [...map.values()].sort((a, b) => b.soll - a.soll);
}
