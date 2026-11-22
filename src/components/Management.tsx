import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../app-context';
import { date, days, eur, eurCompact, pct, signedEur } from '../format';
import { bereichForm, SKALA } from '../forms';
import { kapazitaet, nps, portfolioManagement, topRisiken } from '../kpi';
import type { Ampel } from '../types';
import { Heatmap } from './kpi/Heatmap';
import { ShareBar } from './kpi/KpiCard';
import { NpsBar } from './kpi/Nps';
import { RiskMatrix } from './kpi/RiskMatrix';
import { AMPEL_ICON, AMPEL_TEXT, delayAmpel, margeAmpel, npsAmpel, pctOrDash, projectRows, score1, signedNps, stufeAmpel, stufeText, type ProjectRow } from './kpi/util';
import { AmpelBadge, Icon, STATUS_OPTIONS, Tile } from './ui';
import '../styles/kpi.css';

const AMPELN: Ampel[] = ['gruen', 'gelb', 'rot', 'neutral'];
const TOP = 8;

function Block({ nr, title, hint, action, children }: { nr: number; title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card mgmt-block">
      <div className="card-head">
        <div className="mgmt-title">
          <span className="mgmt-nr" aria-hidden="true">{nr}</span>
          <div><h2>{title}</h2><p className="muted small">{hint}</p></div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Management() {
  const { data, can, openForm, go } = useApp();
  const [status, setStatus] = useState('alle');
  const [alleRisiken, setAlleRisiken] = useState(false);
  const rows = useMemo(() => projectRows(data), [data]);
  const shown = rows.filter(({ p }) => status === 'alle' || (status === 'aktiv' ? p.status !== 'abgeschlossen' : p.status === status));
  const ids = new Set(shown.map((r) => r.p.id));
  const inScope = <T extends { project_id: number }>(list: T[]) => list.filter((x) => ids.has(x.project_id));

  // Jeder Abschnitt braucht neben kpi.management das Ansehen-Recht seiner Daten – sonst entfällt er.
  const termine = can('termine.ansehen');
  const kosten = can('kosten.ansehen') && rows.every((r) => r.p.budget !== undefined);
  const wert = rows.every((r) => r.p.auftragswert !== undefined);
  const zeigeRisiken = can('risiken.ansehen');
  const zeigeKapazitaet = can('ressourcen.ansehen');
  const zeigeNps = can('feedback.ansehen');

  const total = portfolioManagement(shown.map((r) => r.mk));
  const risiken = topRisiken(inScope(data.risiken), data.projects);
  const eskaliert = risiken.filter((r) => r.eskalation).length;
  const kap = kapazitaet(inScope(data.aufwand), data.bereiche);
  const engpaesse = kap.zeilen.reduce((a, z) => a + z.engpaesse, 0);
  const gesamtNps = nps(inScope(data.feedback));
  const verteilung = (key: 'terminAmpel' | 'kostenAmpel') =>
    AMPELN.map((a) => ({ key: a, label: AMPEL_TEXT[a], icon: AMPEL_ICON[a], value: shown.filter((r) => r.m[key] === a).length }));
  const kritisch = [...shown].sort((a, b) => b.mk.kritischerPfadVerzug - a.mk.kritischerPfadVerzug || b.m.delayDays - a.m.delayDays);
  const link = (r: ProjectRow) => (
    <td>
      <button className="linklike strong" onClick={() => go({ page: 'projekt', id: r.p.id })}>{r.p.name}</button>
      {r.p.kunde && <div className="muted small">{r.p.kunde}</div>}
    </td>
  );
  let nr = 0;
  const bewertet = shown.length - total.ohneAuftragswert;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Management-KPIs <span className="kpi-tag management"><Icon name="shield" size={13} />Management</span></h1>
          <p className="muted">Strategische Portfolio-Sicht: Wirtschaftlichkeit, Risiken, Kapazität und Kundenzufriedenheit · Stand {date(new Date().toISOString().slice(0, 10))}</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Projekte nach Status filtern">
          <option value="alle">Alle Projekte</option>
          <option value="aktiv">Aktive Projekte</option>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {shown.length === 0 ? <p className="empty">{rows.length ? 'Keine Projekte für diese Auswahl.' : 'Es sind noch keine Projekte vorhanden.'}</p> : (
        <>
          {wert && kosten && (
            <Block nr={++nr} title="ROI & Business Value" hint="Deckungsbeitrag = Auftragswert − Prognose Endkosten · ROI = Deckungsbeitrag ÷ Prognose Endkosten">
              <div className="tiles inner">
                <Tile label="Auftragswert gesamt" value={eurCompact(total.auftragswert)} sub={`${bewertet} von ${shown.length} ${shown.length === 1 ? 'Projekt' : 'Projekten'} mit Auftragswert`} />
                <Tile label="Deckungsbeitrag" value={total.deckungsbeitrag === null ? '–' : eurCompact(total.deckungsbeitrag)} sub="laut Prognose Endkosten" ampel={margeAmpel(total.marge)} />
                <Tile label="Marge" value={pctOrDash(total.marge)} sub="Deckungsbeitrag ÷ Auftragswert" ampel={margeAmpel(total.marge)} />
                <Tile label="ROI" value={pctOrDash(total.roi)} sub="auf die prognostizierten Kosten" ampel={margeAmpel(total.roi)} />
              </div>
              {total.ohneAuftragswert > 0 && (
                <p className="kpi-note" role="note">
                  <Icon name="info" />
                  <span>
                    {total.ohneAuftragswert === 1 ? 'Bei einem Projekt' : `Bei ${total.ohneAuftragswert} Projekten`} ist kein Auftragswert hinterlegt.
                    {' '}Deckungsbeitrag, Marge und ROI des Portfolios rechnen nur mit den übrigen Projekten. Der Auftragswert lässt sich unter „Projekt bearbeiten“ nachtragen.
                  </span>
                </p>
              )}
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Projekt</th><th className="num">Auftragswert</th><th className="num">Prognose Endkosten</th><th className="num">Deckungsbeitrag</th><th className="num">Marge</th><th className="num">ROI</th><th>Bewertung</th></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.p.id}>
                        {link(r)}
                        <td className="num nowrap">{r.mk.auftragswert > 0 ? eur(r.mk.auftragswert) : '–'}</td>
                        <td className="num nowrap">{eur(r.mk.eac)}</td>
                        <td className="num nowrap">{r.mk.deckungsbeitrag === null ? '–' : signedEur(r.mk.deckungsbeitrag)}</td>
                        <td className="num">{pctOrDash(r.mk.marge)}</td>
                        <td className="num">{pctOrDash(r.mk.roi)}</td>
                        <td><AmpelBadge ampel={margeAmpel(r.mk.marge)}>{r.mk.marge === null ? 'Kein Auftragswert' : r.mk.marge >= 0.1 ? 'Rentabel' : r.mk.marge >= 0 ? 'Geringe Marge' : 'Verlust'}</AmpelBadge></td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Portfolio</td>
                      <td className="num nowrap">{eur(total.auftragswert)}</td><td className="num nowrap">{eur(total.eac)}</td><td className="num nowrap">{total.deckungsbeitrag === null ? '–' : signedEur(total.deckungsbeitrag)}</td>
                      <td className="num">{pctOrDash(total.marge)}</td><td className="num">{pctOrDash(total.roi)}</td><td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </Block>
          )}

          {kosten && (
            <Block nr={++nr} title="Budgetauslastung & Gesamtkostenabweichung" hint="Abweichung = Prognose Endkosten − Budget · Nachfinanzierung = Summe der Überschreitungen je Projekt">
              <div className="tiles inner">
                <Tile label="Budget gesamt" value={eurCompact(total.budget)} sub={`Ist ${eurCompact(total.istKosten)}`} />
                <Tile label="Budgetauslastung" value={pctOrDash(total.budgetauslastung)} sub="Ist-Kosten ÷ Budget" />
                <Tile label="Prognose Endkosten" value={eurCompact(total.eac)} sub={`${signedEur(total.kostenabweichung)} ggü. Budget`} ampel={total.kostenabweichung > total.budget * 0.1 ? 'rot' : total.kostenabweichung > total.budget * 0.02 ? 'gelb' : 'gruen'} />
                <Tile label="Nötige Nachfinanzierung" value={eurCompact(total.nachfinanzierung)} sub={`${shown.filter((r) => r.mk.nachfinanzierung > 0).length} Projekte über Budget`} ampel={total.nachfinanzierung > 0 ? 'rot' : 'gruen'} />
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Projekt</th><th className="num">Budget</th><th className="num">Ist</th><th style={{ minWidth: 150 }}>Auslastung</th><th className="num">Prognose Endkosten</th><th className="num">Abweichung</th><th className="num">Nachfinanzierung</th><th>Kosten</th></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.p.id}>
                        {link(r)}
                        <td className="num nowrap">{eur(r.mk.budget)}</td>
                        <td className="num nowrap">{eur(r.mk.istKosten)}</td>
                        <td>
                          <div className="dualbar" title={`Ist ${eur(r.mk.istKosten)} von ${eur(r.mk.budget)} Budget · Fortschritt ${pct(r.m.istPct)}`}>
                            <div className="dualbar-bars"><div className="meter ist"><i style={{ width: `${Math.min(100, (r.mk.budgetauslastung ?? 0) * 100)}%` }} /></div></div>
                            <span className="dualbar-nums single">{pctOrDash(r.mk.budgetauslastung)}</span>
                          </div>
                        </td>
                        <td className="num nowrap">{eur(r.mk.eac)}</td>
                        <td className="num nowrap">{signedEur(r.mk.kostenabweichung)}</td>
                        <td className="num nowrap">{r.mk.nachfinanzierung > 0 ? eur(r.mk.nachfinanzierung) : '–'}</td>
                        <td><AmpelBadge ampel={r.m.kostenAmpel} /></td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Portfolio</td>
                      <td className="num nowrap">{eur(total.budget)}</td><td className="num nowrap">{eur(total.istKosten)}</td><td className="num">{pctOrDash(total.budgetauslastung)}</td>
                      <td className="num nowrap">{eur(total.eac)}</td><td className="num nowrap">{signedEur(total.kostenabweichung)}</td><td className="num nowrap">{eur(total.nachfinanzierung)}</td><td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </Block>
          )}

          {(termine || kosten) && (
            <Block nr={++nr} title="Portfolio-Status & kritische Pfad-Abweichungen" hint="Ampelverteilung über alle Projekte · Verzug auf dem kritischen Pfad verschiebt das Projektende">
              <div className="grid-2 inner">
                {termine && <div><h3>Termin</h3><ShareBar label="Ampelverteilung Termin" segments={verteilung('terminAmpel')} /></div>}
                {kosten && <div><h3>Kosten</h3><ShareBar label="Ampelverteilung Kosten" segments={verteilung('kostenAmpel')} /></div>}
              </div>
              {termine && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Projekt</th><th className="num">Einträge krit. Pfad</th><th>Verzug kritischer Pfad</th><th>Verzug gesamt</th><th>Ende Soll</th><th>Prognose Ende</th></tr></thead>
                    <tbody>
                      {kritisch.map((r) => (
                        <tr key={r.p.id}>
                          {link(r)}
                          <td className="num">{r.mk.kritischeAufgaben || '–'}</td>
                          <td>{r.mk.kritischeAufgaben ? <AmpelBadge ampel={delayAmpel(r.mk.kritischerPfadVerzug)}>{days(r.mk.kritischerPfadVerzug)}</AmpelBadge> : <span className="muted">nicht festgelegt</span>}</td>
                          <td><AmpelBadge ampel={r.m.terminAmpel}>{r.m.terminAmpel === 'neutral' ? 'Offen' : days(r.m.delayDays)}</AmpelBadge></td>
                          <td className="nowrap">{date(r.p.ende_soll)}</td>
                          <td className="nowrap">{date(r.m.forecastEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Block>
          )}

          {zeigeRisiken && (
            <Block nr={++nr} title="Top-Risiken & Eskalationsbedarf" hint="Offene Risiken nach Eskalation und Risikowert (Wahrscheinlichkeit × Auswirkung, je 1–5)"
              action={eskaliert > 0 && <span className="badge eskalation"><Icon name="alert" size={14} />{eskaliert} {eskaliert === 1 ? 'Eskalation' : 'Eskalationen'} – Entscheidung nötig</span>}>
              {risiken.length === 0 ? <p className="empty">Keine offenen Risiken.</p> : (
                <div className="risk-layout">
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Risiko</th><th className="num" title="Wahrscheinlichkeit">W</th><th className="num" title="Auswirkung">A</th><th className="num">Wert</th><th>Stufe</th><th>Maßnahme</th></tr></thead>
                      <tbody>
                        {(alleRisiken ? risiken : risiken.slice(0, TOP)).map((r) => (
                          <tr key={r.id} className={r.eskalation ? 'eskaliert' : ''}>
                            <td>
                              <div className="strong">{r.titel}</div>
                              <div className="small"><button className="linklike muted" onClick={() => go({ page: 'projekt', id: r.project_id })}>{r.projekt}</button></div>
                              {!!r.eskalation && <span className="badge eskalation"><Icon name="alert" size={14} />Eskalation</span>}
                            </td>
                            <td className="num" title={`Wahrscheinlichkeit: ${SKALA[r.wahrscheinlichkeit - 1]}`}>{r.wahrscheinlichkeit}</td>
                            <td className="num" title={`Auswirkung: ${SKALA[r.auswirkung - 1]}`}>{r.auswirkung}</td>
                            <td className="num strong">{r.score}</td>
                            <td><AmpelBadge ampel={stufeAmpel[r.stufe]}>{stufeText[r.stufe]}</AmpelBadge></td>
                            <td className="wrap">{r.massnahme || <span className="muted">Keine Maßnahme hinterlegt</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {risiken.length > TOP && (
                      <button className="btn ghost more" onClick={() => setAlleRisiken(!alleRisiken)}>{alleRisiken ? `Nur die ${TOP} wichtigsten zeigen` : `Alle ${risiken.length} offenen Risiken zeigen`}</button>
                    )}
                  </div>
                  <RiskMatrix risiken={risiken} />
                </div>
              )}
            </Block>
          )}

          {zeigeKapazitaet && (
            <Block nr={++nr} title="Kapazitätsengpässe über Bereiche" hint="Geplante Stunden aller Projekte je Bereich und Monat im Verhältnis zur Bereichskapazität"
              action={(
                <div className="actions">
                  {engpaesse > 0 && <span className="badge eskalation"><Icon name="alert" size={14} />{engpaesse} {engpaesse === 1 ? 'Engpass' : 'Engpässe'}</span>}
                  {can('ressourcen.bearbeiten') && can('projekte.alle') && <button className="btn" onClick={() => openForm(bereichForm())}><Icon name="plus" />Bereich</button>}
                </div>
              )}>
              {kap.zeilen.length === 0 ? <p className="empty">Noch keine Bereiche oder Aufwände erfasst.</p> : <Heatmap kap={kap} />}
            </Block>
          )}

          {zeigeNps && (
            <Block nr={++nr} title="Kundenzufriedenheit (NPS)" hint="Net Promoter Score = Anteil Promotoren (9–10) − Anteil Detraktoren (0–6), Skala −100 bis +100">
              {gesamtNps.anzahl === 0 ? <p className="empty">Noch keine Kundenbewertungen vorhanden.</p> : (
                <>
                  <div className="nps-summary">
                    <div className="nps-score">
                      <div className="tile-value">{signedNps(gesamtNps.nps)}</div>
                      <AmpelBadge ampel={npsAmpel(gesamtNps.nps)}>{gesamtNps.nps! >= 30 ? 'Gut' : gesamtNps.nps! >= 0 ? 'Ausbaufähig' : 'Kritisch'}</AmpelBadge>
                      <div className="muted small">{gesamtNps.anzahl} {gesamtNps.anzahl === 1 ? 'Bewertung' : 'Bewertungen'} · Ø {score1(gesamtNps.mittelwert)} von 10</div>
                    </div>
                    <NpsBar n={gesamtNps} />
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Projekt</th><th className="num">NPS</th><th className="num">Bewertungen</th><th className="num">Ø Bewertung</th><th className="num">Promotoren</th><th className="num">Passive</th><th className="num">Detraktoren</th></tr></thead>
                      <tbody>
                        {shown.map((r) => ({ r, n: nps(r.feedback) })).filter((x) => x.n.anzahl > 0).sort((a, b) => a.n.nps! - b.n.nps!).map(({ r, n }) => (
                          <tr key={r.p.id}>
                            {link(r)}
                            <td className="num"><AmpelBadge ampel={npsAmpel(n.nps)}>{signedNps(n.nps)}</AmpelBadge></td>
                            <td className="num">{n.anzahl}</td>
                            <td className="num">{score1(n.mittelwert)}</td>
                            <td className="num">{n.promotoren}</td>
                            <td className="num">{n.passive}</td>
                            <td className="num">{n.detraktoren}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Block>
          )}

          {nr === 0 && <p className="empty">Für die Management-Kennzahlen fehlen Ihrer Rolle die Ansehen-Rechte der zugrunde liegenden Daten.</p>}
        </>
      )}
    </>
  );
}
