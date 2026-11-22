// Beispieldaten relativ zum heutigen Datum, damit das Dashboard sofort "lebt".
// Deterministisch (kein Zufall); legt keine Benutzer an – die Ersteinrichtung erfolgt in der Oberfläche.
import { all, clearData, insert, tx } from './db.js';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// [Name, Beginn, Ende (Anteil der Projektlaufzeit), auf dem kritischen Pfad]
const PHASES = [
  ['Planung & Auslegung', 0, 0.2, 1],
  ['Beschaffung', 0.15, 0.45, 0],
  ['Montage', 0.4, 0.8, 1],
  ['Inbetriebnahme', 0.8, 0.95, 1],
  ['Dokumentation', 0.9, 1, 0],
];
// Meilensteine nach Abschluss der Phase mit dem genannten Index
const MILESTONES = [
  ['Planfreigabe', 0.2, 0, 0],
  ['Montageende', 0.8, 2, 1],
  ['Abnahme', 1, 4, 1],
];
const CATEGORIES = [
  ['Personal', 0.35],
  ['Material', 0.4],
  ['Fremdleistung', 0.2],
  ['Sonstiges', 0.05],
];
// Kapazität in Stunden je Monat; Einsatzfenster und Stundenanteil je Projekt
export const BEREICHE = [
  { name: 'Projektleitung', kapazitaet: 160, von: 0, bis: 1, anteil: 0.1 },
  { name: 'Planung', kapazitaet: 320, von: 0, bis: 0.3, anteil: 0.2 },
  { name: 'Montage', kapazitaet: 400, von: 0.4, bis: 0.8, anteil: 0.4 },
  { name: 'Elektro/MSR', kapazitaet: 320, von: 0.5, bis: 0.9, anteil: 0.18 },
  { name: 'Inbetriebnahme', kapazitaet: 240, von: 0.8, bis: 1, anteil: 0.12 },
];
const STUNDENSATZ = 60; // Personalbudget / Stundensatz = geplante Stunden

