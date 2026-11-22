import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import type { Metrics } from '../calc';
import { date, days, eur, eurCompact, index, pct, signedEur } from '../format';
import { projectForm } from '../forms';
import type { Ampel } from '../types';
import { Gantt } from './Gantt';
import { KpiCard, KpiSection, SollIstBars } from './kpi/KpiCard';
import { aenderungAmpel, hours, indexAmpel, limitAmpel, maengelAmpel, pctOrDash, portfolioStandard, projectRows, quoteAmpel, signedPct, tageText, type ProjectRow } from './kpi/util';
import { AmpelBadge, DualBar, Icon, Legend, STATUS_OPTIONS, StatusBadge, Tile } from './ui';
import '../styles/kpi.css';

const worst = (rows: ProjectRow[], key: 'terminAmpel' | 'kostenAmpel', a: Ampel) => rows.filter((r) => r.m[key] === a).length;

export function Portfolio() {
  const { data, can, openForm, go } = useApp();
  const [status, setStatus] = useState('aktiv');
  const [query, setQuery] = useState('');
  const open = (id: number) => go({ page: 'projekt', id });

  const termine = can('termine.ansehen');
  // Ohne kosten.ansehen fehlt budget – Kostenspalten, -kacheln und -diagramm entfallen
  const kosten = can('kosten.ansehen') && data.projects.every((p) => p.budget !== undefined);
  const standard = can('kpi.standard');

  const rows = useMemo(() => projectRows(data), [data]);
  const shown = rows.filter(({ p }) => {
    const okStatus = status === 'alle' || (status === 'aktiv' ? p.status !== 'abgeschlossen' : p.status === status);
    const q = query.trim().toLowerCase();
    return okStatus && (!q || `${p.name} ${p.kunde} ${p.leiter}`.toLowerCase().includes(q));
  });

  const sum = (f: (m: Metrics) => number) => shown.reduce((a, r) => a + f(r.m), 0);
  const budget = sum((m) => m.bac);
  const ac = sum((m) => m.ac);
  const pv = sum((m) => m.pv);
  const eac = sum((m) => m.eac);
  const terminRot = worst(shown, 'terminAmpel', 'rot');
  const terminGelb = worst(shown, 'terminAmpel', 'gelb');
  const kostenRot = worst(shown, 'kostenAmpel', 'rot');
  const maxBudget = Math.max(1, ...shown.map((r) => Math.max(r.m.bac, r.m.ac)));
  const k = standard ? portfolioStandard(shown) : null;
  const kpiCards = k && [
    termine && (
      <KpiCard key="ms" icon="flag" title="Meilenstein-Termintreue" value={pctOrDash(k.msQuote)} ampel={quoteAmpel(k.msQuote)}
        status={k.msQuote === null ? 'Noch nichts fällig' : undefined}
        facts={[['Meilensteine erreicht', `${k.msErreicht} von ${k.msGesamt}`], ['Davon termingerecht', k.msTermingerecht], ['Bis heute fällig', k.msFaellig]]} />
    ),
    can('ressourcen.ansehen') && (
      <KpiCard key="h" icon="users" title="Stunden Ist / Soll" value={hours(k.stundenIst)} unit={`von ${hours(k.stundenSoll)}`} ampel={limitAmpel(k.aufwandAbw, 0.05, 0.15)}
        status={k.aufwandAbw === null ? 'Kein Soll bis heute' : `${signedPct(k.aufwandAbw)} ggü. Soll`}
        facts={[['Soll gesamt', hours(k.stundenSollGesamt)]]}>
        <SollIstBars soll={k.stundenSoll} ist={k.stundenIst} max={Math.max(k.stundenSollGesamt, k.stundenIst)} title={`Soll bis heute ${hours(k.stundenSoll)} · Ist ${hours(k.stundenIst)}`} />
      </KpiCard>
    ),
    can('aenderungen.ansehen') && (
      <KpiCard key="cr" icon="edit" title="Offene Änderungen" value={k.crOffen} unit={`von ${k.crGesamt}`} ampel={aenderungAmpel(k)}
        status={!k.crGesamt ? 'Keine Änderungen' : k.crOffen ? 'Entscheidung ausständig' : 'Alle entschieden'}
        facts={[kosten && ['Genehmigte Mehrkosten', `${signedEur(k.crKosten)}${k.aenderungsquote === null ? '' : ` (${pctOrDash(k.aenderungsquote)} des Budgets)`}`], ['Terminauswirkung (genehmigt)', tageText(k.crTage)]]} />
    ),
    can('qualitaet.ansehen') && (
      <KpiCard key="q" icon="check" title="Offene Mängel" value={k.maengelOffen} unit={`davon ${k.maengelKritischOffen} kritisch`} ampel={maengelAmpel(k)}
        status={!k.maengelGesamt ? 'Keine Mängel' : k.maengelKritischOffen ? 'Kritische Mängel offen' : k.maengelOffen ? 'Offene Mängel' : 'Alle behoben'}
        facts={[['Behebungsquote', pctOrDash(k.behebungsquote)], ['Nacharbeit', hours(k.nacharbeitStunden)]]} />
    ),
  ].filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projektübersicht</h1>
          <p className="muted">{kosten || termine ? 'Soll-/Ist-Vergleich' : 'Übersicht'} Ihrer Projekte, Stand {date(new Date().toISOString().slice(0, 10))}</p>
        </div>
        {can('projekte.bearbeiten') && (
          <button className="btn primary" onClick={() => openForm(projectForm(can, undefined, (saved) => go({ page: 'projekt', id: saved.id })))}><Icon name="plus" />Neues Projekt</button>
        )}
      </div>

      <div className="filters">
        <input type="search" placeholder="Projekt, Kunde oder Leitung suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Suche" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filtern">
          <option value="aktiv">Aktive Projekte</option>
          <option value="alle">Alle Projekte</option>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="tiles">
        <Tile label="Projekte" value={shown.length} sub={`${shown.filter((r) => r.p.status === 'laufend').length} laufend`} />
        {kosten && <Tile label="Gesamtbudget" value={eurCompact(budget)} sub={`Plan bis heute ${eurCompact(pv)}`} />}
        {kosten && <Tile label="Ist-Kosten" value={eurCompact(ac)} sub={`${signedEur(ac - pv)} ggü. Plan bis heute`} ampel={ac > pv * 1.1 ? 'rot' : ac > pv * 1.02 ? 'gelb' : 'gruen'} />}
        {kosten && <Tile label="Prognose Endkosten" value={eurCompact(eac)} sub={`${signedEur(eac - budget)} ggü. Budget`} ampel={kostenRot ? 'rot' : eac > budget * 1.02 ? 'gelb' : 'gruen'} />}
        {termine && <Tile label="Terminlage" value={terminRot ? `${terminRot} kritisch` : terminGelb ? `${terminGelb} Achtung` : 'Im Plan'} sub={`${terminGelb} mit leichtem Verzug`} ampel={terminRot ? 'rot' : terminGelb ? 'gelb' : 'gruen'} />}
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Projekte</h2>
          {termine && <Legend />}
        </div>
        {shown.length === 0 ? (
          <p className="empty">{rows.length ? 'Keine Projekte für diese Auswahl.' : 'Ihnen sind noch keine Projekte zugewiesen.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="table clickable-rows">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Status</th>
                  {termine && <th style={{ minWidth: 170 }}>Fortschritt Soll / Ist</th>}
                  {termine && <th>Termin</th>}
                  <th>{termine ? 'Ende Soll / Prognose' : 'Ende Soll'}</th>
                  {standard && termine && <th className="num" title="Schedule Performance Index = Leistungswert ÷ Planwert; unter 1,0 = Verzug">SPI</th>}
                  {standard && kosten && <th className="num" title="Cost Performance Index = Leistungswert ÷ Ist-Kosten; unter 1,0 = Kostenüberschreitung">CPI</th>}
                  {kosten && <th>Kosten</th>}
                  {kosten && <th className="num">Ist / Budget</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, m }) => (
                  <tr key={p.id} onClick={() => open(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(p.id)}>
                    <td>
                      <div className="strong">{p.name}</div>
                      <div className="muted small">{[p.kunde, p.leiter].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    {termine && <td><DualBar soll={m.sollPct} ist={m.istPct} /></td>}
                    {termine && <td><AmpelBadge ampel={m.terminAmpel}>{m.terminAmpel === 'neutral' ? 'Offen' : days(m.delayDays)}</AmpelBadge></td>}
                    <td className="nowrap">
                      {date(p.ende_soll)}
                      {termine && <div className="muted small">{m.delayDays ? `Prognose ${date(m.forecastEnd)}` : 'wie geplant'}</div>}
                    </td>
                    {standard && termine && <td className="num"><IndexCell value={m.spi} /></td>}
                    {standard && kosten && <td className="num"><IndexCell value={m.cpi} /></td>}
                    {kosten && <td><AmpelBadge ampel={m.kostenAmpel}>{m.kostenAmpel === 'neutral' ? 'Offen' : signedEur(m.eac - m.bac)}</AmpelBadge></td>}
                    {kosten && (
                      <td className="num nowrap">
                        {eur(m.ac)}
                        <div className="muted small">von {eur(m.bac)} ({m.bac ? pct(m.ac / m.bac) : '–'})</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {kpiCards && kpiCards.length > 0 && (
        <KpiSection title="Standard-KPIs" hint={`Summen über ${shown.length} ${shown.length === 1 ? 'gezeigtes Projekt' : 'gezeigte Projekte'}`}>
          <div className="kpi-grid">{kpiCards}</div>
        </KpiSection>
      )}

      {(termine || kosten) && shown.length > 0 && (
        <div className="grid-2">
          {termine && (
            <section className="card">
              <div className="card-head">
                <h2>Zeitplan</h2>
                <Legend />
              </div>
              <Gantt
                onRowClick={open}
                rows={shown.map(({ p, m, tasks }) => {
                  const starts = tasks.filter((t) => t.start_ist).map((t) => t.start_ist!).sort();
                  return {
                    id: p.id,
                    label: p.name,
                    sollStart: p.start_soll,
                    sollEnd: p.ende_soll,
                    istStart: starts[0] ?? null,
                    istEnd: p.status === 'abgeschlossen' ? m.forecastEnd : null,
                    pct: m.istPct * 100,
                  };
                })}
              />
            </section>
          )}

          {kosten && (
            <section className="card">
              <div className="card-head">
                <h2>Kosten je Projekt</h2>
                <div className="legend">
                  <span><i className="swatch soll" />Soll bis heute</span>
                  <span><i className="swatch ist" />Ist</span>
                  <span><i className="swatch budget" />Budget</span>
                </div>
              </div>
              <div className="hbars">
                {shown.map(({ p, m }) => (
                  <div key={p.id} className="hbar" onClick={() => open(p.id)} title={`Soll bis heute ${eur(m.pv)} · Ist ${eur(m.ac)} · Budget ${eur(m.bac)}`}>
                    <div className="hbar-label"><span>{p.name}</span><span className="muted">{eurCompact(m.ac)} / {eurCompact(m.bac)}</span></div>
                    <div className="hbar-plot">
                      <div className="hbar-bar soll" style={{ width: `${(m.pv / maxBudget) * 100}%` }} />
                      <div className="hbar-bar ist" style={{ width: `${(m.ac / maxBudget) * 100}%` }} />
                      <i className="hbar-budget" style={{ left: `${(m.bac / maxBudget) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** Indexwert mit Ampel-Icon; der Zahlenwert bleibt in Textfarbe. */
function IndexCell({ value }: { value: number | null }) {
  const ampel = indexAmpel(value);
  if (value === null) return <span className="muted">–</span>;
  return <AmpelBadge ampel={ampel}>{index(value)}</AmpelBadge>;
}
