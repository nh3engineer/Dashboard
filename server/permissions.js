// Berechtigungskatalog und Standardrollen – einzige Quelle für gültige Berechtigungsschlüssel.
const def = (group, key, label) => ({ key, label, group });

export const PERMISSIONS = [
  def('Projekte', 'projekte.alle', 'Alle Projekte sehen (sonst nur zugewiesene)'),
  def('Projekte', 'projekte.bearbeiten', 'Projekte anlegen, bearbeiten und löschen'),
  def('Termine', 'termine.ansehen', 'Terminplan ansehen'),
  def('Termine', 'termine.bearbeiten', 'Phasen und Meilensteine bearbeiten'),
  def('Kosten', 'kosten.ansehen', 'Budget und Kosten ansehen'),
  def('Kosten', 'kosten.bearbeiten', 'Kostenpositionen bearbeiten'),
  def('Ressourcen', 'ressourcen.ansehen', 'Aufwand und Kapazitäten ansehen'),
  def('Ressourcen', 'ressourcen.bearbeiten', 'Aufwand bearbeiten (Bereichskapazitäten nur mit „Alle Projekte sehen“)'),
  def('Änderungen', 'aenderungen.ansehen', 'Änderungsanträge ansehen'),
  def('Änderungen', 'aenderungen.bearbeiten', 'Änderungsanträge bearbeiten'),
  def('Qualität', 'qualitaet.ansehen', 'Mängel ansehen'),
  def('Qualität', 'qualitaet.bearbeiten', 'Mängel bearbeiten'),
  def('Risiken', 'risiken.ansehen', 'Risiken ansehen'),
  def('Risiken', 'risiken.bearbeiten', 'Risiken bearbeiten'),
  def('Kundenfeedback', 'feedback.ansehen', 'Kundenfeedback ansehen'),
  def('Kundenfeedback', 'feedback.abgeben', 'Eigenes Feedback abgeben'),
  def('Kundenfeedback', 'feedback.bearbeiten', 'Kundenfeedback bearbeiten und löschen'),
  def('Kennzahlen', 'kpi.standard', 'Standard-KPIs (Projektteam)'),
  def('Kennzahlen', 'kpi.management', 'Management-KPIs (Portfolio, ROI, Risiken, Kapazität)'),
  def('Berichte', 'berichte.erstellen', 'PDF-Berichte erstellen'),
  def('Verwaltung', 'benutzer.verwalten', 'Benutzer und Rollen verwalten'),
  def('Verwaltung', 'daten.export', 'Gesamten Datenbestand exportieren und importieren (alle Projekte, nur mit „Alle Projekte sehen“)'),
];

export const ALL_KEYS = PERMISSIONS.map((p) => p.key);
const VIEW = ALL_KEYS.filter((k) => k.endsWith('.ansehen'));
const both = (...areas) => areas.flatMap((a) => [`${a}.ansehen`, `${a}.bearbeiten`]);

export const ADMIN_ROLE = 'Administrator';

export const DEFAULT_ROLES = [
  { name: ADMIN_ROLE, beschreibung: 'Vollzugriff inklusive Benutzerverwaltung', permissions: ALL_KEYS, system: 1 },
  { name: 'Geschäftsführung', beschreibung: 'Alle Projekte und Kennzahlen, ohne Benutzerverwaltung', permissions: ALL_KEYS.filter((k) => k !== 'benutzer.verwalten'), system: 0 },
  { name: 'Management', beschreibung: 'Lesender Zugriff auf alle Projekte inklusive Management-KPIs', permissions: ['projekte.alle', ...VIEW, 'kpi.standard', 'kpi.management', 'berichte.erstellen'], system: 0 },
  {
    name: 'Projektleitung',
    beschreibung: 'Bearbeitet die zugewiesenen Projekte',
    permissions: ['projekte.bearbeiten', ...both('termine', 'kosten', 'ressourcen', 'aenderungen', 'qualitaet', 'risiken'), 'feedback.ansehen', 'kpi.standard', 'berichte.erstellen'],
    system: 0,
  },
  { name: 'Kunde / Bauherr', beschreibung: 'Sieht Termine und Änderungen der eigenen Projekte, ohne Kosten', permissions: ['termine.ansehen', 'aenderungen.ansehen', 'feedback.abgeben', 'berichte.erstellen'], system: 0 },
];

/** Prüft eine Berechtigungsliste und liefert sie ohne Duplikate in Katalogreihenfolge. */
export function cleanPermissions(list) {
  if (!Array.isArray(list)) throw new Error('permissions: Liste erwartet');
  const unknown = list.filter((k) => !ALL_KEYS.includes(k));
  if (unknown.length) throw new Error(`Unbekannte Berechtigung: ${unknown.map(String).join(', ').slice(0, 200)}`);
  // Bearbeiten ohne Ansehen ergibt keine bedienbare Rolle – das Ansehen-Recht wird mitvergeben
  const implied = list.filter((k) => k.endsWith('.bearbeiten')).map((k) => k.replace('.bearbeiten', '.ansehen'));
  return ALL_KEYS.filter((k) => list.includes(k) || implied.includes(k));
}