// slip: Terminverzug als Anteil der Phasendauer, costFactor: Ist/Soll-Kostenverhältnis, erloes: Auftragswert / Budget.
// Tagesangaben relativ zu heute. aenderungen: [Tag, Titel, Status, Kosten, Tage] · maengel: [Tag, Titel, Schwere, Status, Nacharbeit h]
// risiken: [Titel, W, A, Maßnahme, Status, Eskalation] · feedback: [Tag, Score, Kommentar, von]
const PROJECTS = [
  {
    name: 'Kälteanlage Logistikzentrum Nord', kunde: 'Nordfracht GmbH', leiter: 'M. Berger', status: 'laufend', start: -120, end: 90, budget: 480000, erloes: 1.12, slip: 0.15, costFactor: 1.12,
    beschreibung: 'NH3/CO2-Kaskade für Tiefkühl- und Frischebereich, 1,2 MW Kälteleistung.',
    aenderungen: [
      [-75, 'Zusätzlicher Verdampfer Tiefkühlzelle 3', 'genehmigt', 18500, 7],
      [-55, 'Umstellung auf Edelstahlverrohrung', 'abgelehnt', 22000, 10],
      [-40, 'Geänderte Rohrtrasse wegen Statik', 'genehmigt', 6200, 4],
      [-12, 'Erweiterung Leckageüberwachung NH3', 'offen', 9400, 3],
    ],
    maengel: [
      [-35, 'Schweißnaht Saugleitung undicht', 'mittel', 'behoben', 12],
      [-10, 'Dämmung Kältemittelleitung beschädigt', 'gering', 'offen', 4],
      [-5, 'Schwingungsdämpfer Verdichter 2 fehlt', 'mittel', 'offen', 6],
    ],
    risiken: [
      ['Lieferverzug CO2-Verdichter', 4, 4, 'Alternativlieferant anfragen, Teillieferung vereinbaren', 'offen', 1],
      ['Fachkräftemangel Kälteanlagenbauer', 3, 4, 'Subunternehmer frühzeitig binden', 'offen', 0],
      ['Witterung verzögert Dachmontage Rückkühler', 3, 3, 'Kran flexibel disponieren', 'offen', 0],
    ],
    feedback: [
      [-60, 8, 'Gute Abstimmung, der Terminverzug wurde früh kommuniziert.', 'R. Petersen, Nordfracht'],
      [-14, 9, 'Baustelle sauber und gut organisiert.', 'R. Petersen, Nordfracht'],
    ],
  },
  {
    name: 'Wärmepumpe Bürokomplex West', kunde: 'Immo West AG', leiter: 'S. Huber', status: 'laufend', start: -60, end: 150, budget: 260000, erloes: 1.15, slip: 0, costFactor: 0.96,
    beschreibung: 'Sole/Wasser-Wärmepumpe mit Erdsondenfeld, Heizen und Kühlen.',
    aenderungen: [
      [-30, 'Zwei zusätzliche Erdsonden', 'genehmigt', 14800, 6],
      [-8, 'Einbindung Gebäudeleittechnik (BACnet)', 'offen', 5600, 2],
    ],
    maengel: [[-15, 'Sondenverteiler falsch beschriftet', 'gering', 'behoben', 2]],
    risiken: [
      ['Bohrgenehmigung Erdsonden verzögert', 2, 4, 'Behörde wöchentlich nachfassen', 'offen', 0],
      ['Geringere Entzugsleistung als geplant', 2, 3, 'Thermal Response Test ausgewertet', 'geschlossen', 0],
    ],
    feedback: [
      [-28, 10, 'Sehr kompetente Beratung in der Planungsphase.', 'A. Steiner, Immo West'],
      [-7, 9, 'Termine werden eingehalten.', 'A. Steiner, Immo West'],
    ],
  },
  {
    name: 'Retrofit Kühlhaus Süd', kunde: 'Frischedienst Süd', leiter: 'M. Berger', status: 'laufend', start: -200, end: 20, budget: 180000, erloes: 1.03, slip: 0.4, costFactor: 1.28,
    beschreibung: 'Umrüstung von R404A auf natürliches Kältemittel im laufenden Betrieb.',
    aenderungen: [
      [-150, 'Provisorische Kühlung während des Umbaus', 'genehmigt', 12400, 0],
      [-90, 'Austausch korrodierter Sammelleitung', 'genehmigt', 8900, 9],
      [-20, 'Zusätzliche Gaswarnanlage Maschinenraum', 'offen', 7300, 5],
    ],
    maengel: [
      [-110, 'Ölrückführung im Verbund unzureichend', 'mittel', 'behoben', 16],
      [-70, 'Schaltschrank ohne aktuellen Stromlaufplan', 'gering', 'behoben', 5],
      [-45, 'Abblaseleitung Sicherheitsventil nicht normgerecht', 'kritisch', 'offen', 24],
      [-25, 'Kondensatablauf Verdampfer ohne Gefälle', 'gering', 'offen', 3],
    ],
    risiken: [
      ['Betriebsunterbrechung beim Kunden während des Umschlusses', 4, 5, 'Umschluss am Wochenende, Notkühlung bereitstellen', 'offen', 1],
      ['Weitere Schäden an der Altanlage', 4, 3, 'Bestandsaufnahme vor jedem Bauabschnitt', 'offen', 0],
      ['Preissteigerung Kältemittel', 2, 2, 'Menge vorab bestellt', 'geschlossen', 0],
    ],
    feedback: [
      [-80, 6, 'Zu viele Nachträge.', 'H. Maier, Frischedienst Süd'],
      [-22, 4, 'Stillstand im Betrieb länger als angekündigt.', 'H. Maier, Frischedienst Süd'],
    ],
  },
  {
    name: 'Prozesskühlung Werk 2', kunde: 'Alpin Kunststoff', leiter: 'K. Wagner', status: 'geplant', start: 30, end: 240, budget: 350000, erloes: 1.18, slip: 0, costFactor: 1,
    beschreibung: 'Kaltwassererzeugung für Spritzgussmaschinen inkl. Freikühlung.',
    aenderungen: [],
    maengel: [],
    risiken: [
      ['Schnittstelle zur Spritzguss-Steuerung ungeklärt', 3, 4, 'Workshop mit dem Maschinenlieferanten', 'offen', 0],
      ['Kupferpreis bis zur Bestellung', 3, 3, 'Preisgleitklausel verhandeln', 'offen', 0],
    ],
    feedback: [],
  },
  {
    name: 'Kaltwassersatz Rechenzentrum', kunde: 'DataPark', leiter: 'S. Huber', status: 'abgeschlossen', start: -330, end: -40, budget: 300000, erloes: 1.1, slip: 0.03, costFactor: 0.98,
    beschreibung: 'Redundante Kaltwassersätze (N+1) mit Wärmerückgewinnung.',
    aenderungen: [
      [-250, 'Wärmerückgewinnung für den Bürotrakt', 'genehmigt', 11200, 5],
      [-180, 'Dritter Pufferspeicher', 'abgelehnt', 9800, 4],
    ],
    maengel: [
      [-120, 'Durchflusssensor falsch kalibriert', 'mittel', 'behoben', 8],
      [-60, 'Dokumentation der Druckprüfung unvollständig', 'gering', 'behoben', 3],
      [-48, 'Regelparameter Freikühlung nachjustiert', 'gering', 'behoben', 6],
    ],
    risiken: [['Gewährleistungsfall Verdichter', 1, 4, 'Wartungsvertrag abgeschlossen', 'offen', 0]],
    feedback: [
      [-200, 9, 'Professionelle Projektleitung.', 'T. Lindner, DataPark'],
      [-100, 8, 'Inbetriebnahme ohne Ausfall des Rechenzentrums.', 'T. Lindner, DataPark'],
      [-35, 10, 'Übergabe termingerecht, Dokumentation vollständig.', 'T. Lindner, DataPark'],
    ],
  },
];

