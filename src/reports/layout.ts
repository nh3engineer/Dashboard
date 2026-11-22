// Gemeinsames Layout aller PDF-Berichte: Seitenrahmen, Kopf/Fuß, Kacheln, Tabellen, Ampeln.
// Wird nur über den dynamischen Import in index.ts geladen (jspdf bleibt aus dem Hauptbundle).
import { jsPDF } from 'jspdf';
import autoTable, { type CellDef, type CellHookData } from 'jspdf-autotable';
import { date } from '../format';
import type { Ampel } from '../types';

export type RGB = [number, number, number];

export const FARBE = {
  ink: [15, 23, 32],
  ink2: [74, 85, 96],
  muted: [125, 135, 145],
  line: [228, 232, 235],
  axis: [197, 204, 210],
  surface2: [244, 247, 248],
  kopf: [237, 241, 243],
  zebra: [249, 251, 251],
  accent: [13, 148, 136],
  soll: [42, 120, 214],
  ist: [235, 104, 52],
} satisfies Record<string, RGB>;

const AMPEL_FARBE: Record<Ampel, RGB> = { gruen: [12, 163, 12], gelb: [250, 178, 25], rot: [208, 59, 59], neutral: [160, 168, 176] };
export const AMPEL_TEXT: Record<Ampel, string> = { gruen: 'Im Plan', gelb: 'Achtung', rot: 'Kritisch', neutral: 'Offen' };

export const RAND = 15;
const OBEN_ERSTE = 44;
const OBEN_FOLGE = 21;
const FUSS = 17;

// Zeichen außerhalb von WinAnsi (druckbares ASCII, Latin-1 und die Windows-1252-Zusätze wie € „ “ – …)
const AUSSERHALB = /[^\n\x20-\x7e\u00a1-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/g;

const OHNE_ZERLEGUNG: Record<string, string> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', ı: 'i' };

/**
 * Die Standardschrift Helvetica kennt nur WinAnsi (Windows-1252). Intl liefert aber z. B. das
 * Minuszeichen U+2212 und schmale/geschützte Leerzeichen – die würden im PDF als Zeichensalat erscheinen.
 */
export function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2212\u2010\u2011\u2012]/g, '-')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000\t]/g, ' ')
    .replace(/[\u200b-\u200d\ufeff\u00ad]/g, '')
    .replace(/\r\n?/g, '\n')
    // Buchstaben mit fremden Akzenten (ć, ő, ž …) auf den Grundbuchstaben zurückführen, der Rest wird „?“
    .replace(AUSSERHALB, (ch) => OHNE_ZERLEGUNG[ch] ?? (ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(AUSSERHALB, '?') || '?'));
}

export interface BerichtMeta {
  titel: string;
  /** z. B. Projektname */
  untertitel?: string;
  /** rechts im Kopf, z. B. „Kunde: …“ */
  infos?: string[];
  /** Stichtag (ISO) */
  stand: string;
  benutzer: string;
  /** Vermerk in der Fußzeile, z. B. „Vertraulich“ */
  vermerk?: string;
}

export interface Kachel {
  label: string;
  wert: string;
  sub?: string;
  /** farbiger Punkt vor `sub` – der Text daneben trägt die Aussage */
  ampel?: Ampel;
}

/** `null`/`undefined` wird als „–“ ausgegeben. */
export type Zelle = string | number | null | undefined | { text: string | null | undefined; ampel?: Ampel; fett?: boolean };

export interface Spalte {
  titel: string;
  rechts?: boolean;
  /** feste Breite in mm, sonst automatisch */
  breite?: number;
  /** nie umbrechen: Spalte so breit wie ihr Inhalt (bei Zahlenspalten ohnehin) */
  eng?: boolean;
}

export interface TabellenOptionen {
  /** fett gesetzte Abschlusszeile */
  summe?: Zelle[];
  schrift?: number;
  /** schmalere Zellenränder für Tabellen mit vielen Spalten */
  dicht?: boolean;
}

const zellText = (z: Zelle) => {
  const t = typeof z === 'object' && z !== null ? z.text : z;
  return t === null || t === undefined || t === '' ? '–' : String(t);
};

export class Bericht {
  readonly doc: jsPDF;
  readonly quer: boolean;
  /** aktuelle Schreibposition (mm von oben) */
  y = OBEN_ERSTE;

