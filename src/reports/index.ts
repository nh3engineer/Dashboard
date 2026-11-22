// Verzeichnis der PDF-Berichte. Bewusst ohne jspdf-Import: die Erzeugung (berichte.ts samt jspdf)
// wird erst beim Erstellen nachgeladen, damit das Hauptbundle klein bleibt.
import type { jsPDF } from 'jspdf';
import { todayIso } from '../calc';
import type { Data, Me } from '../types';

export type Can = (permission: string) => boolean;

export interface BerichtCtx {
  data: Data;
  me: Me;
  can: Can;
  /** Pflicht bei projektbezogenen Berichten */
  projectId?: number;
  /** Stichtag (ISO), Standard: heute */
  heute?: string;
}

export type BerichtId = 'projektstatus' | 'termine' | 'kosten' | 'portfolio' | 'management' | 'risiken' | 'kunde';

export interface Berichtstyp {
  id: BerichtId;
  titel: string;
  beschreibung: string;
  zielgruppe: string;
  /** Abschnitte, die je nach Berechtigung enthalten sind */
  inhalt: (can: Can) => string[];
  projektbezogen: boolean;
  erlaubt: (can: Can) => boolean;
  erstellen: (ctx: BerichtCtx) => Promise<jsPDF>;
}

const laden = (id: BerichtId) => async (ctx: BerichtCtx) => (await import('./berichte')).BERICHTE[id](ctx);
const wenn = (bedingung: boolean, text: string) => (bedingung ? [text] : []);

export const BERICHTSTYPEN: Berichtstyp[] = [
  {
    id: 'projektstatus',
    titel: 'Projektstatusbericht',
    beschreibung: 'Der vollständige Stand eines Projekts auf einen Blick: Stammdaten, Ampeln, Fortschritt und Termine im Soll-/Ist-Vergleich sowie die offenen Punkte.',
    zielgruppe: 'Projektleitung, Lenkungsausschuss',
    inhalt: (can) => [
      'Stammdaten, Ampeln, Fortschritt Soll/Ist',
      'Termin: Verzug und Prognose-Ende, Meilensteine, Phasen',
      ...wenn(can('kosten.ansehen'), 'Kostenübersicht: Budget, Ist, Prognose, nach Kategorie'),
      ...wenn(can('kpi.standard'), 'Standard-KPIs'),
      ...wenn(can('aenderungen.ansehen') || can('qualitaet.ansehen') || can('risiken.ansehen'),
        `Offene ${[can('aenderungen.ansehen') && 'Änderungen', can('qualitaet.ansehen') && 'Mängel', can('risiken.ansehen') && 'Risiken'].filter(Boolean).join(', ')}`),
    ],
    projektbezogen: true,
    erlaubt: (can) => can('termine.ansehen'),
    erstellen: laden('projektstatus'),
  },
  {
    id: 'termine',
    titel: 'Terminbericht',
    beschreibung: 'Terminplan im Detail: Phasen und Meilensteine im Soll-/Ist-Vergleich mit Abweichung in Tagen und Gantt-Diagramm.',
    zielgruppe: 'Projektleitung, Projektteam',
    inhalt: () => ['Gantt-Diagramm Soll/Ist mit Heute-Linie', 'Phasen und Meilensteine mit Abweichung in Tagen', 'Kritischer Pfad gekennzeichnet'],
    projektbezogen: true,
    erlaubt: (can) => can('termine.ansehen'),
    erstellen: laden('termine'),
  },
  {
    id: 'kosten',
    titel: 'Kostenbericht',
    beschreibung: 'Kostenstand eines Projekts: Budget, Ist-Kosten und Prognose, der kumulierte Soll-/Ist-Verlauf als Diagramm und alle Kostenpositionen.',
    zielgruppe: 'Projektleitung, Controlling, Geschäftsführung',
    inhalt: (can) => [
      `Budget, Ist-Kosten${can('termine.ansehen') ? ', Prognose Endkosten, CPI' : ''}`,
      'Kostenverlauf Soll/Ist mit Budgetlinie',
      'Kosten nach Kategorie',
      'Liste der Kostenpositionen',
    ],
    projektbezogen: true,
    erlaubt: (can) => can('kosten.ansehen'),
    erstellen: laden('kosten'),
  },
  {
    id: 'portfolio',
    titel: 'Portfolio-Übersicht',
    beschreibung: 'Alle für Sie sichtbaren Projekte in einer Tabelle – Status, Fortschritt und Ampeln nebeneinander.',
    zielgruppe: 'Management, Geschäftsführung, Projektleitung',
    inhalt: (can) => [
      'Status je Projekt',
      ...wenn(can('termine.ansehen'), 'Fortschritt Soll/Ist, Terminampel, Verzug'),
      ...wenn(can('kosten.ansehen'), 'Budget, Ist-Kosten, Kostenampel'),
      ...wenn(can('kpi.standard') && (can('termine.ansehen') || can('kosten.ansehen')), 'SPI / CPI'),
    ],
    projektbezogen: false,
    erlaubt: () => true,
    erstellen: laden('portfolio'),
  },
  {
    id: 'management',
    titel: 'Management-Bericht',
    beschreibung: 'Strategische Kennzahlen über das gesamte Portfolio: Wirtschaftlichkeit, Budget, Risiken und Kapazitäten. Vertraulich.',
    zielgruppe: 'Geschäftsführung, Management',
    inhalt: (can) => [
      ...wenn(can('kosten.ansehen'), 'ROI, Deckungsbeitrag und Marge'),
      ...wenn(can('kosten.ansehen'), 'Budgetauslastung, Kostenabweichung, Nachfinanzierung'),
      ...wenn(can('termine.ansehen'), 'Portfolio-Status und kritischer Pfad'),
      ...wenn(can('risiken.ansehen'), 'Top-Risiken und Eskalationen'),
      ...wenn(can('ressourcen.ansehen'), 'Kapazitätsengpässe je Bereich und Monat'),
      ...wenn(can('feedback.ansehen'), 'Kundenzufriedenheit (NPS)'),
    ],
    projektbezogen: false,
    erlaubt: (can) => can('kpi.management'),
    erstellen: laden('management'),
  },
  {
    id: 'risiken',
    titel: 'Risikobericht',
    beschreibung: 'Alle offenen Risiken über die sichtbaren Projekte, nach Eskalation und Risikowert sortiert, mit den geplanten Maßnahmen.',
    zielgruppe: 'Projektleitung, Management',
    inhalt: () => ['Offene Risiken nach Stufe', 'Eskalationen gekennzeichnet', 'Maßnahmen je Risiko'],
    projektbezogen: false,
    erlaubt: (can) => can('risiken.ansehen'),
    erstellen: laden('risiken'),
  },
  {
    id: 'kunde',
    titel: 'Kundenbericht (Bauherrenbericht)',
    beschreibung: 'Für die Weitergabe an Kunde oder Bauherr: Fortschritt, Meilensteine, Terminausblick und Änderungen – bewusst ohne interne Kennzahlen, Risiken und Ressourcen.',
    zielgruppe: 'Kunde, Bauherr',
    inhalt: (can) => [
      'Fortschritt und Meilensteine',
      'Terminausblick mit voraussichtlicher Fertigstellung',
      ...wenn(can('aenderungen.ansehen'), `Änderungen${can('kosten.ansehen') ? ' mit Kosten' : ' (ohne Kosten)'}`),
    ],
    projektbezogen: true,
    erlaubt: (can) => can('termine.ansehen'),
    erstellen: laden('kunde'),
  },
];

