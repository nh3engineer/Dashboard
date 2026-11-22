// Inhalte der einzelnen Berichte. Alle Zahlen stammen aus calc.ts / kpi.ts – hier wird nur angeordnet.
// Was der Benutzer nicht sehen darf, kommt vom Server gar nicht erst an; die zugehörigen Abschnitte entfallen.
import type { jsPDF } from 'jspdf';
import { byCategory, projectMetrics, taskDelay, toDay, todayIso, type Metrics } from '../calc';
import {
  AMPEL_TEXT, aenderungAmpel, delayAmpel, hours, indexAmpel, limitAmpel, maengelAmpel, margeAmpel, monthLabel, npsAmpel,
  pctOrDash, quoteAmpel, score1, signedNps, signedPct, stufeAmpel, stufeText, tageText,
} from '../components/kpi/util';
import { date, days, eur, eurCompact, index, pct, signedEur } from '../format';
import {
  kapazitaet, managementKpis, nps, portfolioManagement, standardKpis, topRisiken,
  type ManagementKpis, type RisikoBewertet, type StandardKpis,
} from '../kpi';
import type { Aenderung, Ampel, Aufwand, Cost, Data, Feedback, Mangel, Project, Risiko, Status, Task } from '../types';
import { gantt, kostenverlauf } from './charts';
import type { BerichtCtx, BerichtId } from './index';
import { Bericht, type BerichtMeta, type Kachel, type Spalte, type Zelle } from './layout';

