import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { byCategory, taskDelay, toDay, todayIso } from '../calc';
import { date, days, eur, eurCompact, index, pct, signedEur } from '../format';
import { costForm, projectForm, taskForm } from '../forms';
import { CostChart } from './CostChart';
import { Gantt } from './Gantt';
import { ManagementKpis, StandardKpis } from './kpi/ProjectKpis';
import { AenderungenTab, FeedbackTab, QualitaetTab, RessourcenTab, RisikenTab } from './kpi/ProjectTabs';
import { delayAmpel, projectRow } from './kpi/util';
import { AmpelBadge, Icon, Legend, StatusBadge, Tile } from './ui';
import '../styles/kpi.css';

type Tab = 'uebersicht' | 'termine' | 'kosten' | 'ressourcen' | 'aenderungen' | 'qualitaet' | 'risiken' | 'feedback';

/** Reiter mit dem Recht, das ihn sichtbar macht (mehrere = eines genügt). */
const TABS: { key: Tab; label: string; needs?: string[] }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'termine', label: 'Terminplan', needs: ['termine.ansehen'] },
  { key: 'kosten', label: 'Kosten', needs: ['kosten.ansehen'] },
  { key: 'ressourcen', label: 'Ressourcen', needs: ['ressourcen.ansehen'] },
  { key: 'aenderungen', label: 'Änderungen', needs: ['aenderungen.ansehen'] },
  { key: 'qualitaet', label: 'Qualität', needs: ['qualitaet.ansehen'] },
  { key: 'risiken', label: 'Risiken', needs: ['risiken.ansehen'] },
  { key: 'feedback', label: 'Feedback', needs: ['feedback.ansehen', 'feedback.abgeben'] },
];

const KritischMarke = () => <span className="kp-mark" title="Kritischer Pfad"><Icon name="flag" size={12} />KP</span>;

