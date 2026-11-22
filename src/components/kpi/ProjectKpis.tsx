import { useApp } from '../../app-context';
import { date, days, eur, eurCompact, index, pct, signedEur } from '../../format';
import { KpiCard, KpiSection, SollIstBars } from './KpiCard';
import {
  aenderungAmpel, delayAmpel, hours, indexAmpel, limitAmpel, maengelAmpel, margeAmpel, pctOrDash, quoteAmpel, signedHours, signedPct, tageText, type ProjectRow,
} from './util';

/** Operative Kennzahlen eines Projekts; Karten ohne zugehöriges Ansehen-Recht entfallen. */
export function StandardKpis({ row }: { row: ProjectRow }) {
  const { can } = useApp();
  const { p, m, k } = row;
  const termine = can('termine.ansehen');
  const kosten = can('kosten.ansehen') && p.budget !== undefined;
  const ressourcen = can('ressourcen.ansehen');
  const aenderungen = can('aenderungen.ansehen');
  const qualitaet = can('qualitaet.ansehen');
  if (!termine && !kosten && !ressourcen && !aenderungen && !qualitaet) return null;
  const msBewertet = k.msQuote === null ? null : `${k.msTermingerecht} termingerecht`;

  return (
    <KpiSection title="Standard-KPIs" hint="Operative Kennzahlen für die Projektsteuerung">
      <div className="kpi-grid cols-3">
        {termine && (
          <KpiCard icon="clock" title="Terminleistung (SPI)" value={index(k.spi)} ampel={indexAmpel(k.spi)}
            status={k.spi === null ? (k.phasenGesamt ? 'Noch kein Planwert' : 'Kein Terminplan') : k.spi >= 0.95 ? 'Im Plan' : 'Verzug'}
            formula="SPI = Leistungswert ÷ Planwert · unter 1,0 = Verzug"
            facts={[
              ['Fortschritt Ist (Leistung)', pct(m.istPct)],
              ['Fortschritt Soll (Plan)', pct(m.sollPct)],
              ['Terminabweichung', m.terminAmpel === 'neutral' ? 'Offen' : days(m.delayDays)],
            ]} />
        )}
        {termine && kosten && (
          <KpiCard icon="euro" title="Kostenleistung (CPI)" value={index(k.cpi)} ampel={indexAmpel(k.cpi)}
            status={k.cpi === null ? (m.ac <= 0 ? 'Noch keine Ist-Kosten' : m.bac <= 0 ? 'Kein Budget' : 'Noch kein Fortschritt') : k.cpi >= 0.95 ? 'Im Budget' : 'Kostenüberschreitung'}
            formula="CPI = Leistungswert ÷ Ist-Kosten · unter 1,0 = Kostenüberschreitung"
            facts={[
              ['Leistungswert', eur(m.ev)],
              ['Ist-Kosten', eur(m.ac)],
              ['Prognose Endkosten', eur(m.eac)],
            ]} />
        )}
        {termine && (
          <KpiCard icon="flag" title="Fertigstellung & Meilensteine" value={pct(k.fertig)} unit="fertig" ampel={quoteAmpel(k.msQuote)}
            status={k.msQuote === null ? 'Noch nichts fällig' : `Termintreue ${pctOrDash(k.msQuote)}`}
            facts={[
              ['Meilensteine erreicht', `${k.msErreicht} von ${k.msGesamt}`],
              ['Bis heute fällig', `${k.msFaellig}${msBewertet ? ` · ${msBewertet}` : ''}`],
              ['Phasen abgeschlossen', `${k.phasenFertig} von ${k.phasenGesamt}`],
            ]} />
        )}
        {ressourcen && (
          <KpiCard icon="users" title="Ressourcen & Aufwand" value={hours(k.stundenIst)} unit="Ist" ampel={limitAmpel(k.aufwandAbw, 0.05, 0.15)}
            status={k.aufwandAbw === null ? 'Kein Soll bis heute' : `${signedPct(k.aufwandAbw)} ggü. Soll`}
            formula="Geleistete Stunden gegenüber dem Soll bis heute (laufender Monat anteilig)"
            facts={[
              ['Soll bis heute', hours(k.stundenSoll)],
              ['Abweichung', signedHours(k.stundenIst - k.stundenSoll)],
              ['Soll gesamt', hours(k.stundenSollGesamt)],
            ]}>
            <SollIstBars soll={k.stundenSoll} ist={k.stundenIst} max={Math.max(k.stundenSollGesamt, k.stundenIst)} title={`Soll bis heute ${hours(k.stundenSoll)} · Ist ${hours(k.stundenIst)} · Soll gesamt ${hours(k.stundenSollGesamt)}`} />
          </KpiCard>
        )}
        {aenderungen && (
          <KpiCard icon="edit" title="Änderungsquote"
            value={kosten ? pctOrDash(k.aenderungsquote) : k.crGesamt} unit={kosten ? 'des Budgets' : k.crGesamt === 1 ? 'Änderung' : 'Änderungen'}
            ampel={aenderungAmpel(k)} status={!k.crGesamt ? 'Keine Änderungen' : k.crOffen ? `${k.crOffen} offen` : 'Alle entschieden'}
            formula={kosten ? 'Genehmigte Mehrkosten ÷ Budget' : undefined}
            facts={[
              ['Änderungen gesamt', `${k.crGesamt} · ${k.crGenehmigt} genehmigt`],
              ['Offen', k.crOffen],
              kosten && ['Genehmigte Mehrkosten', signedEur(k.crKosten)],
              ['Terminauswirkung (genehmigt)', tageText(k.crTage)],
            ]} />
        )}
        {qualitaet && (
          <KpiCard icon="check" title="Qualität" value={k.maengelOffen} unit={k.maengelOffen === 1 ? 'offener Mangel' : 'offene Mängel'} ampel={maengelAmpel(k)}
            status={!k.maengelGesamt ? 'Keine Mängel' : k.maengelKritischOffen ? `${k.maengelKritischOffen} kritisch` : k.maengelOffen ? 'Offene Mängel' : 'Alle behoben'}
            facts={[
              ['Davon kritisch', k.maengelKritischOffen],
              ['Nacharbeit', hours(k.nacharbeitStunden)],
              ['Behebungsquote', `${pctOrDash(k.behebungsquote)}${k.maengelGesamt ? ` (${k.maengelGesamt - k.maengelOffen} von ${k.maengelGesamt})` : ''}`],
            ]} />
        )}
      </div>
    </KpiSection>
  );
}

