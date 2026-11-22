// Gezeichnete Vektordiagramme für die PDF-Berichte: Gantt (Soll/Ist) und kumulierter Kostenverlauf.
import { costCurve, toDay } from '../calc';
import { eurCompact, month, num } from '../format';
import type { Cost, Task } from '../types';
import { FARBE, RAND, type Bericht, type RGB } from './layout';

const DAY = 86400000;

type Form = 'balken' | 'raute' | 'linie' | 'strichlinie' | 'text';

function raute(b: Bericht, x: number, y: number, r: number, farbe: RGB) {
  b.doc.setFillColor(...farbe);
  b.doc.lines([[r, r], [-r, r], [-r, -r]], x, y - r, [1, 1], 'F', true);
}

function legende(b: Bericht, eintraege: { form: Form; farbe: RGB; text: string }[]) {
  b.platz(8);
  let x = RAND;
  const y = b.y + 2;
  for (const e of eintraege) {
    b.schrift(7.5, 'normal', FARBE.ink2);
    if (e.form === 'text') {
      b.t(e.text, x, y + 0.9);
      x += b.doc.getTextWidth(e.text) + 6;
      continue;
    }
    b.doc.setFillColor(...e.farbe);
    b.doc.setDrawColor(...e.farbe);
    if (e.form === 'balken') b.doc.roundedRect(x, y - 1, 4.5, 2, 1, 1, 'F');
    else if (e.form === 'raute') raute(b, x + 2.2, y, 1.5, e.farbe);
    else {
      b.doc.setLineWidth(0.5);
      if (e.form === 'strichlinie') b.doc.setLineDashPattern([1.1, 0.9], 0);
      b.doc.line(x, y, x + 4.5, y);
      b.doc.setLineDashPattern([], 0);
    }
    b.t(e.text, x + 6, y + 0.9);
    x += 6 + b.doc.getTextWidth(e.text) + 6;
  }
  b.y += 7;
}

/** Monatsanfänge im Bereich [von, bis] als Tagesnummern. */
function monatsanfaenge(von: number, bis: number): number[] {
  const out: number[] = [];
  const d0 = new Date(von * DAY);
  for (let m = d0.getUTCMonth(); ; m++) {
    const day = Math.round(Date.UTC(d0.getUTCFullYear(), m, 1) / DAY);
    if (day > bis) break;
    if (day >= von) out.push(day);
  }
  return out;
}

/** Gantt-Diagramm: je Aufgabe ein Soll- und ein Ist-Balken, Meilensteine als Rauten, Heute-Linie. */
export function gantt(b: Bericht, tasks: Task[], heute: string, mitKp: boolean) {
  if (!tasks.length) return;
  const today = toDay(heute);
  const alle = tasks.flatMap((t) => [t.start_soll, t.ende_soll, t.start_ist, t.ende_ist].filter((d): d is string => !!d).map(toDay));
  const lo = Math.min(...alle, today);
  const hi = Math.max(...alle, today);
  const pad = Math.max(3, Math.round((hi - lo) * 0.03));
  const min = lo - pad;
  const max = hi + pad;

  const LABEL = b.quer ? 70 : 56;
  const PCT = 14;
  const ZEILE = 7.4;
  const x0 = RAND + LABEL;
  const x1 = RAND + b.innen - PCT;
  const x = (day: number) => x0 + ((day - min) / (max - min)) * (x1 - x0);
  const monate = monatsanfaenge(min, max);
  const jeder = Math.ceil(monate.length / (b.quer ? 14 : 9));

  legende(b, [
    { form: 'balken', farbe: FARBE.soll, text: 'Soll' },
    { form: 'balken', farbe: FARBE.ist, text: 'Ist' },
    { form: 'raute', farbe: FARBE.ink2, text: 'Meilenstein' },
    { form: 'linie', farbe: FARBE.ink, text: 'Heute' },
    ...(mitKp && tasks.some((t) => t.kritisch) ? [{ form: 'text' as Form, farbe: FARBE.ink2, text: 'KP = kritischer Pfad' }] : []),
  ]);

  for (let start = 0; start < tasks.length; ) {
    // mindestens Kopf, drei Zeilen und die Heute-Beschriftung zusammenhalten
    b.platz(5 + Math.min(3, tasks.length - start) * ZEILE + 6);
    const n = Math.max(1, Math.min(tasks.length - start, Math.floor((b.unten - b.y - 11) / ZEILE)));
    const top = b.y + 5;
    const bottom = top + n * ZEILE;

    b.schrift(7, 'normal', FARBE.muted);
    monate.forEach((m, i) => {
      b.doc.setDrawColor(...FARBE.line);
      b.doc.setLineWidth(0.15);
      b.doc.line(x(m), top, x(m), bottom);
      if (i % jeder === 0 && x(m) < x1 - 9) b.t(month(m), x(m) + 0.8, top - 1.6);
    });
    b.doc.setDrawColor(...FARBE.axis);
    b.doc.setLineWidth(0.2);
    b.doc.line(RAND, top, RAND + b.innen, top);

    tasks.slice(start, start + n).forEach((t, i) => {
      const y = top + i * ZEILE;
      const ms = t.typ === 'meilenstein';
      b.doc.setDrawColor(...FARBE.line);
      b.doc.setLineWidth(0.15);
      b.doc.line(RAND, y + ZEILE, RAND + b.innen, y + ZEILE);

      const kp = mitKp && t.kritisch ? 8 : 0;
      b.schrift(8, ms ? 'normal' : 'bold');
      b.t(b.kurz(t.name, LABEL - 3 - kp), RAND, y + 4.7);
      if (kp) {
        b.doc.setFillColor(...FARBE.kopf);
        b.doc.roundedRect(x0 - 8.5, y + 1.9, 6, 3.6, 1, 1, 'F');
        b.schrift(6.5, 'bold', FARBE.ink2);
        b.t('KP', x0 - 5.5, y + 4.5, 'center');
      }

      const s = toDay(t.start_soll);
      const e = toDay(t.ende_soll);
      const is = t.start_ist ? toDay(t.start_ist) : null;
      // begonnen, aber nicht beendet = läuft noch: Balken bis heute
      const ie = t.ende_ist ? toDay(t.ende_ist) : is !== null ? Math.max(today, is) : null;
      if (ms) {
        raute(b, x(e), y + 2.4, 1.45, FARBE.soll);
        if (t.ende_ist) raute(b, x(toDay(t.ende_ist)), y + 5.2, 1.45, FARBE.ist);
      } else {
        b.doc.setFillColor(...FARBE.soll);
        b.doc.roundedRect(x(s), y + 1.5, Math.max(1, x(e) - x(s)), 1.9, 0.9, 0.9, 'F');
        if (is !== null && ie !== null) {
          b.doc.setFillColor(...FARBE.ist);
          b.doc.roundedRect(x(is), y + 4.1, Math.max(1, x(ie) - x(is)), 1.9, 0.9, 0.9, 'F');
        }
      }
      b.schrift(7.5, 'normal', FARBE.ink2);
      const fertig = t.ende_ist || t.fortschritt >= 100;
      b.t(ms ? (fertig ? 'erreicht' : 'offen') : `${Math.round(t.fortschritt)} %`, RAND + b.innen, y + 4.7, 'right');
    });

    b.doc.setDrawColor(...FARBE.ink);
    b.doc.setLineWidth(0.4);
    b.doc.line(x(today), top - 1, x(today), bottom + 1);
    b.schrift(7, 'bold');
    b.t('Heute', x(today), bottom + 4, 'center');

    b.y = bottom + 9;
    start += n;
  }
}