const STATUS: Record<Status, string> = { geplant: 'Geplant', laufend: 'Laufend', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen' };
const CR_STATUS: Record<Aenderung['status'], string> = { offen: 'Offen', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt' };
const SCHWERE: Record<Mangel['schwere'], string> = { gering: 'Gering', mittel: 'Mittel', kritisch: 'Kritisch' };

const terminWert = (m: Metrics) => (m.terminAmpel === 'neutral' ? 'Offen' : m.delayDays === 0 ? 'Kein Verzug' : days(m.delayDays));
const ampelZelle = (ampel: Ampel, text = AMPEL_TEXT[ampel]): Zelle => ({ text, ampel });
/** Bewertung nur zeigen, wenn es etwas zu bewerten gibt. */
const bewertung = (ampel: Ampel): Zelle => (ampel === 'neutral' ? null : ampelZelle(ampel));
const R = (titel: string, breite?: number): Spalte => ({ titel, rechts: true, breite });
const L = (titel: string, breite?: number): Spalte => ({ titel, breite });
/** linksbündig, nie umbrechen (Datum, Status) */
const E = (titel: string): Spalte => ({ titel, eng: true });
/** Spalten/Zellen/Kacheln, die nur mit Berechtigung erscheinen. */
const wenn = <T,>(bedingung: unknown, ...items: T[]): T[] => (bedingung ? items : []);

interface Zeile {
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

function zeile(p: Project, data: Data, heute: string): Zeile {
  const own = <T extends { project_id: number }>(rows: T[]) => rows.filter((r) => r.project_id === p.id);
  const tasks = own(data.tasks);
  const costs = own(data.costs);
  const aufwand = own(data.aufwand);
  const aenderungen = own(data.aenderungen);
  const maengel = own(data.maengel);
  const m = projectMetrics(p, tasks, costs, heute);
  return {
    p, m, tasks, costs, aufwand, aenderungen, maengel, risiken: own(data.risiken), feedback: own(data.feedback),
    k: standardKpis(p, m, tasks, aufwand, aenderungen, maengel, heute),
    mk: managementKpis(p, m, tasks, heute),
  };
}

function start(ctx: BerichtCtx) {
  const heute = ctx.heute ?? todayIso();
  return { heute, today: toDay(heute), can: ctx.can, data: ctx.data };
}

function projekt(ctx: BerichtCtx, heute: string): Zeile {
  const p = ctx.data.projects.find((x) => x.id === ctx.projectId);
  if (!p) throw new Error('Projekt nicht gefunden.');
  return zeile(p, ctx.data, heute);
}

function meta(ctx: BerichtCtx, titel: string, heute: string, p?: Project, vermerk?: string): BerichtMeta {
  const n = ctx.data.projects.length;
  return {
    titel,
    untertitel: p ? p.name : `${n} ${n === 1 ? 'Projekt' : 'Projekte'}`,
    infos: p ? [...wenn(p.kunde, `Kunde: ${p.kunde}`), ...wenn(p.leiter, `Projektleitung: ${p.leiter}`)] : [],
    stand: heute,
    benutzer: ctx.me.name || ctx.me.benutzername,
    vermerk,
  };
}

const nachSollTermin = (a: Task, b: Task) => toDay(a.start_soll) - toDay(b.start_soll) || toDay(a.ende_soll) - toDay(b.ende_soll) || a.id - b.id;
const istFertig = (t: Task) => !!t.ende_ist || t.fortschritt >= 100;
/** Noch nicht begonnen und noch nicht fällig: weder gut noch schlecht. */
const unberuehrt = (t: Task, d: number) => !t.start_ist && !t.ende_ist && t.fortschritt <= 0 && d <= 0;

function taskStatus(t: Task, today: number): { abweichung: string | null; status: Zelle } {
  const d = taskDelay(t, today);
  if (unberuehrt(t, d)) return { abweichung: null, status: ampelZelle('neutral') };
  return { abweichung: days(d), status: ampelZelle(delayAmpel(d)) };
}

/* ---------- wiederverwendete Abschnitte ---------- */

function terminKacheln(z: Zeile): Kachel[] {
  const { p, m, k } = z;
  return [
    { label: 'Fortschritt Ist', wert: pct(m.istPct), sub: `Soll ${pct(m.sollPct)}` },
    { label: 'Termin', wert: terminWert(m), sub: AMPEL_TEXT[m.terminAmpel], ampel: m.terminAmpel },
    { label: 'Prognose Ende', wert: date(m.forecastEnd), sub: `Soll-Ende ${date(p.ende_soll)}` },
    ...wenn(k.msGesamt > 0, { label: 'Meilensteine erreicht', wert: `${k.msErreicht} von ${k.msGesamt}`, sub: `${k.msFaellig} bis heute fällig` }),
  ];
}

function meilensteinTabelle(b: Bericht, tasks: Task[], today: number, kritisch: boolean) {
  const ms = tasks.filter((t) => t.typ === 'meilenstein').sort((a, c) => toDay(a.ende_soll) - toDay(c.ende_soll));
  if (!ms.length) return;
  b.abschnitt('Meilensteine');
  b.tabelle(
    [L('Meilenstein'), L('Soll-Termin', 26), L('Ist-Termin', 26), R('Abweichung', 26), ...wenn(kritisch, L('Krit. Pfad', 20)), L('Status', 28)],
    ms.map((t) => {
      const s = taskStatus(t, today);
      return [t.name, date(t.ende_soll), t.ende_ist ? date(t.ende_ist) : istFertig(t) ? 'erreicht' : null, s.abweichung, ...wenn(kritisch, t.kritisch ? 'Ja' : null), s.status];
    }),
  );
}

function phasenTabelle(b: Bericht, tasks: Task[], today: number, kritisch: boolean) {
  const phasen = tasks.filter((t) => t.typ === 'phase').sort(nachSollTermin);
  if (!phasen.length) return;
  b.abschnitt('Phasen');
  b.tabelle(
    [L('Phase'), E('Start Soll'), E('Ende Soll'), E('Start Ist'), E('Ende Ist'), R('Fortschritt'), R('Abweichung'), ...wenn(kritisch, E(b.quer ? 'Krit. Pfad' : 'KP')), E('Status')],
    phasen.map((t) => {
      const s = taskStatus(t, today);
      return [t.name, date(t.start_soll), date(t.ende_soll), t.start_ist && date(t.start_ist), t.ende_ist && date(t.ende_ist), `${Math.round(t.fortschritt)} %`, s.abweichung, ...wenn(kritisch, t.kritisch ? 'Ja' : null), s.status];
    }),
    { schrift: 8, dicht: !b.quer },
  );
  if (kritisch && !b.quer && phasen.some((t) => t.kritisch)) b.hinweis('KP = Aufgabe liegt auf dem kritischen Pfad.');
}

function kategorieTabelle(b: Bericht, z: Zeile, heute: string) {
  const rows = byCategory(z.costs, heute);
  if (!rows.length) return;
  b.abschnitt('Kosten nach Kategorie');
  b.tabelle(
    [L('Kategorie'), R('Soll gesamt'), R('Soll bis heute'), R('Ist'), R('Abweichung bis heute')],
    rows.map((r) => [r.kategorie, eur(r.soll), eur(r.sollBisHeute), eur(r.ist), signedEur(r.ist - r.sollBisHeute)]),
    { summe: ['Summe', eur(z.m.planTotal), eur(z.m.pv), eur(z.m.ac), signedEur(z.m.ac - z.m.pv)] },
  );
}

/** Prognose und CPI hängen am Fortschritt – ohne Terminrechte wären sie nicht aussagekräftig. */
function kostenKacheln(z: Zeile, mitPrognose: boolean, mitCpi: boolean): Kachel[] {
  const { p, m } = z;
  const budget = p.budget !== undefined && p.budget !== null;
  return [
    ...wenn(budget, { label: 'Budget', wert: eurCompact(m.bac), sub: `Verplant ${eurCompact(m.planTotal)}` }),
    { label: 'Ist-Kosten', wert: eurCompact(m.ac), sub: `${signedEur(m.ac - m.pv)} ggü. Plan bis heute` },
    ...wenn(budget && mitPrognose, { label: 'Prognose (ggü. Budget)', wert: eurCompact(m.eac), sub: `${AMPEL_TEXT[m.kostenAmpel]} · ${signedEur(m.eac - m.bac)}`, ampel: m.kostenAmpel }),
    ...wenn(budget && mitPrognose && mitCpi && m.cpi !== null, { label: 'CPI (Kosteneffizienz)', wert: index(m.cpi), sub: AMPEL_TEXT[indexAmpel(m.cpi)], ampel: indexAmpel(m.cpi) }),
  ];
}

function risikoTabelle(b: Bericht, risiken: RisikoBewertet[], mitProjekt: boolean) {
  // Legende vor der Tabelle: dahinter stünde sie nach einem Seitenumbruch allein auf einer sonst leeren Seite
  b.hinweis('W = Eintrittswahrscheinlichkeit, A = Auswirkung (jeweils 1 bis 5); Risikowert = W × A. Eskalation: Entscheidung des Managements nötig.');
  b.tabelle(
    [L('Risiko', mitProjekt ? 52 : 44), ...wenn(mitProjekt, L('Projekt', 40)), R('W', 9), R('A', 9), R('Wert', 11), L('Stufe', 20), L('Eskalation', 20), L('Maßnahme')],
    risiken.map((r) => [
      { text: r.titel, fett: !!r.eskalation }, ...wenn(mitProjekt, r.projekt), r.wahrscheinlichkeit, r.auswirkung, r.score,
      ampelZelle(stufeAmpel[r.stufe], stufeText[r.stufe]), r.eskalation ? { text: 'Ja', fett: true } : null, r.massnahme,
    ]),
    { schrift: 8 },
  );
}

function risikoKacheln(risiken: RisikoBewertet[]): Kachel[] {
  const n = (stufe: RisikoBewertet['stufe']) => String(risiken.filter((r) => r.stufe === stufe).length);
  return [
    { label: 'Offene Risiken', wert: String(risiken.length) },
    { label: 'Stufe hoch', wert: n('hoch'), sub: 'Risikowert ab 15', ampel: 'rot' },
    { label: 'Stufe mittel', wert: n('mittel'), sub: 'Risikowert 8 bis 14', ampel: 'gelb' },
    { label: 'Stufe niedrig', wert: n('niedrig'), sub: 'Risikowert unter 8', ampel: 'gruen' },
    { label: 'Eskalationen', wert: String(risiken.filter((r) => r.eskalation).length), sub: 'Entscheidung nötig' },
  ];
}

/* ---------- 1. Projektstatusbericht ---------- */

function projektstatus(ctx: BerichtCtx): jsPDF {
  const { heute, today, can } = start(ctx);
  const z = projekt(ctx, heute);
  const { p, m, k } = z;
  const kosten = can('kosten.ansehen');
  const b = new Bericht(meta(ctx, 'Projektstatusbericht', heute, p));

  b.paare([
    ['Kunde', p.kunde], ['Projektleitung', p.leiter], ['Status', STATUS[p.status]],
    ['Laufzeit (Soll)', `${date(p.start_soll)} – ${date(p.ende_soll)}`],
    ...wenn<[string, string]>(kosten && p.budget != null, ['Budget', eur(p.budget ?? 0)]),
  ]);
  b.absatz(p.beschreibung);

  b.abschnitt('Überblick', 45);
  b.kacheln([
    ...terminKacheln(z).slice(0, 3),
    ...wenn(kosten && p.budget != null, { label: 'Kosten ggü. Budget', wert: signedEur(m.eac - m.bac), sub: AMPEL_TEXT[m.kostenAmpel], ampel: m.kostenAmpel }),
  ]);
  b.fortschritt(m.sollPct, m.istPct, pct(m.sollPct), pct(m.istPct));

  meilensteinTabelle(b, z.tasks, today, false);
  phasenTabelle(b, z.tasks, today, true);

  if (kosten) {
    b.abschnitt('Kostenübersicht', 40);
    b.kacheln(kostenKacheln(z, true, false));
    kategorieTabelle(b, z, heute);
  }

  if (can('kpi.standard')) {
    const rows: Zelle[][] = [
      ...wenn(k.spi !== null, ['SPI (Terminleistung)', index(k.spi), bewertung(indexAmpel(k.spi)), 'Leistungswert / Planwert; unter 1,00 = Verzug']),
      ...wenn(kosten && k.cpi !== null, ['CPI (Kosteneffizienz)', index(k.cpi), bewertung(indexAmpel(k.cpi)), 'Leistungswert / Ist-Kosten; unter 1,00 = Kostenüberschreitung']),
      ['Fertigstellungsgrad', pct(k.fertig), null, `${k.phasenFertig} von ${k.phasenGesamt} Phasen abgeschlossen`],
      ...wenn(k.msGesamt > 0, ['Meilenstein-Termintreue', pctOrDash(k.msQuote), bewertung(quoteAmpel(k.msQuote)), `${k.msTermingerecht} termingerecht · ${k.msErreicht} von ${k.msGesamt} erreicht · ${k.msFaellig} bis heute fällig`]),
      ...wenn(can('ressourcen.ansehen') && z.aufwand.length, [
        'Aufwand (Stunden)', `${hours(k.stundenIst)} Ist`, bewertung(limitAmpel(k.aufwandAbw, 0.05, 0.15)),
        `Soll bis heute ${hours(k.stundenSoll)}${k.aufwandAbw === null ? '' : ` (${signedPct(k.aufwandAbw)})`} · Soll gesamt ${hours(k.stundenSollGesamt)}`,
      ]),
      ...wenn(can('aenderungen.ansehen') && k.crGesamt > 0, [
        'Änderungen', `${k.crOffen} offen / ${k.crGenehmigt} genehmigt`, bewertung(aenderungAmpel(k)),
        [...wenn(kosten, `Genehmigte Mehrkosten ${eur(k.crKosten)}`), ...wenn(kosten && k.aenderungsquote !== null, `Änderungsquote ${pctOrDash(k.aenderungsquote)}`), `Terminauswirkung ${tageText(k.crTage)}`].join(' · '),
      ]),
      ...wenn(can('qualitaet.ansehen') && k.maengelGesamt > 0, [
        'Mängel', `${k.maengelOffen} offen`, bewertung(maengelAmpel(k)),
        `davon ${k.maengelKritischOffen} kritisch · Behebungsquote ${pctOrDash(k.behebungsquote)} · Nacharbeit ${hours(k.nacharbeitStunden)}`,
      ]),
    ];
    b.abschnitt('Standard-KPIs');
    b.tabelle([L('Kennzahl', 42), R('Wert', 36), L('Bewertung', 24), L('Erläuterung')], rows);
  }

  if (can('aenderungen.ansehen')) {
    const offen = z.aenderungen.filter((c) => c.status === 'offen').sort((a, c) => a.datum.localeCompare(c.datum));
    b.abschnitt('Offene Änderungen');
    if (!offen.length) b.hinweis('Keine offenen Änderungen.');
    b.tabelle(
      [L('Datum', 22), L('Änderung'), ...wenn(kosten, R('Kosten', 28)), R('Terminauswirkung', 30)],
      offen.map((c) => [date(c.datum), c.titel, ...wenn(kosten, c.kosten == null ? null : eur(c.kosten)), tageText(c.tage)]),
    );
  }

  if (can('qualitaet.ansehen')) {
    const offen = z.maengel.filter((x) => x.status === 'offen').sort((a, c) => a.datum.localeCompare(c.datum));
    b.abschnitt('Offene Mängel');
    if (!offen.length) b.hinweis('Keine offenen Mängel.');
    b.tabelle(
      [L('Datum', 22), L('Mangel'), L('Schwere', 24), R('Nacharbeit', 26)],
      offen.map((x) => [date(x.datum), x.titel, { text: SCHWERE[x.schwere], fett: x.schwere === 'kritisch' }, hours(x.nacharbeit_stunden)]),
    );
  }

  if (can('risiken.ansehen')) {
    const offen = topRisiken(z.risiken, [p]);
    b.abschnitt('Offene Risiken');
    if (!offen.length) b.hinweis('Keine offenen Risiken.');
    else risikoTabelle(b, offen, false);
  }
  return b.fertig();
}

/* ---------- 2. Terminbericht ---------- */

function terminbericht(ctx: BerichtCtx): jsPDF {
  const { heute, today } = start(ctx);
  const z = projekt(ctx, heute);
  const { m } = z;
  const b = new Bericht(meta(ctx, 'Terminbericht', heute, z.p), true);
  const kritisch = z.tasks.filter((t) => t.kritisch).length;

  b.kacheln([
    ...terminKacheln(z),
    ...wenn(kritisch > 0, { label: 'Kritischer Pfad', wert: `${kritisch} ${kritisch === 1 ? 'Aufgabe' : 'Aufgaben'}`, sub: 'im Plan mit „KP“ gekennzeichnet' }),
  ]);
  b.fortschritt(m.sollPct, m.istPct, pct(m.sollPct), pct(m.istPct));

  if (!z.tasks.length) {
    b.hinweis('Für dieses Projekt sind noch keine Termine erfasst.');
    return b.fertig();
  }
  b.abschnitt('Terminplan Soll / Ist', 50);
  gantt(b, z.tasks.slice().sort(nachSollTermin), heute, true);
  phasenTabelle(b, z.tasks, today, true);
  meilensteinTabelle(b, z.tasks, today, true);
  b.hinweis('Abweichung in Tagen gegenüber dem Soll-Termin (+ = später). Status: Im Plan bis 3 Tage, Achtung bis 14 Tage, darüber Kritisch.');
  return b.fertig();
}

/* ---------- 3. Kostenbericht ---------- */

function kostenbericht(ctx: BerichtCtx): jsPDF {
  const { heute, can } = start(ctx);
  const z = projekt(ctx, heute);
  const b = new Bericht(meta(ctx, 'Kostenbericht', heute, z.p));

  b.kacheln(kostenKacheln(z, can('termine.ansehen'), true));
  if (!z.costs.length) {
    b.hinweis('Für dieses Projekt sind noch keine Kosten erfasst.');
    return b.fertig();
  }
  b.abschnitt('Kostenverlauf (kumuliert)', 90);
  if (!kostenverlauf(b, z.costs, z.p.budget, heute)) b.hinweis('Für ein Diagramm liegen noch zu wenige Kostenpositionen vor.');
  kategorieTabelle(b, z, heute);

  b.abschnitt('Kostenpositionen');
  b.tabelle(
    [L('Datum', 22), L('Kategorie', 36), L('Bezeichnung'), L('Art', 14), R('Betrag', 28)],
    z.costs.slice().sort((a, c) => a.datum.localeCompare(c.datum) || a.art.localeCompare(c.art) || a.id - c.id)
      .map((c) => [date(c.datum), c.kategorie, c.bezeichnung, c.art === 'ist' ? 'Ist' : 'Soll', eur(c.betrag)]),
    { schrift: 8 },
  );
  return b.fertig();
}

/* ---------- 4. Portfolio-Übersicht ---------- */

const ampelZahl = (rows: Zeile[], f: (z: Zeile) => Ampel) => {
  const n = (a: Ampel) => rows.filter((z) => f(z) === a).length;
  return { wert: `${n('gruen')} / ${n('gelb')} / ${n('rot')}`, sub: 'Im Plan / Achtung / Kritisch' };
};

function portfolio(ctx: BerichtCtx): jsPDF {
  const { heute, can, data } = start(ctx);
  const rows = data.projects.map((p) => zeile(p, data, heute));
  const termine = can('termine.ansehen');
  const kosten = can('kosten.ansehen');
  const kpi = can('kpi.standard');
  const b = new Bericht(meta(ctx, 'Portfolio-Übersicht', heute), true);
  if (!rows.length) {
    b.hinweis('Ihnen sind derzeit keine Projekte zugewiesen.');
    return b.fertig();
  }
  const summe = portfolioManagement(rows.map((z) => z.mk));
  const status = (s: Status) => rows.filter((z) => z.p.status === s).length;

  b.kacheln([
    { label: 'Projekte', wert: String(rows.length), sub: `${status('laufend')} laufend · ${status('geplant')} geplant · ${status('abgeschlossen')} fertig` },
    ...wenn(termine, { label: 'Terminampeln', ...ampelZahl(rows, (z) => z.m.terminAmpel) }),
    ...wenn(kosten, { label: 'Kostenampeln', ...ampelZahl(rows, (z) => z.m.kostenAmpel) }),
    ...wenn(kosten, { label: 'Budget gesamt', wert: eurCompact(summe.budget) }, { label: 'Ist-Kosten gesamt', wert: eurCompact(summe.istKosten), sub: summe.budgetauslastung === null ? undefined : `${pctOrDash(summe.budgetauslastung)} des Budgets` }),
    ...wenn(kosten && termine, { label: 'Prognose Endkosten', wert: eurCompact(summe.eac), sub: `${signedEur(summe.kostenabweichung)} ggü. Budget` }),
  ]);

  b.abschnitt('Projekte');
  b.tabelle(
    [
      L('Projekt'), L('Kunde'), E('Status'), ...wenn(!termine, E('Ende Soll')),
      ...wenn(termine, R('Soll'), R('Ist'), E('Termin'), R('Verzug'), E('Prognose Ende')),
      ...wenn(kosten, R('Budget'), R('Ist-Kosten'), ...wenn(termine, R('Prognose')), E('Kosten')),
      ...wenn(kpi && termine, R('SPI')), ...wenn(kpi && termine && kosten, R('CPI')),
    ],
    rows.map(({ p, m }) => [
      { text: p.name, fett: true }, p.kunde, STATUS[p.status], ...wenn<Zelle>(!termine, date(p.ende_soll)),
      ...wenn<Zelle>(termine, pct(m.sollPct), pct(m.istPct), ampelZelle(m.terminAmpel), m.terminAmpel === 'neutral' ? null : days(m.delayDays), date(m.forecastEnd)),
      ...wenn<Zelle>(kosten, p.budget == null ? null : eur(p.budget), eur(m.ac), ...wenn(termine, p.budget == null ? null : eur(m.eac)), ampelZelle(m.kostenAmpel)),
      ...wenn<Zelle>(kpi && termine, m.spi === null ? null : index(m.spi)), ...wenn<Zelle>(kpi && termine && kosten, m.cpi === null ? null : index(m.cpi)),
    ]),
    { schrift: kosten ? 7.8 : 8.5, dicht: kosten },
  );
  if (termine) b.hinweis('Soll / Ist = Fortschritt in Prozent zum Stichtag. Verzug in Tagen gegenüber dem Soll-Termin (+ = später).');
  return b.fertig();
}

/* ---------- 5. Management-Bericht ---------- */

function management(ctx: BerichtCtx): jsPDF {
  const { heute, can, data } = start(ctx);
  const rows = data.projects.map((p) => zeile(p, data, heute));
  const b = new Bericht(meta(ctx, 'Management-Bericht', heute, undefined, 'Vertraulich – nur für das Management'), true);
  if (!rows.length) {
    b.hinweis('Es sind keine Projekte vorhanden.');
    return b.fertig();
  }
  const pm = portfolioManagement(rows.map((z) => z.mk));
  // Auftragswert, Budget und Ist-Kosten kommen nur mit den passenden Rechten – ohne sie wären die Quoten falsch
  const kosten = can('kosten.ansehen');
  const termine = can('termine.ansehen');

  if (kosten) {
    b.abschnitt('Wirtschaftlichkeit: ROI, Deckungsbeitrag, Marge', 45);
    b.kacheln([
      { label: 'Auftragswert', wert: eurCompact(pm.auftragswert) },
      { label: 'Prognose Endkosten', wert: eurCompact(pm.eac) },
      { label: 'Deckungsbeitrag (Prognose)', wert: pm.deckungsbeitrag === null ? '–' : eurCompact(pm.deckungsbeitrag) },
      ...wenn(pm.marge !== null, { label: 'Marge', wert: pctOrDash(pm.marge), sub: AMPEL_TEXT[margeAmpel(pm.marge)], ampel: margeAmpel(pm.marge) }),
      ...wenn(pm.roi !== null, { label: 'ROI', wert: pctOrDash(pm.roi), sub: 'Deckungsbeitrag / Endkosten' }),
    ]);
    b.tabelle(
      [L('Projekt'), L('Kunde'), R('Auftragswert'), R('Prognose Endkosten'), R('Deckungsbeitrag'), R('Marge'), L('Bewertung'), R('ROI')],
      rows.map(({ p, mk }) => [
        { text: p.name, fett: true }, p.kunde, mk.auftragswert > 0 ? eur(mk.auftragswert) : null, eur(mk.eac),
        mk.deckungsbeitrag === null ? null : eur(mk.deckungsbeitrag), mk.marge === null ? null : pctOrDash(mk.marge), bewertung(margeAmpel(mk.marge)), mk.roi === null ? null : pctOrDash(mk.roi),
      ]),
      { summe: ['Portfolio', null, eur(pm.auftragswert), eur(pm.eac), pm.deckungsbeitrag === null ? null : eur(pm.deckungsbeitrag), pm.marge === null ? null : pctOrDash(pm.marge), null, pm.roi === null ? null : pctOrDash(pm.roi)] },
    );
    if (pm.ohneAuftragswert > 0) b.hinweis(`${pm.ohneAuftragswert === 1 ? 'Bei einem Projekt' : `Bei ${pm.ohneAuftragswert} Projekten`} ist kein Auftragswert hinterlegt. Deckungsbeitrag, Marge und ROI des Portfolios rechnen nur mit den übrigen Projekten.`);

    b.abschnitt('Budgetauslastung, Kostenabweichung und Nachfinanzierung', 45);
    b.kacheln([
      { label: 'Budget gesamt', wert: eurCompact(pm.budget) },
      { label: 'Ist-Kosten', wert: eurCompact(pm.istKosten) },
      ...wenn(pm.budgetauslastung !== null, { label: 'Budgetauslastung', wert: pctOrDash(pm.budgetauslastung), sub: 'Ist-Kosten / Budget' }),
      { label: 'Kostenabweichung', wert: signedEur(pm.kostenabweichung), sub: 'Prognose Endkosten ggü. Budget' },
      { label: 'Nachfinanzierungsbedarf', wert: eurCompact(pm.nachfinanzierung), sub: `${rows.filter((z) => z.mk.nachfinanzierung > 0).length} Projekt(e) über Budget` },
    ]);
    b.tabelle(
      [L('Projekt'), R('Budget'), R('Ist-Kosten'), R('Auslastung'), R('Prognose Endkosten'), R('Kostenabweichung'), R('Nachfinanzierung'), L('Kosten')],
      rows.map(({ p, m, mk }) => [
        { text: p.name, fett: true }, eur(mk.budget), eur(mk.istKosten), mk.budgetauslastung === null ? null : pctOrDash(mk.budgetauslastung),
        eur(mk.eac), signedEur(mk.kostenabweichung), mk.nachfinanzierung > 0 ? { text: eur(mk.nachfinanzierung), fett: true } : null, ampelZelle(m.kostenAmpel),
      ]),
      { summe: ['Portfolio', eur(pm.budget), eur(pm.istKosten), pm.budgetauslastung === null ? null : pctOrDash(pm.budgetauslastung), eur(pm.eac), signedEur(pm.kostenabweichung), eur(pm.nachfinanzierung), null] },
    );
  }

  if (termine) {
    const status = (s: Status) => rows.filter((z) => z.p.status === s).length;
    b.abschnitt('Portfolio-Status und kritischer Pfad', 45);
    b.kacheln([
      { label: 'Projekte', wert: String(rows.length), sub: `${status('laufend')} laufend · ${status('geplant')} geplant · ${status('abgeschlossen')} fertig` },
      { label: 'Terminampeln', ...ampelZahl(rows, (z) => z.m.terminAmpel) },
      { label: 'Kritischer Pfad: größter Verzug', wert: pm.kritischerPfadVerzug > 0 ? tageText(pm.kritischerPfadVerzug) : 'Im Plan', sub: AMPEL_TEXT[delayAmpel(pm.kritischerPfadVerzug)], ampel: delayAmpel(pm.kritischerPfadVerzug) },
      { label: 'Aufgaben auf kritischem Pfad', wert: String(pm.kritischeAufgaben) },
    ]);
    b.tabelle(
      [L('Projekt'), L('Status'), R('Fortschritt Soll'), R('Fortschritt Ist'), L('Termin'), R('Verzug'), L('Prognose Ende'), R('Krit. Pfad: Aufgaben'), R('Krit. Pfad: Verzug'), L('Krit. Pfad')],
      rows.map(({ p, m, mk }) => [
        { text: p.name, fett: true }, STATUS[p.status], pct(m.sollPct), pct(m.istPct), ampelZelle(m.terminAmpel), m.terminAmpel === 'neutral' ? null : days(m.delayDays), date(m.forecastEnd),
        mk.kritischeAufgaben || null, mk.kritischeAufgaben ? (mk.kritischerPfadVerzug > 0 ? tageText(mk.kritischerPfadVerzug) : 'im Plan') : null,
        mk.kritischeAufgaben ? ampelZelle(delayAmpel(mk.kritischerPfadVerzug)) : null,
      ]),
    );
  }

  if (can('risiken.ansehen')) {
    const alle = topRisiken(data.risiken, data.projects);
    b.abschnitt('Top-Risiken und Eskalationen', 45);
    if (!alle.length) b.hinweis('Keine offenen Risiken.');
    else {
      b.kacheln(risikoKacheln(alle));
      if (alle.length > 10) b.hinweis(`Die 10 wichtigsten von ${alle.length} offenen Risiken; die vollständige Liste enthält der Risikobericht.`);
      risikoTabelle(b, alle.slice(0, 10), true);
    }
  }

  if (can('ressourcen.ansehen')) {
    const kap = kapazitaet(data.aufwand, data.bereiche, 6, heute);
    if (kap.zeilen.length) {
      const engpaesse = kap.zeilen.reduce((a, z) => a + z.engpaesse, 0);
      b.abschnitt('Kapazitätsengpässe', 45);
      b.tabelle(
        [L('Bereich'), R('Kapazität / Monat'), ...kap.monate.map((mo) => R(monthLabel(mo))), R('Engpass-Monate')],
        kap.zeilen.map((z) => [
          { text: z.bereich, fett: true }, z.kapazitaet > 0 ? hours(z.kapazitaet) : null,
          ...z.zellen.map((c): Zelle => (c.auslastung === null ? null : c.auslastung > 1 ? { text: pctOrDash(c.auslastung), fett: true, ampel: 'rot' } : pctOrDash(c.auslastung))),
          z.engpaesse || null,
        ]),
      );
      b.hinweis(`Auslastung = geplante Stunden aller Projekte / Kapazität des Bereichs je Monat. Über 100 % = Engpass (fett mit rotem Punkt). ${engpaesse ? `Im Zeitraum: ${engpaesse} Engpass-Monat(e).` : 'Im Zeitraum kein Engpass.'}`);
    }
  }

  if (can('feedback.ansehen')) {
    const gesamt = nps(data.feedback);
    if (gesamt.anzahl > 0) {
      b.abschnitt('Kundenzufriedenheit (NPS)', 45);
      b.kacheln([
        { label: 'Net Promoter Score', wert: signedNps(gesamt.nps), sub: AMPEL_TEXT[npsAmpel(gesamt.nps)], ampel: npsAmpel(gesamt.nps) },
        { label: 'Bewertungen', wert: String(gesamt.anzahl), sub: `Mittelwert ${score1(gesamt.mittelwert)} von 10` },
        { label: 'Promotoren (9–10)', wert: String(gesamt.promotoren) },
        { label: 'Passive (7–8)', wert: String(gesamt.passive) },
        { label: 'Detraktoren (0–6)', wert: String(gesamt.detraktoren) },
      ]);
      b.tabelle(
        [L('Projekt'), L('Kunde'), R('NPS'), L('Bewertung'), R('Bewertungen'), R('Mittelwert'), R('Promotoren'), R('Passive'), R('Detraktoren')],
        rows.filter((z) => z.feedback.length).map((z) => {
          const n = nps(z.feedback);
          return [{ text: z.p.name, fett: true }, z.p.kunde, signedNps(n.nps), bewertung(npsAmpel(n.nps)), n.anzahl, score1(n.mittelwert), n.promotoren, n.passive, n.detraktoren];
        }),
      );
      b.hinweis('NPS = Anteil Promotoren minus Anteil Detraktoren, von -100 bis +100.');
    }
  }
  return b.fertig();
}

/* ---------- 6. Risikobericht ---------- */

function risikobericht(ctx: BerichtCtx): jsPDF {
  const { heute, data } = start(ctx);
  const alle = topRisiken(data.risiken, data.projects);
  const b = new Bericht(meta(ctx, 'Risikobericht', heute), true);
  if (!alle.length) {
    b.hinweis('In den sichtbaren Projekten gibt es derzeit keine offenen Risiken.');
    return b.fertig();
  }
  b.kacheln(risikoKacheln(alle));
  b.abschnitt('Offene Risiken');
  b.absatz('Sortiert nach Eskalation, dann nach Risikowert (höchster zuerst).', undefined, 8.5);
  risikoTabelle(b, alle, true);
  return b.fertig();
}

/* ---------- 7. Kundenbericht / Bauherrenbericht ---------- */

// Bewusst ohne Kennzahlen (SPI/CPI), Risiken, Mängel, Ressourcen und kritischen Pfad.
function kundenbericht(ctx: BerichtCtx): jsPDF {
  const { heute, today, can } = start(ctx);
  const z = projekt(ctx, heute);
  const { p, m, k } = z;
  const kosten = can('kosten.ansehen');
  const b = new Bericht(meta(ctx, 'Kundenbericht', heute, p));

  b.paare([['Auftraggeber', p.kunde], ['Projektleitung', p.leiter], ['Projektstatus', STATUS[p.status]], ['Geplante Laufzeit', `${date(p.start_soll)} – ${date(p.ende_soll)}`]]);
  b.absatz(p.beschreibung);

  b.abschnitt('Fortschritt', 45);
  b.kacheln([
    { label: 'Fortschritt', wert: pct(m.istPct), sub: `geplant zum Stichtag ${pct(m.sollPct)}` },
    ...wenn(k.msGesamt > 0, { label: 'Meilensteine erreicht', wert: `${k.msErreicht} von ${k.msGesamt}` }),
    { label: 'Terminlage', wert: AMPEL_TEXT[m.terminAmpel], sub: m.delayDays > 0 ? `${tageText(m.delayDays)} gegenüber Plan` : 'kein Verzug', ampel: m.terminAmpel },
    { label: 'Voraussichtliche Fertigstellung', wert: date(m.forecastEnd), sub: `geplant ${date(p.ende_soll)}` },
  ]);
  b.fortschritt(m.sollPct, m.istPct, pct(m.sollPct), pct(m.istPct));

  const ms = z.tasks.filter((t) => t.typ === 'meilenstein').sort((a, c) => toDay(a.ende_soll) - toDay(c.ende_soll));
  if (ms.length) {
    b.abschnitt('Meilensteine');
    b.tabelle(
      [L('Meilenstein'), L('Geplant', 28), L('Erreicht am', 28), L('Status', 30)],
      ms.map((t) => [t.name, date(t.ende_soll), t.ende_ist ? date(t.ende_ist) : null, istFertig(t) ? { text: 'Erreicht', ampel: 'gruen' } : taskStatus(t, today).status]),
    );
  }

  if (z.tasks.length) {
    b.abschnitt('Terminausblick', 50);
    b.absatz(
      m.delayDays > 0
        ? `Voraussichtliche Fertigstellung am ${date(m.forecastEnd)} – ${tageText(m.delayDays)} gegenüber dem geplanten Termin (${date(p.ende_soll)}).`
        : `Die Fertigstellung ist unverändert für den ${date(m.forecastEnd)} vorgesehen.`,
    );
    gantt(b, z.tasks.slice().sort(nachSollTermin), heute, false);
    const phasen = z.tasks.filter((t) => t.typ === 'phase').sort(nachSollTermin);
    b.tabelle(
      [L('Phase'), L('Geplanter Beginn', 30), L('Geplantes Ende', 30), R('Fortschritt', 24), L('Status', 30)],
      phasen.map((t) => [t.name, date(t.start_soll), date(t.ende_soll), `${Math.round(t.fortschritt)} %`, istFertig(t) ? { text: 'Abgeschlossen', ampel: 'gruen' } : taskStatus(t, today).status]),
    );
  }

  if (can('aenderungen.ansehen') && z.aenderungen.length) {
    b.abschnitt('Änderungen');
    b.tabelle(
      [L('Datum', 22), L('Änderung'), L('Status', 24), R('Terminauswirkung', 30), ...wenn(kosten, R('Kosten', 28))],
      z.aenderungen.slice().sort((a, c) => a.datum.localeCompare(c.datum)).map((c) => [
        date(c.datum), c.beschreibung ? `${c.titel}\n${c.beschreibung}` : c.titel, CR_STATUS[c.status], tageText(c.tage), ...wenn(kosten, c.kosten == null ? null : eur(c.kosten)),
      ]),
    );
    b.hinweis(`${k.crGenehmigt} genehmigte Änderung(en) mit einer Terminauswirkung von insgesamt ${tageText(k.crTage)}${kosten ? ` und Mehrkosten von ${eur(k.crKosten)}` : ''}; ${k.crOffen} noch offen.`);
  }
  return b.fertig();
}

// async-Hülle: Fehler beim Erzeugen kommen als abgelehntes Promise bei der Oberfläche an
const huelle = (f: (ctx: BerichtCtx) => jsPDF) => async (ctx: BerichtCtx) => f(ctx);

export const BERICHTE: Record<BerichtId, (ctx: BerichtCtx) => Promise<jsPDF>> = {
  projektstatus: huelle(projektstatus),
  termine: huelle(terminbericht),
  kosten: huelle(kostenbericht),
  portfolio: huelle(portfolio),
  management: huelle(management),
  risiken: huelle(risikobericht),
  kunde: huelle(kundenbericht),
};
