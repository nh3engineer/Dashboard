import { useState } from 'react';
import { byCategory, projectMetrics, taskDelay, toDay, todayIso } from '../calc';
import { date, days, eur, eurCompact, index, pct, signedEur } from '../format';
import type { Cost, Project, Task } from '../types';
import { CostChart } from './CostChart';
import { Gantt } from './Gantt';
import { AmpelBadge, Icon, Legend, StatusBadge, Tile } from './ui';

type Tab = 'uebersicht' | 'termine' | 'kosten';

interface Props {
  project: Project;
  tasks: Task[];
  costs: Cost[];
  onBack: () => void;
  onEditProject: () => void;
  onDeleteProject: () => void;
  onEditTask: (t?: Task) => void;
  onDeleteTask: (t: Task) => void;
  onEditCost: (c?: Cost) => void;
  onDeleteCost: (c: Cost) => void;
}

export function ProjectDetail({ project: p, tasks, costs, onBack, onEditProject, onDeleteProject, onEditTask, onDeleteTask, onEditCost, onDeleteCost }: Props) {
  const [tab, setTab] = useState<Tab>('uebersicht');
  const [art, setArt] = useState<'alle' | 'soll' | 'ist'>('alle');
  const m = projectMetrics(p, tasks, costs);
  const today = toDay(todayIso());
  const sorted = [...tasks].sort((a, b) => a.start_soll.localeCompare(b.start_soll) || a.ende_soll.localeCompare(b.ende_soll));
  const cats = byCategory(costs);
  const catMax = Math.max(1, ...cats.map((c) => Math.max(c.soll, c.ist)));
  const bookings = costs.filter((c) => art === 'alle' || c.art === art).sort((a, b) => b.datum.localeCompare(a.datum));

  const gantt = (
    <Gantt
      rows={sorted.map((t) => ({
        id: t.id, label: t.name, sollStart: t.start_soll, sollEnd: t.ende_soll, istStart: t.start_ist, istEnd: t.ende_ist, milestone: t.typ === 'meilenstein', pct: t.fortschritt,
      }))}
    />
  );

  const catTable = (
    <div className="table-wrap">
      <table className="table compact">
        <thead>
          <tr><th>Kategorie</th><th style={{ minWidth: 80 }}>Soll / Ist</th><th className="num">Soll gesamt</th><th className="num">Soll bis heute</th><th className="num">Ist</th><th className="num">Abweichung</th></tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.kategorie}>
              <td className="strong">{c.kategorie}</td>
              <td>
                <div className="dualbar-bars">
                  <div className="meter soll"><i style={{ width: `${(c.soll / catMax) * 100}%` }} /></div>
                  <div className="meter ist"><i style={{ width: `${(c.ist / catMax) * 100}%` }} /></div>
                </div>
              </td>
              <td className="num">{eur(c.soll)}</td>
              <td className="num">{eur(c.sollBisHeute)}</td>
              <td className="num">{eur(c.ist)}</td>
              <td className="num">{signedEur(c.ist - c.sollBisHeute)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Summe</td><td />
            <td className="num">{eur(m.planTotal)}</td><td className="num">{eur(m.pv)}</td><td className="num">{eur(m.ac)}</td><td className="num">{signedEur(m.ac - m.pv)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <button className="btn ghost back" onClick={onBack}><Icon name="back" />Alle Projekte</button>
      <div className="page-head">
        <div>
          <h1>{p.name} <StatusBadge status={p.status} /></h1>
          <p className="muted">{[p.kunde, p.leiter && `Leitung ${p.leiter}`, `${date(p.start_soll)} – ${date(p.ende_soll)}`].filter(Boolean).join(' · ')}</p>
          {p.beschreibung && <p className="desc">{p.beschreibung}</p>}
        </div>
        <div className="actions">
          <button className="btn" onClick={onEditProject}><Icon name="edit" />Bearbeiten</button>
          <button className="btn danger" onClick={onDeleteProject}><Icon name="trash" />Löschen</button>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Fortschritt Ist" value={pct(m.istPct)} sub={`Soll ${pct(m.sollPct)} · SPI ${index(m.spi)}`} ampel={m.terminAmpel} />
        <Tile label="Termin" value={m.terminAmpel === 'neutral' ? 'Offen' : days(m.delayDays)} sub={`Prognose Ende ${date(m.forecastEnd)}`} ampel={m.terminAmpel} />
        <Tile label="Budget" value={eurCompact(m.bac)} sub={`Verplant ${eurCompact(m.planTotal)}`} />
        <Tile label="Ist-Kosten" value={eurCompact(m.ac)} sub={`${signedEur(m.ac - m.pv)} ggü. Plan bis heute`} />
        <Tile label="Prognose Endkosten" value={eurCompact(m.eac)} sub={`${signedEur(m.eac - m.bac)} ggü. Budget · CPI ${index(m.cpi)}`} ampel={m.kostenAmpel} />
      </div>

      <div className="tabs" role="tablist">
        {([['uebersicht', 'Übersicht'], ['termine', 'Terminplan'], ['kosten', 'Kosten']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'uebersicht' && (
        <>
          <section className="card">
            <div className="card-head"><h2>Terminplan</h2><Legend /></div>
            {gantt}
          </section>
          <div className="grid-2">
            <section className="card">
              <div className="card-head"><h2>Kostenverlauf (kumuliert)</h2></div>
              <CostChart costs={costs} budget={p.budget} />
            </section>
            <section className="card">
              <div className="card-head"><h2>Kosten nach Kategorie</h2><Legend /></div>
              {cats.length ? catTable : <p className="empty">Noch keine Kosten erfasst.</p>}
            </section>
          </div>
        </>
      )}

      {tab === 'termine' && (
        <>
          <section className="card">
            <div className="card-head"><h2>Terminplan</h2><Legend /></div>
            {gantt}
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Phasen & Meilensteine</h2>
              <button className="btn primary" onClick={() => onEditTask()}><Icon name="plus" />Eintrag</button>
            </div>
            {sorted.length === 0 ? <p className="empty">Noch keine Termine erfasst.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Bezeichnung</th><th>Start Soll</th><th>Ende Soll</th><th>Start Ist</th><th>Ende Ist</th><th className="num">Fortschritt</th><th>Abweichung</th><th /></tr>
                  </thead>
                  <tbody>
                    {sorted.map((t) => {
                      const d = taskDelay(t, today);
                      const untouched = !t.start_ist && !t.ende_ist && d === 0 && t.fortschritt < 100;
                      return (
                        <tr key={t.id}>
                          <td><span className="strong">{t.name}</span>{t.typ === 'meilenstein' && <span className="muted small"> · Meilenstein</span>}</td>
                          <td>{t.typ === 'meilenstein' ? '–' : date(t.start_soll)}</td>
                          <td>{date(t.ende_soll)}</td>
                          <td>{date(t.start_ist)}</td>
                          <td>{date(t.ende_ist)}</td>
                          <td className="num">{Math.round(t.fortschritt)} %</td>
                          <td><AmpelBadge ampel={untouched ? 'neutral' : d <= 3 ? 'gruen' : d <= 14 ? 'gelb' : 'rot'}>{untouched ? 'Offen' : days(d)}</AmpelBadge></td>
                          <td className="row-actions">
                            <button className="btn ghost icon-btn" onClick={() => onEditTask(t)} aria-label={`${t.name} bearbeiten`}><Icon name="edit" /></button>
                            <button className="btn ghost icon-btn" onClick={() => onDeleteTask(t)} aria-label={`${t.name} löschen`}><Icon name="trash" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'kosten' && (
        <>
          <div className="grid-2">
            <section className="card">
              <div className="card-head"><h2>Kostenverlauf (kumuliert)</h2></div>
              <CostChart costs={costs} budget={p.budget} />
            </section>
            <section className="card">
              <div className="card-head"><h2>Kosten nach Kategorie</h2><Legend /></div>
              {cats.length ? catTable : <p className="empty">Noch keine Kosten erfasst.</p>}
            </section>
          </div>
          <section className="card">
            <div className="card-head">
              <h2>Kostenpositionen</h2>
              <div className="actions">
                <select value={art} onChange={(e) => setArt(e.target.value as typeof art)} aria-label="Art filtern">
                  <option value="alle">Soll und Ist</option>
                  <option value="soll">Nur Soll (Plan)</option>
                  <option value="ist">Nur Ist (Buchungen)</option>
                </select>
                <button className="btn primary" onClick={() => onEditCost()}><Icon name="plus" />Position</button>
              </div>
            </div>
            {bookings.length === 0 ? <p className="empty">Keine Kostenpositionen vorhanden.</p> : (
              <div className="table-wrap scroll-y">
                <table className="table">
                  <thead><tr><th>Datum</th><th>Art</th><th>Kategorie</th><th>Bezeichnung</th><th className="num">Betrag</th><th /></tr></thead>
                  <tbody>
                    {bookings.map((c) => (
                      <tr key={c.id}>
                        <td>{date(c.datum)}</td>
                        <td><span className="art"><i className={`swatch ${c.art}`} />{c.art === 'soll' ? 'Soll' : 'Ist'}</span></td>
                        <td>{c.kategorie}</td>
                        <td>{c.bezeichnung}</td>
                        <td className="num">{eur(c.betrag)}</td>
                        <td className="row-actions">
                          <button className="btn ghost icon-btn" onClick={() => onEditCost(c)} aria-label="Position bearbeiten"><Icon name="edit" /></button>
                          <button className="btn ghost icon-btn" onClick={() => onDeleteCost(c)} aria-label="Position löschen"><Icon name="trash" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