function niceStep(max: number, ticks: number) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Kumulierte Soll-/Ist-Kosten als Liniendiagramm mit Budgetlinie; `false`, wenn es nichts zu zeichnen gibt. */
export function kostenverlauf(b: Bericht, costs: Cost[], budget: number | undefined, heute: string): boolean {
  const pts = costCurve(costs, heute);
  const maxWert = Math.max(budget ?? 0, ...pts.map((p) => Math.max(p.soll, p.ist ?? 0)));
  if (pts.length < 2 || !(maxWert > 0)) return false;

  legende(b, [
    { form: 'linie', farbe: FARBE.soll, text: 'Soll (kumuliert)' },
    { form: 'linie', farbe: FARBE.ist, text: 'Ist (kumuliert)' },
    ...(budget ? [{ form: 'strichlinie' as Form, farbe: FARBE.ink, text: 'Budget' }] : []),
    { form: 'linie', farbe: FARBE.muted, text: 'Heute' },
  ]);

  const H = 62;
  b.platz(H + 12);
  const today = toDay(heute);
  const links = RAND + 20;
  const rechts = RAND + b.innen - 4;
  const top = b.y + 4;
  const bottom = top + H;
  const d0 = pts[0].day;
  const d1 = pts[pts.length - 1].day;
  const step = niceStep(maxWert * 1.05, 4);
  const yMax = Math.ceil((maxWert * 1.05) / step) * step;
  const x = (day: number) => links + ((day - d0) / (d1 - d0)) * (rechts - links);
  const y = (v: number) => bottom - (v / yMax) * H;

  for (let v = 0; v <= yMax + step / 2; v += step) {
    b.doc.setDrawColor(...(v === 0 ? FARBE.axis : FARBE.line));
    b.doc.setLineWidth(v === 0 ? 0.25 : 0.15);
    b.doc.line(links, y(v), rechts, y(v));
    b.schrift(7, 'normal', FARBE.muted);
    b.t(num(v), links - 2, y(v) + 0.9, 'right');
  }
  const monate = monatsanfaenge(d0, d1);
  const jeder = Math.ceil(monate.length / (b.quer ? 14 : 9));
  monate.forEach((m, i) => {
    if (i % jeder === 0 && x(m) < rechts - 8) b.t(month(m), x(m), bottom + 4);
  });

  if (today >= d0 && today <= d1) {
    b.doc.setDrawColor(...FARBE.muted);
    b.doc.setLineWidth(0.25);
    b.doc.line(x(today), top, x(today), bottom);
    b.schrift(7, 'bold', FARBE.ink2);
    b.t('Heute', x(today), top - 1.2, 'center');
  }
  if (budget) {
    b.doc.setDrawColor(...FARBE.ink);
    b.doc.setLineWidth(0.3);
    b.doc.setLineDashPattern([1.4, 1.1], 0);
    b.doc.line(links, y(budget), rechts, y(budget));
    b.doc.setLineDashPattern([], 0);
    b.schrift(7, 'bold', FARBE.ink2);
    b.t(`Budget ${eurCompact(budget)}`, links + 1.5, y(budget) - 1.4);
  }

  const linie = (key: 'soll' | 'ist', farbe: RGB) => {
    const p = pts.filter((q) => q[key] !== null);
    b.doc.setDrawColor(...farbe);
    b.doc.setLineWidth(0.6);
    for (let i = 1; i < p.length; i++) b.doc.line(x(p[i - 1].day), y(p[i - 1][key]!), x(p[i].day), y(p[i][key]!));
    const last = p[p.length - 1];
    if (last) {
      b.doc.setFillColor(...farbe);
      b.doc.circle(x(last.day), y(last[key]!), 0.9, 'F');
    }
  };
  linie('soll', FARBE.soll);
  linie('ist', FARBE.ist);

  b.y = bottom + 10;
  return true;
}
