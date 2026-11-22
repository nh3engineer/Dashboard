import { useMemo, useState } from 'react';
import { projectMetrics, type Metrics } from '../calc';
import { date, days, eur, eurCompact, pct, signedEur } from '../format';
import type { Ampel, Data, Project } from '../types';
import { Gantt } from './Gantt';
import { AmpelBadge, DualBar, Icon, Legend, STATUS_OPTIONS, StatusBadge, Tile } from './ui';

export interface Row {
  p: Project;
  m: Metrics;
}

const worst = (rows: Row[], key: 'terminAmpel' | 'kostenAmpel', a: Ampel) => rows.filter((r) => r.m[key] === a).length;

export function Portfolio({ data, onOpen, onNew }: { data: Data; onOpen: (id: number) => void; onNew: () => void }) {
  const [status, setStatus] = useState('aktiv');
  const [query, setQuery] = useState('');

  const rows = useMemo<Row[]>(
    () => data.projects.map((p) => ({
      p,
      m: projectMetrics(p, data.tasks.filter((t) => t.project_id === p.id), data.costs.filter((c) => c.project_id === p.id)),
    })),
    [data],
  );

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projektübersicht</h1>
          <p className="muted">Soll-/Ist-Vergleich aller Projekte, Stand {date(new Date().toISOString().slice(0, 10))}</p>
        </div>
        <button className="btn primary" onClick={onNew}><Icon name="plus" />Neues Projekt</button>
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
        <Tile label="Gesamtbudget" value={eurCompact(budget)} sub={`Plan bis heute ${eurCompact(pv)}`} />
        <Tile label="Ist-Kosten" value={eurCompact(ac)} sub={`${signedEur(ac - pv)} ggü. Plan bis heute`} ampel={ac > pv * 1.1 ? 'rot' : ac > pv * 1.02 ? 'gelb' : 'gruen'} />
        <Tile label="Prognose Endkosten" value={eurCompact(eac)} sub={`${signedEur(eac - budget)} ggü. Budget`} ampel={kostenRot ? 'rot' : eac > budget * 1.02 ? 'gelb' : 'gruen'} />
        <Tile label="Terminlage" value={terminRot ? `${terminRot} kritisch` : terminGelb ? `${terminGelb} Achtung` : 'Im Plan'} sub={`${terminGelb} mit leichtem Verzug`} ampel={terminRot ? 'rot' : terminGelb ? 'gelb' : 'gruen'} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Projekte</h2>
          <Legend />
        </div>
        {shown.length === 0 ? (
          <p className="empty">Keine Projekte für diese Auswahl.</p>
        ) : (
          <div className="table-wrap">
            <table className="table clickable-rows">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Status</th>
                  <th style={{ minWidth: 170 }}>Fortschritt Soll / Ist</th>
                  <th>Termin</th>
                  <th>Ende Soll / Prognose</th>
                  <th>Kosten</th>
                  <th className="num">Ist / Budget</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, m }) => (
                  <tr key={p.id} onClick={() => onOpen(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}>
                    <td>
                      <div className="strong">{p.name}</div>
                      <div className="muted small">{[p.kunde, p.leiter].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td><DualBar soll={m.sollPct} ist={m.istPct} /></td>
                    <td><AmpelBadge ampel={m.terminAmpel}>{m.terminAmpel === 'neutral' ? 'Offen' : days(m.delayDays)}</AmpelBadge></td>
                    <td className="nowrap">
                      {date(p.ende_soll)}
                      <div className="muted small">{m.delayDays ? `Prognose ${date(m.forecastEnd)}` : 'wie geplant'}</div>
                    </td>
                    <td><AmpelBadge ampel={m.kostenAmpel}>{m.kostenAmpel === 'neutral' ? 'Offen' : signedEur(m.eac - m.bac)}</AmpelBadge></td>
                    <td className="num nowrap">
                      {eur(m.ac)}
                      <div className="muted small">von {eur(m.bac)} ({m.bac ? pct(m.ac / m.bac) : '–'})</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Zeitplan</h2>
            <Legend />
          </div>
          <Gantt
            onRowClick={onOpen}
            rows={shown.map(({ p, m }) => {
              const starts = data.tasks.filter((t) => t.project_id === p.id && t.start_ist).map((t) => t.start_ist!).sort();
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
              <div key={p.id} className="hbar" onClick={() => onOpen(p.id)} title={`Soll bis heute ${eur(m.pv)} · Ist ${eur(m.ac)} · Budget ${eur(m.bac)}`}>
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
      </div>
    </>
  );
}
