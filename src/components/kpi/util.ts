// Gemeinsame Bausteine der KPI-Ansichten: Daten je Projekt bündeln, Ampel-Schwellen, Formatierung.
import { projectMetrics, toDay, type Metrics } from '../../calc';
import { month, pct } from '../../format';
import { managementKpis, standardKpis, type ManagementKpis, type StandardKpis } from '../../kpi';
import type { Aenderung, Ampel, Aufwand, Cost, Data, Feedback, Mangel, Project, Risiko, Task } from '../../types';

export interface ProjectRow {
  p: Project;
  m: Metrics;
  k: StandardKpis;
  mk: ManagementKpis;
  tasks: Task[];
  costs: Cost[];
  aufwand: Aufwand[];
  aenderungen: Aenderung[];
  maengel: Mangel[];
  risiken: Risiko[];
  feedback: Feedback[];
}

export function projectRow(p: Project, data: Data): ProjectRow {
  const own = <T extends { project_id: number }>(rows: T[]) => rows.filter((r) => r.project_id === p.id);
  const tasks = own(data.tasks);
  const costs = own(data.costs);
  const aufwand = own(data.aufwand);
  const aenderungen = own(data.aenderungen);
  const maengel = own(data.maengel);
  const m = projectMetrics(p, tasks, costs);
  return {
    p, m, tasks, costs, aufwand, aenderungen, maengel, risiken: own(data.risiken), feedback: own(data.feedback),
    k: standardKpis(p, m, tasks, aufwand, aenderungen, maengel),
    mk: managementKpis(p, m, tasks),
  };
}

export const projectRows = (data: Data) => data.projects.map((p) => projectRow(p, data));

/** Portfolio-Summen der Standard-KPIs: alle Zeilen der gezeigten Projekte als ein Gesamtprojekt gerechnet (SPI/CPI/fertig daraus nicht verwenden). */
export function portfolioStandard(rows: ProjectRow[]): StandardKpis | null {
  if (!rows.length) return null;
  const all = <T,>(f: (r: ProjectRow) => T[]) => rows.flatMap(f);
  const budget = rows.reduce((a, r) => a + (r.p.budget ?? 0), 0);
  return standardKpis({ ...rows[0].p, budget }, rows[0].m, all((r) => r.tasks), all((r) => r.aufwand), all((r) => r.aenderungen), all((r) => r.maengel));
}

/* ---------- Ampel-Schwellen ---------- */

/** SPI/CPI: ab 0,95 im Plan, ab 0,85 Achtung, darunter kritisch. */
export const indexAmpel = (x: number | null): Ampel => (x === null ? 'neutral' : x >= 0.95 ? 'gruen' : x >= 0.85 ? 'gelb' : 'rot');
export const quoteAmpel = (x: number | null, gut = 0.9, ok = 0.7): Ampel => (x === null ? 'neutral' : x >= gut ? 'gruen' : x >= ok ? 'gelb' : 'rot');
/** Je kleiner, desto besser (Überschreitungen, Quoten). */
export const limitAmpel = (x: number | null, gut: number, ok: number): Ampel => (x === null ? 'neutral' : x <= gut ? 'gruen' : x <= ok ? 'gelb' : 'rot');
export const delayAmpel = (tage: number): Ampel => limitAmpel(tage, 3, 14);
export const maengelAmpel = (k: StandardKpis): Ampel => (!k.maengelGesamt ? 'neutral' : k.maengelKritischOffen ? 'rot' : k.maengelOffen ? 'gelb' : 'gruen');
/** Offene Anträge sind nie grün – es steht noch eine Entscheidung aus. */
export function aenderungAmpel(k: StandardKpis): Ampel {
  if (!k.crGesamt) return 'neutral';
  const quote = k.aenderungsquote !== null ? limitAmpel(k.aenderungsquote, 0.05, 0.1) : 'gruen';
  return quote === 'gruen' && k.crOffen ? 'gelb' : quote;
}
export const margeAmpel = (x: number | null): Ampel => (x === null ? 'neutral' : x >= 0.1 ? 'gruen' : x >= 0 ? 'gelb' : 'rot');
export const npsAmpel = (x: number | null): Ampel => (x === null ? 'neutral' : x >= 30 ? 'gruen' : x >= 0 ? 'gelb' : 'rot');
export const stufeAmpel = { niedrig: 'gruen', mittel: 'gelb', hoch: 'rot' } as const;
export const stufeText = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch' } as const;

export const AMPEL_TEXT: Record<Ampel, string> = { gruen: 'Im Plan', gelb: 'Achtung', rot: 'Kritisch', neutral: 'Offen' };
export const AMPEL_ICON: Record<Ampel, string> = { gruen: 'check', gelb: 'warn', rot: 'alert', neutral: 'circle' };

/* ---------- Formatierung ---------- */

const n0 = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0, useGrouping: 'always' });
const n1 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const hours = (n: number) => `${n0.format(n)} h`;
export const pctOrDash = (x: number | null) => (x === null ? '–' : pct(x));
export const signedPct = (x: number | null) => (x === null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${n0.format(Math.abs(x) * 100)} %`);
export const signedHours = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${n0.format(Math.abs(n))} h`;
export const signedNps = (x: number | null) => (x === null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}`);
export const score1 = (x: number | null) => (x === null ? '–' : n1.format(x));
/** YYYY-MM → „Nov. 26“ */
export const monthLabel = (monat: string) => month(toDay(`${monat}-01`));
export const tageText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${n0.format(Math.abs(n))} ${Math.abs(n) === 1 ? 'Tag' : 'Tage'}`;