export const erlaubteBerichte = (can: Can) => BERICHTSTYPEN.filter((t) => t.erlaubt(can));

/** Dateisystemtauglicher Name, z. B. „Projektstatusbericht_Neubau_Halle_2026-11-22.pdf“. */
export function dateiname(typ: Berichtstyp, ctx: BerichtCtx): string {
  // Nur ASCII: Umlaute im Download-Namen gehen je nach Browser, Mailprogramm oder Dateisystem verloren.
  const umlaut: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  const sauber = (s: string) => s.normalize('NFC').replace(/[äöüÄÖÜß]/g, (c) => umlaut[c]).normalize('NFD').replace(/[^\x20-\x7e]/g, '')
    .replace(/\(.*?\)/g, ' ').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/[\s.]+/g, '_').slice(0, 60).replace(/_+$/, '');
  const projekt = typ.projektbezogen ? ctx.data.projects.find((p) => p.id === ctx.projectId)?.name : undefined;
  return [typ.titel, projekt ?? '', ctx.heute ?? todayIso()].map(sauber).filter(Boolean).join('_') + '.pdf';
}

export interface BerichtDatei {
  blob: Blob;
  dateiname: string;
  seiten: number;
}

/** Erzeugt den Bericht als PDF-Blob; wirft mit deutscher Meldung, wenn Recht oder Projekt fehlt. */
export async function erstelleBericht(id: BerichtId, ctx: BerichtCtx): Promise<BerichtDatei> {
  const typ = BERICHTSTYPEN.find((t) => t.id === id);
  if (!typ || !typ.erlaubt(ctx.can)) throw new Error('Für diesen Bericht fehlt die Berechtigung.');
  if (typ.projektbezogen && !ctx.data.projects.some((p) => p.id === ctx.projectId)) throw new Error('Bitte ein Projekt auswählen.');
  const doc = await typ.erstellen(ctx);
  return { blob: doc.output('blob'), dateiname: dateiname(typ, ctx), seiten: doc.getNumberOfPages() };
}