/** Stunden je Bereich und Monat: gleichmäßig über das Einsatzfenster des Bereichs verteilt. */
export function aufwandRows(p, pi, today) {
  const start = today + p.start * DAY;
  const span = (p.end - p.start) * DAY;
  const total = (p.budget * 0.35) / STUNDENSATZ;
  const current = iso(today).slice(0, 7);
  const rows = [];
  const d = new Date(start);
  for (let y = d.getUTCFullYear(), m = d.getUTCMonth(), i = 0; Date.UTC(y, m, 1) < start + span; m++, i++) {
    const from = (Date.UTC(y, m, 1) - start) / span;
    const to = (Date.UTC(y, m + 1, 1) - start) / span;
    const monat = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    for (const [bi, b] of BEREICHE.entries()) {
      const overlap = Math.max(0, Math.min(to, b.bis) - Math.max(from, b.von)) / (b.bis - b.von);
      const soll = Math.round((total * b.anteil * overlap) / 5) * 5;
      if (!soll) continue;
      // Gebucht ist nur bis heute; der laufende Monat anteilig
      const done = monat < current ? 1 : monat > current ? 0 : new Date(today).getUTCDate() / new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const wobble = 1 + (((pi * 5 + i * 3 + bi * 7) % 9) - 4) / 40;
      const effort = 1 + (p.costFactor - 1) * 0.8;
      rows.push({ bereich: b.name, monat, stunden_soll: soll, stunden_ist: Math.round(soll * done * effort * wobble) });
    }
  }
  return rows;
}