export function ProjectDetail({ projectId }: { projectId: number }) {
  const { data, can, openForm, remove, go } = useApp();
  const [tabState, setTab] = useState<Tab>('uebersicht');
  const [art, setArt] = useState<'alle' | 'soll' | 'ist'>('alle');
  const p = data.projects.find((x) => x.id === projectId);
  const row = useMemo(() => p && projectRow(p, data), [p, data]);
  if (!p || !row) return <p className="empty">Projekt nicht gefunden.</p>;

  const { m, tasks, costs, mk } = row;
  const termine = can('termine.ansehen');
  // budget fehlt ohne kosten.ansehen – dann keinerlei Kostenanzeige
  const kosten = can('kosten.ansehen') && p.budget !== undefined;
  const editProject = can('projekte.bearbeiten');
  const editTasks = can('termine.bearbeiten');
  const editCosts = can('kosten.bearbeiten');
  const tabs = TABS.filter((t) => !t.needs || t.needs.some(can));
  // Nach einem Rechtewechsel kann der gewählte Reiter verschwunden sein
  const tab = tabs.some((t) => t.key === tabState) ? tabState : 'uebersicht';

  const today = toDay(todayIso());
  const sorted = [...tasks].sort((a, b) => a.start_soll.localeCompare(b.start_soll) || a.ende_soll.localeCompare(b.ende_soll));
  const hatKritisch = tasks.some((t) => t.kritisch);
  const milestones = sorted.filter((t) => t.typ === 'meilenstein').sort((a, b) => a.ende_soll.localeCompare(b.ende_soll));
  const cats = byCategory(costs);
  const catMax = Math.max(1, ...cats.map((c) => Math.max(c.soll, c.ist)));
  const bookings = costs.filter((c) => art === 'alle' || c.art === art).sort((a, b) => b.datum.localeCompare(a.datum));
  const taskAmpel = (t: (typeof tasks)[number]) => {
    const d = taskDelay(t, today);
    const untouched = !t.start_ist && !t.ende_ist && d === 0 && t.fortschritt < 100;
    return <AmpelBadge ampel={untouched ? 'neutral' : delayAmpel(d)}>{untouched ? 'Offen' : t.fortschritt >= 100 && d <= 0 && t.typ === 'meilenstein' ? 'Erreicht' : days(d)}</AmpelBadge>;
  };

  const ganttCard = (
    <section className="card">
      <div className="card-head">
        <h2>Terminplan</h2>
        <div className="legend">
          <span><i className="swatch soll" />Soll</span>
          <span><i className="swatch ist" />Ist</span>
          {hatKritisch && <span><KritischMarke />kritischer Pfad</span>}
        </div>
      </div>
      <Gantt
        rows={sorted.map((t) => ({
          id: t.id, label: t.name, sollStart: t.start_soll, sollEnd: t.ende_soll, istStart: t.start_ist, istEnd: t.ende_ist, milestone: t.typ === 'meilenstein', pct: t.fortschritt, critical: !!t.kritisch,
        }))}
      />
    </section>
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
                <div className="dualbar-bars" title={`Soll ${eur(c.soll)} · Ist ${eur(c.ist)}`}>
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

  const costCards = (
    <div className="grid-2">
      <section className="card">
        <div className="card-head"><h2>Kostenverlauf (kumuliert)</h2></div>
        <CostChart costs={costs} budget={p.budget ?? 0} />
      </section>
      <section className="card">
        <div className="card-head"><h2>Kosten nach Kategorie</h2><Legend /></div>
        {cats.length ? catTable : <p className="empty">Noch keine Kosten erfasst.</p>}
      </section>
    </div>
  );

  // Die KPI-Blöcke zeigen nur Karten, deren Daten die Rolle ansehen darf – ohne diese Rechte bleiben sie leer
  const standard = can('kpi.standard') && ['termine', 'kosten', 'ressourcen', 'aenderungen', 'qualitaet'].some((a) => can(`${a}.ansehen`)) && <StandardKpis row={row} />;
  const management = can('kpi.management') && (p.auftragswert !== undefined || kosten || termine) && <ManagementKpis row={row} />;

  return (
    <>
      <button className="btn ghost back" onClick={() => go({ page: 'portfolio' })}><Icon name="back" />Alle Projekte</button>
      <div className="page-head">
        <div>
          <h1>{p.name} <StatusBadge status={p.status} /></h1>
          <p className="muted">{[p.kunde, p.leiter && `Leitung ${p.leiter}`, `${date(p.start_soll)} – ${date(p.ende_soll)}`].filter(Boolean).join(' · ')}</p>
          {p.beschreibung && <p className="desc">{p.beschreibung}</p>}
        </div>
        {editProject && (
          <div className="actions">
            <button className="btn" onClick={() => openForm(projectForm(can, p))}><Icon name="edit" />Bearbeiten</button>
            <button className="btn danger" onClick={() => remove('projects', p.id, `Projekt „${p.name}“ mit allen zugehörigen Daten`, () => go({ page: 'portfolio' }))}><Icon name="trash" />Löschen</button>
          </div>
        )}
      </div>

      {(termine || kosten) && (
        <div className="tiles">
          {termine && <Tile label="Fortschritt Ist" value={pct(m.istPct)} sub={`Soll ${pct(m.sollPct)}${can('kpi.standard') ? ` · SPI ${index(m.spi)}` : ''}`} ampel={m.terminAmpel} />}
          {termine && <Tile label="Termin" value={m.terminAmpel === 'neutral' ? 'Offen' : days(m.delayDays)} sub={`Prognose Ende ${date(m.forecastEnd)}`} ampel={m.terminAmpel} />}
          {kosten && <Tile label="Budget" value={eurCompact(m.bac)} sub={`Verplant ${eurCompact(m.planTotal)}`} />}
          {kosten && <Tile label="Ist-Kosten" value={eurCompact(m.ac)} sub={`${signedEur(m.ac - m.pv)} ggü. Plan bis heute`} />}
          {kosten && <Tile label="Prognose Endkosten" value={eurCompact(m.eac)} sub={`${signedEur(m.eac - m.bac)} ggü. Budget${can('kpi.standard') ? ` · CPI ${index(m.cpi)}` : ''}`} ampel={m.kostenAmpel} />}
        </div>
      )}

      {tabs.length > 1 && (
        <div className="tabs tabs-scroll" role="tablist">
          {tabs.map(({ key, label }) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      )}

      {tab === 'uebersicht' && (
        <>
          {standard}
          {management}
          {termine && ganttCard}
          {termine && milestones.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Meilensteine</h2><span className="muted small">{row.k.msErreicht} von {row.k.msGesamt} erreicht</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Meilenstein</th><th>Termin Soll</th><th>Termin Ist</th><th>Status</th></tr></thead>
                  <tbody>
                    {milestones.map((t) => (
                      <tr key={t.id}>
                        <td><span className="strong">{t.name}</span>{!!t.kritisch && <> <KritischMarke /></>}</td>
                        <td className="nowrap">{date(t.ende_soll)}</td>
                        <td className="nowrap">{date(t.ende_ist)}</td>
                        <td>{taskAmpel(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {kosten && costCards}
          {!termine && !kosten && !standard && !management && (
            <p className="empty">
              {tabs.length > 1
                ? 'Für dieses Projekt sind Ihnen keine weiteren Übersichtsdaten freigeschaltet. Details finden Sie in den Reitern oben.'
                : 'Für dieses Projekt sind Ihrer Rolle keine Bereiche freigeschaltet. Bei Bedarf schaltet Ihre Administratorin oder Ihr Administrator weitere Bereiche frei.'}
            </p>
          )}
        </>
      )}

      {tab === 'termine' && (
        <>
          {ganttCard}
          <section className="card">
            <div className="card-head">
              <h2>Phasen & Meilensteine</h2>
              <div className="actions">
                {hatKritisch && <span className="muted small">Verzug auf dem kritischen Pfad: {days(mk.kritischerPfadVerzug)}</span>}
                {editTasks && <button className="btn primary" onClick={() => openForm(taskForm(p.id))}><Icon name="plus" />Eintrag</button>}
              </div>
            </div>
            {sorted.length === 0 ? <p className="empty">Noch keine Termine erfasst.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Bezeichnung</th><th>Start Soll</th><th>Ende Soll</th><th>Start Ist</th><th>Ende Ist</th><th className="num">Fortschritt</th><th>Abweichung</th>{editTasks && <th />}</tr>
                  </thead>
                  <tbody>
                    {sorted.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <span className="strong">{t.name}</span>{t.typ === 'meilenstein' && <span className="muted small"> · Meilenstein</span>}
                          {!!t.kritisch && <> <KritischMarke /></>}
                        </td>
                        <td>{t.typ === 'meilenstein' ? '–' : date(t.start_soll)}</td>
                        <td>{date(t.ende_soll)}</td>
                        <td>{date(t.start_ist)}</td>
                        <td>{date(t.ende_ist)}</td>
                        <td className="num">{Math.round(t.fortschritt)} %</td>
                        <td>{taskAmpel(t)}</td>
                        {editTasks && (
                          <td className="row-actions">
                            <button className="btn ghost icon-btn" onClick={() => openForm(taskForm(p.id, t))} aria-label={`${t.name} bearbeiten`} title="Bearbeiten"><Icon name="edit" /></button>
                            <button className="btn ghost icon-btn" onClick={() => remove('tasks', t.id, `„${t.name}“`)} aria-label={`${t.name} löschen`} title="Löschen"><Icon name="trash" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'kosten' && (
        <>
          {costCards}
          <section className="card">
            <div className="card-head">
              <h2>Kostenpositionen</h2>
              <div className="actions">
                <select value={art} onChange={(e) => setArt(e.target.value as typeof art)} aria-label="Art filtern">
                  <option value="alle">Soll und Ist</option>
                  <option value="soll">Nur Soll (Plan)</option>
                  <option value="ist">Nur Ist (Buchungen)</option>
                </select>
                {editCosts && <button className="btn primary" onClick={() => openForm(costForm(p.id, data))}><Icon name="plus" />Position</button>}
              </div>
            </div>
            {bookings.length === 0 ? <p className="empty">Keine Kostenpositionen vorhanden.</p> : (
              <div className="table-wrap scroll-y">
                <table className="table">
                  <thead><tr><th>Datum</th><th>Art</th><th>Kategorie</th><th>Bezeichnung</th><th className="num">Betrag</th>{editCosts && <th />}</tr></thead>
                  <tbody>
                    {bookings.map((c) => (
                      <tr key={c.id}>
                        <td>{date(c.datum)}</td>
                        <td><span className="art"><i className={`swatch ${c.art}`} />{c.art === 'soll' ? 'Soll' : 'Ist'}</span></td>
                        <td>{c.kategorie}</td>
                        <td>{c.bezeichnung}</td>
                        <td className="num">{eur(c.betrag)}</td>
                        {editCosts && (
                          <td className="row-actions">
                            <button className="btn ghost icon-btn" onClick={() => openForm(costForm(p.id, data, c))} aria-label="Position bearbeiten" title="Bearbeiten"><Icon name="edit" /></button>
                            <button className="btn ghost icon-btn" onClick={() => remove('costs', c.id, 'Kostenposition')} aria-label="Position löschen" title="Löschen"><Icon name="trash" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'ressourcen' && <RessourcenTab row={row} />}
      {tab === 'aenderungen' && <AenderungenTab row={row} />}
      {tab === 'qualitaet' && <QualitaetTab row={row} />}
      {tab === 'risiken' && <RisikenTab row={row} />}
      {tab === 'feedback' && <FeedbackTab row={row} />}
    </>
  );
}
