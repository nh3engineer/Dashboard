// Beispieldaten relativ zum heutigen Datum, damit das Dashboard sofort "lebt".
import { db, insert } from './db.js';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const PHASES = [
  ['Planung & Auslegung', 0, 0.2],
  ['Beschaffung', 0.15, 0.45],
  ['Montage', 0.4, 0.8],
  ['Inbetriebnahme', 0.8, 0.95],
  ['Dokumentation', 0.9, 1],
];
const CATEGORIES = [
  ['Personal', 0.35],
  ['Material', 0.4],
  ['Fremdleistung', 0.2],
  ['Sonstiges', 0.05],
];

// slip: Terminverzug als Anteil der Phasendauer, costFactor: Ist/Soll-Kostenverhältnis
const PROJECTS = [
  { name: 'Kälteanlage Logistikzentrum Nord', kunde: 'Nordfracht GmbH', leiter: 'M. Berger', status: 'laufend', start: -120, end: 90, budget: 480000, slip: 0.15, costFactor: 1.12, beschreibung: 'NH3/CO2-Kaskade für Tiefkühl- und Frischebereich, 1,2 MW Kälteleistung.' },
  { name: 'Wärmepumpe Bürokomplex West', kunde: 'Immo West AG', leiter: 'S. Huber', status: 'laufend', start: -60, end: 150, budget: 260000, slip: 0, costFactor: 0.96, beschreibung: 'Sole/Wasser-Wärmepumpe mit Erdsondenfeld, Heizen und Kühlen.' },
  { name: 'Retrofit Kühlhaus Süd', kunde: 'Frischedienst Süd', leiter: 'M. Berger', status: 'laufend', start: -200, end: 20, budget: 180000, slip: 0.4, costFactor: 1.28, beschreibung: 'Umrüstung von R404A auf natürliches Kältemittel im laufenden Betrieb.' },
  { name: 'Prozesskühlung Werk 2', kunde: 'Alpin Kunststoff', leiter: 'K. Wagner', status: 'geplant', start: 30, end: 240, budget: 350000, slip: 0, costFactor: 1, beschreibung: 'Kaltwassererzeugung für Spritzgussmaschinen inkl. Freikühlung.' },
  { name: 'Kaltwassersatz Rechenzentrum', kunde: 'DataPark', leiter: 'S. Huber', status: 'abgeschlossen', start: -330, end: -40, budget: 300000, slip: 0.03, costFactor: 0.98, beschreibung: 'Redundante Kaltwassersätze (N+1) mit Wärmerückgewinnung.' },
];

export function seed() {
  const today = Date.parse(iso(Date.now()));
  db.exec('BEGIN');
  for (const [pi, p] of PROJECTS.entries()) {
    const start = today + p.start * DAY;
    const end = today + p.end * DAY;
    const span = end - start;
    const project = insert('projects', {
      ...p,
      start_soll: iso(start),
      ende_soll: iso(end),
    });

    let delay = 0;
    for (const [name, from, to] of PHASES) {
      const s = start + from * span;
      const e = start + to * span;
      const dur = e - s;
      const startIst = s + delay;
      delay += dur * p.slip;
      const endIst = e + delay;
      const started = startIst <= today;
      const done = endIst <= today;
      insert('tasks', {
        project_id: project.id,
        name,
        typ: 'phase',
        start_soll: iso(s),
        ende_soll: iso(e),
        start_ist: started ? iso(startIst) : null,
        ende_ist: done ? iso(endIst) : null,
        fortschritt: done ? 100 : started ? Math.round(((today - startIst) / (endIst - startIst)) * 100) : 0,
      });
    }
    const acceptance = end + delay;
    insert('tasks', {
      project_id: project.id,
      name: 'Abnahme',
      typ: 'meilenstein',
      start_soll: iso(end),
      ende_soll: iso(end),
      start_ist: null,
      ende_ist: acceptance <= today ? iso(acceptance) : null,
      fortschritt: acceptance <= today ? 100 : 0,
    });

    // Kosten: monatliche Soll-Tranchen, Ist-Buchungen bis heute
    const months = Math.max(1, Math.round(span / (30 * DAY)));
    for (let m = 0; m < months; m++) {
      const datum = start + (m + 0.5) * (span / months);
      // Glockenförmige Verteilung: Hauptlast in der Projektmitte
      const weight = Math.sin(((m + 0.5) / months) * Math.PI);
      const total = Array.from({ length: months }, (_, i) => Math.sin(((i + 0.5) / months) * Math.PI)).reduce((a, b) => a + b, 0);
      for (const [ci, [kategorie, share]] of CATEGORIES.entries()) {
        const soll = Math.round((p.budget * share * weight) / total / 100) * 100;
        insert('costs', { project_id: project.id, datum: iso(datum), kategorie, bezeichnung: `Plan ${kategorie}`, art: 'soll', betrag: soll });
        const istDatum = datum + delay * 0.3;
        if (istDatum <= today) {
          const wobble = 1 + (((pi * 7 + m * 3 + ci * 5) % 9) - 4) / 50;
          insert('costs', { project_id: project.id, datum: iso(istDatum), kategorie, bezeichnung: `Buchung ${kategorie}`, art: 'ist', betrag: Math.round((soll * p.costFactor * wobble) / 10) * 10 });
        }
      }
    }
  }
  db.exec('COMMIT');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--force')) db.exec('DELETE FROM costs; DELETE FROM tasks; DELETE FROM projects;');
  seed();
  console.log('Beispieldaten angelegt.');
}