  constructor(readonly meta: BerichtMeta, quer = false) {
    this.quer = quer;
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: quer ? 'landscape' : 'portrait', compress: true });
    this.doc.setProperties({ title: pdfText([meta.titel, meta.untertitel].filter(Boolean).join(' – ')), author: pdfText(meta.benutzer), creator: 'Projekt-Dashboard' });
    this.doc.setLineCap('round');
    this.doc.setLineJoin('round');
  }

  get breite() { return this.doc.internal.pageSize.getWidth(); }
  get hoehe() { return this.doc.internal.pageSize.getHeight(); }
  /** nutzbare Breite zwischen den Rändern */
  get innen() { return this.breite - 2 * RAND; }
  /** unterste Schreibposition über der Fußzeile */
  get unten() { return this.hoehe - FUSS; }

  neueSeite() {
    this.doc.addPage();
    this.y = OBEN_FOLGE;
  }

  /** Bricht um, wenn `h` mm nicht mehr auf die Seite passen. */
  platz(h: number) {
    if (this.y + h > this.unten) this.neueSeite();
  }

  schrift(size: number, stil: 'normal' | 'bold' = 'normal', farbe: RGB = FARBE.ink) {
    this.doc.setFont('helvetica', stil);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...farbe);
  }

  /** Einzige Stelle, an der Text ins PDF geschrieben wird (außer Tabellen) – immer über pdfText(). */
  t(text: unknown, x: number, y: number, align: 'left' | 'right' | 'center' = 'left') {
    this.doc.text(pdfText(text), x, y, { align });
  }

  zeilen(text: unknown, breite: number): string[] {
    return this.doc.splitTextToSize(pdfText(text), breite) as string[];
  }

  /** Kürzt auf eine Zeile (mit „…“). Schrift muss vorher gesetzt sein. */
  kurz(text: unknown, breite: number): string {
    let s = pdfText(text).replace(/\n/g, ' ');
    if (this.doc.getTextWidth(s) <= breite) return s;
    while (s.length > 1 && this.doc.getTextWidth(s + '…') > breite) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }

  punkt(x: number, y: number, ampel: Ampel, r = 1.15) {
    this.doc.setFillColor(...AMPEL_FARBE[ampel]);
    this.doc.circle(x, y, r, 'F');
  }

  abschnitt(titel: string, mindestPlatz = 30) {
    this.platz(mindestPlatz);
    this.y += 3;
    this.doc.setFillColor(...FARBE.accent);
    this.doc.roundedRect(RAND, this.y - 3.6, 1.2, 4.6, 0.6, 0.6, 'F');
    this.schrift(11.5, 'bold');
    this.t(titel, RAND + 3.2, this.y);
    this.y += 6;
  }

  absatz(text: unknown, farbe: RGB = FARBE.ink2, size = 9) {
    if (!pdfText(text).trim()) return;
    const h = size * 0.46;
    this.schrift(size, 'normal', farbe);
    for (const zeile of this.zeilen(text, this.innen)) {
      this.platz(h);
      this.schrift(size, 'normal', farbe);
      this.doc.text(zeile, RAND, this.y + h * 0.72);
      this.y += h;
    }
    this.y += 3.5;
  }

  hinweis(text: string) {
    this.absatz(text, FARBE.muted, 8.5);
  }

  /** Kennzahlen als Kachelreihe; Einträge ohne Wert vorher weglassen. */
  kacheln(items: Kachel[]) {
    if (!items.length) return;
    const max = this.quer ? 6 : 4;
    const spalten = items.length <= max ? items.length : Math.ceil(items.length / Math.ceil(items.length / max));
    const gap = 3;
    const w = (this.innen - gap * (Math.max(spalten, 2) - 1)) / Math.max(spalten, 2);
    const h = 19.5;
    for (let i = 0; i < items.length; i += spalten) {
      this.platz(h + 2);
      items.slice(i, i + spalten).forEach((k, j) => {
        const x = RAND + j * (w + gap);
        this.doc.setFillColor(...FARBE.surface2);
        this.doc.roundedRect(x, this.y, w, h, 2, 2, 'F');
        this.schrift(7.5, 'normal', FARBE.ink2);
        this.t(this.kurz(k.label, w - 6), x + 3, this.y + 5.3);
        let size = 13;
        this.schrift(size, 'bold');
        while (size > 8 && this.doc.getTextWidth(pdfText(k.wert)) > w - 6) this.schrift(--size, 'bold');
        this.t(k.wert, x + 3, this.y + 11.6);
        if (k.sub || k.ampel) {
          const dx = k.ampel ? 3.4 : 0;
          if (k.ampel) this.punkt(x + 4.1, this.y + 15.3, k.ampel, 1.05);
          this.schrift(7.5, 'normal', FARBE.ink2);
          this.t(this.kurz(k.sub ?? AMPEL_TEXT[k.ampel!], w - 6 - dx), x + 3 + dx, this.y + 16.3);
        }
      });
      this.y += h + gap;
    }
    this.y += 3;
  }

  /** Beschriftete Werte im Raster (Stammdaten). */
  paare(paare: [string, string | null | undefined][], spalten = this.quer ? 4 : 3) {
    const rows = paare.filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!rows.length) return;
    const w = this.innen / spalten;
    for (let i = 0; i < rows.length; i += spalten) {
      this.platz(10);
      rows.slice(i, i + spalten).forEach(([label, wert], j) => {
        const x = RAND + j * w;
        this.schrift(7.5, 'normal', FARBE.muted);
        this.t(label, x, this.y + 2.6);
        this.schrift(9.5);
        this.t(this.kurz(wert, w - 4), x, this.y + 7);
      });
      this.y += 10.5;
    }
    this.y += 2.5;
  }

  /** Zwei Balken: Fortschritt Soll (blau) und Ist (orange), Werte als Text daneben. */
  fortschritt(soll: number, ist: number, sollText: string, istText: string) {
    this.platz(14);
    const x = RAND + 12;
    const w = this.innen - 12 - 16;
    const zeile = (label: string, wert: number, text: string, farbe: RGB, y: number) => {
      this.schrift(8, 'normal', FARBE.ink2);
      this.t(label, RAND, y + 2.3);
      this.doc.setFillColor(...FARBE.surface2);
      this.doc.roundedRect(x, y, w, 2.8, 1.4, 1.4, 'F');
      const breite = Math.min(1, Math.max(0, wert)) * w;
      if (breite > 0.3) {
        this.doc.setFillColor(...farbe);
        this.doc.roundedRect(x, y, Math.max(2.8, breite), 2.8, 1.4, 1.4, 'F');
      }
      this.schrift(8.5, 'bold');
      this.t(text, RAND + this.innen, y + 2.4, 'right');
    };
    zeile('Soll', soll, sollText, FARBE.soll, this.y);
    zeile('Ist', ist, istText, FARBE.ist, this.y + 5);
    this.y += 14;
  }

  tabelle(spalten: Spalte[], zeilen: Zelle[][], opt: TabellenOptionen = {}) {
    if (!zeilen.length) return;
    const size = opt.schrift ?? 8.5;
    const px = opt.dicht ? 1.4 : 2;
    // Ampelpunkte werden nach dem Zeichnen der Zelle ergänzt; Schlüssel "Zeile:Spalte"
    const ampeln = new Map<string, Ampel>();
    const zelle = (z: Zelle, r: number, c: number, summe = false): CellDef => {
      const obj = typeof z === 'object' && z !== null ? z : null;
      const def: CellDef = { content: pdfText(zellText(z)), styles: {} };
      if (obj?.fett || summe) def.styles!.fontStyle = 'bold';
      if (summe) def.styles!.fillColor = FARBE.kopf;
      if (obj?.ampel) {
        ampeln.set(`${r}:${c}`, obj.ampel);
        def.styles!.cellPadding = { top: 1.7, bottom: 1.7, right: px, left: px + 3.6 };
      }
      return def;
    };
    const body = zeilen.map((row, r) => row.map((z, c) => zelle(z, r, c)));
    if (opt.summe) body.push(opt.summe.map((z, c) => zelle(z, body.length, c, true)));

    this.platz(22);
    autoTable(this.doc, {
      startY: this.y,
      margin: { top: OBEN_FOLGE, bottom: FUSS + 2, left: RAND, right: RAND },
      theme: 'plain',
      head: [spalten.map((s) => ({ content: pdfText(s.titel), styles: { halign: s.rechts ? 'right' : 'left' } }) as CellDef)],
      body,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: size, textColor: FARBE.ink, cellPadding: { top: 1.7, bottom: 1.7, left: px, right: px }, overflow: 'linebreak', valign: 'top', lineWidth: 0 },
      headStyles: { fillColor: FARBE.kopf, textColor: FARBE.ink2, fontStyle: 'bold', fontSize: size - 0.7, valign: 'bottom' },
      alternateRowStyles: { fillColor: FARBE.zebra },
      columnStyles: Object.fromEntries(spalten.map((s, i) => [i, { halign: s.rechts ? 'right' : 'left', cellWidth: s.breite ?? (s.rechts || s.eng ? 'wrap' : 'auto') }])),
      didDrawCell: (d: CellHookData) => {
        const ampel = d.section === 'body' ? ampeln.get(`${d.row.index}:${d.column.index}`) : undefined;
        if (!ampel) return;
        // linksbündig: Punkt vor dem Text; rechtsbündig (Zahlen): direkt links neben der Zahl
        let x = d.cell.x + px + 1.2;
        if (spalten[d.column.index]?.rechts) {
          this.schrift(size, d.cell.styles.fontStyle === 'bold' ? 'bold' : 'normal');
          x = d.cell.x + d.cell.width - px - Math.max(...d.cell.text.map((t) => this.doc.getTextWidth(t))) - 2.2;
        }
        this.punkt(x, d.cell.y + 1.7 + size * 0.19, ampel);
      },
    });
    this.y = (this.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  /** Kopf- und Fußzeilen auf allen Seiten ergänzen (erst am Ende ist die Seitenzahl bekannt). */
  fertig(): jsPDF {
    const { doc, meta } = this;
    const seiten = doc.getNumberOfPages();
    const jetzt = new Date();
    const erstellt = `Erstellt am ${date(`${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`)}, ${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')} Uhr von ${meta.benutzer}`;
    for (let i = 1; i <= seiten; i++) {
      doc.setPage(i);
      const rechts = this.breite - RAND;
      doc.setDrawColor(...FARBE.line);
      doc.setLineWidth(0.25);
      if (i === 1) {
        doc.setFillColor(...FARBE.accent);
        doc.roundedRect(RAND, 11.2, 3.4, 3.4, 0.9, 0.9, 'F');
        this.schrift(7.5, 'bold', FARBE.ink2);
        this.t('PROJEKT-DASHBOARD', RAND + 5, 14);
        const infos = [`Stand ${date(meta.stand)}`, ...(meta.infos ?? [])];
        const infoBreite = this.innen * 0.38;
        infos.slice(0, 4).forEach((info, n) => {
          this.schrift(n === 0 ? 9 : 8.5, n === 0 ? 'bold' : 'normal', n === 0 ? FARBE.ink : FARBE.ink2);
          this.t(this.kurz(info, infoBreite), rechts, 14 + n * 4.6, 'right');
        });
        const links = this.innen - infoBreite - 6;
        this.schrift(20, 'bold');
        this.t(this.kurz(meta.titel, links), RAND, 25);
        if (meta.untertitel) {
          this.schrift(11.5, 'normal', FARBE.ink2);
          this.t(this.kurz(meta.untertitel, links), RAND, 31.5);
        }
        doc.line(RAND, 36.5, rechts, 36.5);
      } else {
        this.schrift(8, 'normal', FARBE.ink2);
        this.t(this.kurz([meta.titel, meta.untertitel].filter(Boolean).join(' · '), this.innen - 40), RAND, 11.5);
        this.t(`Stand ${date(meta.stand)}`, rechts, 11.5, 'right');
        doc.line(RAND, 14, rechts, 14);
      }
      const fy = this.hoehe - 9;
      doc.line(RAND, fy - 4.2, rechts, fy - 4.2);
      this.schrift(7.5, 'normal', FARBE.muted);
      this.t(this.kurz(erstellt, this.innen * 0.55), RAND, fy);
      if (meta.vermerk) this.t(meta.vermerk, this.breite / 2 + 20, fy, 'center');
      this.t(`Seite ${i} von ${seiten}`, rechts, fy, 'right');
    }
    return doc;
  }
}