/** Strategische Kennzahlen eines Projekts (nur mit kpi.management eingebunden). */
export function ManagementKpis({ row }: { row: ProjectRow }) {
  const { can } = useApp();
  const { p, m, mk } = row;
  const wert = p.auftragswert !== undefined;
  const kosten = can('kosten.ansehen') && p.budget !== undefined;
  const termine = can('termine.ansehen');
  if (!wert && !kosten && !termine) return null;

  return (
    <KpiSection management title="Management-KPIs" hint="Wirtschaftlichkeit und Risiko dieses Projekts – nur für das Management sichtbar">
      <div className="kpi-grid cols-3">
        {wert && (
          <KpiCard icon="star" title="Auftragswert" value={eurCompact(mk.auftragswert)}
            facts={[kosten && ['Budget', eur(mk.budget)], kosten && ['Prognose Endkosten', eur(mk.eac)]]} />
        )}
        {wert && kosten && (
          <KpiCard icon="euro" title="Deckungsbeitrag & Marge" value={mk.deckungsbeitrag === null ? '–' : eurCompact(mk.deckungsbeitrag)} ampel={margeAmpel(mk.marge)}
            status={mk.marge === null ? 'Kein Auftragswert' : `Marge ${pctOrDash(mk.marge)}`}
            formula="Auftragswert − Prognose Endkosten"
            facts={[['Marge', pctOrDash(mk.marge)], ['Deckungsbeitrag', mk.deckungsbeitrag === null ? '–' : signedEur(mk.deckungsbeitrag)]]} />
        )}
        {wert && kosten && (
          <KpiCard icon="trend" title="ROI" value={pctOrDash(mk.roi)} ampel={margeAmpel(mk.roi)}
            status={mk.roi === null ? 'Nicht berechenbar' : mk.roi >= 0 ? 'Positiv' : 'Negativ'}
            formula="(Auftragswert − Prognose Endkosten) ÷ Prognose Endkosten" />
        )}
        {kosten && (
          <KpiCard icon="chart" title="Budgetauslastung" value={pctOrDash(mk.budgetauslastung)} ampel={limitAmpel(mk.budgetauslastung, Math.max(m.istPct + 0.05, 0.05), 1)}
            status={mk.budgetauslastung === null ? 'Kein Budget' : mk.budgetauslastung > 1 ? 'Budget überschritten' : `bei ${pct(m.istPct)} Fortschritt`}
            formula="Ist-Kosten ÷ Budget"
            facts={[['Ist-Kosten', eur(mk.istKosten)], ['Budget', eur(mk.budget)]]}>
            <div className="meter ist" title={`Ist ${eur(mk.istKosten)} von ${eur(mk.budget)}`}><i style={{ width: `${Math.min(100, (mk.budgetauslastung ?? 0) * 100)}%` }} /></div>
          </KpiCard>
        )}
        {kosten && (
          <KpiCard icon="warn" title="Gesamtkostenabweichung" value={signedEur(mk.kostenabweichung)} ampel={m.kostenAmpel}
            status={m.kostenAmpel === 'neutral' ? 'Offen' : mk.nachfinanzierung > 0 ? 'Nachfinanzierung nötig' : 'Im Budget'}
            formula="Prognose Endkosten − Budget"
            facts={[['Nötige Nachfinanzierung', eur(mk.nachfinanzierung)], ['Prognose Endkosten', eur(mk.eac)]]} />
        )}
        {termine && (
          <KpiCard icon="flag" title="Kritischer Pfad" value={mk.kritischeAufgaben ? days(mk.kritischerPfadVerzug) : '–'}
            ampel={mk.kritischeAufgaben ? delayAmpel(mk.kritischerPfadVerzug) : 'neutral'}
            status={!mk.kritischeAufgaben ? 'Nicht festgelegt' : mk.kritischerPfadVerzug > 3 ? 'Verzug' : 'Im Plan'}
            formula="Größter Verzug offener Einträge auf dem kritischen Pfad"
            facts={[['Einträge auf dem kritischen Pfad', mk.kritischeAufgaben], ['Prognose Projektende', date(m.forecastEnd)]]} />
        )}
      </div>
    </KpiSection>
  );
}