export function seed(now = Date.now()) {
  const today = Date.parse(iso(now));
  tx(() => {
    const vorhanden = new Set(all('bereiche').map((b) => b.name));
    for (const b of BEREICHE) if (!vorhanden.has(b.name)) insert('bereiche', b);
    for (const [pi, p] of PROJECTS.entries()) {
      const start = today + p.start * DAY;
      const end = today + p.end * DAY;
      const span = end - start;
      const project = insert('projects', {
        ...p,
        start_soll: iso(start),
        ende_soll: iso(end),
        auftragswert: Math.round((p.budget * p.erloes) / 1000) * 1000,
      });
      const add = (table, row) => insert(table, { project_id: project.id, ...row });

      let delay = 0;
      const delayAfter = [];
      const plan = []; // [Beginn, Ende] je Phase laut Plan bzw. tatsächlich – Grundlage der Kostenverteilung
      const real = [];
      for (const [name, from, to, kritisch] of PHASES) {
        const s = start + from * span;
        const e = start + to * span;
        const dur = e - s;
        const startIst = s + delay;
        delay += dur * p.slip;
        delayAfter.push(delay);
        const endIst = e + delay;
        plan.push([s, e]);
        real.push([startIst, endIst]);
        const started = startIst <= today;
        const done = endIst <= today;
        add('tasks', {
          name,
          typ: 'phase',
          start_soll: iso(s),
          ende_soll: iso(e),
          start_ist: started ? iso(startIst) : null,
          ende_ist: done ? iso(endIst) : null,
          fortschritt: done ? 100 : started ? Math.round(((today - startIst) / (endIst - startIst)) * 100) : 0,
          kritisch,
        });
      }
      for (const [name, at, afterPhase, kritisch] of MILESTONES) {
        const soll = start + at * span;
        const reached = soll + delayAfter[afterPhase];
        add('tasks', {
          name,
          typ: 'meilenstein',
          start_soll: iso(soll),
          ende_soll: iso(soll),
          start_ist: null,
          ende_ist: reached <= today ? iso(reached) : null,
          fortschritt: reached <= today ? 100 : 0,
          kritisch,
        });
      }

      // Kosten folgen der Leistung: je 30-Tage-Abschnitt der Anteil des Budgets, der dem (nach Dauer gewichteten)
      // Fortschritt der Phasen entspricht – Soll nach Plan-, Ist nach tatsächlichen Terminen. So passen CPI und
      // Prognose zum Kostenplan (ein Projekt im Plan hat CPI ≈ 1 / costFactor). Der Stichtag ist eine Abschnittsgrenze.
      const weight = plan.reduce((a, [s, e]) => a + (e - s), 0);
      const progress = (phases, t) => phases.reduce((a, [s, e], i) => a + (plan[i][1] - plan[i][0]) * Math.min(1, Math.max(0, (t - s) / (e - s))), 0) / weight;
      const STEP = 30 * DAY;
      const bookings = (phases, until, book) => {
        const first = phases[0][0];
        let from = first;
        for (let k = Math.floor((first - today) / STEP) + 1, m = 0; from < until; k++, m++) {
          const to = Math.min(until, today + k * STEP);
          const share = progress(phases, to) - progress(phases, from);
          for (const [ci, [kategorie, anteil]] of CATEGORIES.entries()) book(to, kategorie, p.budget * anteil * share, m, ci);
          from = to;
        }
      };
      bookings(plan, end, (datum, kategorie, betrag) => {
        const soll = Math.round(betrag / 100) * 100;
        if (soll) add('costs', { datum: iso(datum), kategorie, bezeichnung: `Plan ${kategorie}`, art: 'soll', betrag: soll });
      });
      bookings(real, Math.min(today, end + delay), (datum, kategorie, betrag, m, ci) => {
        const wobble = 1 + (((pi * 7 + m * 3 + ci * 5) % 9) - 4) / 50;
        const ist = Math.round((betrag * p.costFactor * wobble) / 10) * 10;
        if (ist) add('costs', { datum: iso(datum), kategorie, bezeichnung: `Buchung ${kategorie}`, art: 'ist', betrag: ist });
      });

      for (const row of aufwandRows(p, pi, today)) add('aufwand', row);
      const at = (day) => iso(today + day * DAY);
      for (const [day, titel, status, kosten, tage] of p.aenderungen) add('aenderungen', { datum: at(day), titel, beschreibung: '', status, kosten, tage });
      for (const [day, titel, schwere, status, nacharbeit_stunden] of p.maengel) add('maengel', { datum: at(day), titel, schwere, status, nacharbeit_stunden });
      for (const [titel, wahrscheinlichkeit, auswirkung, massnahme, status, eskalation] of p.risiken) add('risiken', { titel, wahrscheinlichkeit, auswirkung, massnahme, status, eskalation });
      for (const [day, score, kommentar, von] of p.feedback) add('feedback', { datum: at(day), score, kommentar, von });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // --force ersetzt die Fachdaten; Benutzer und Rollen bleiben, Projektzuweisungen entfallen
  if (process.argv.includes('--force')) clearData();
  seed();
  console.log('Beispieldaten angelegt.');
}
