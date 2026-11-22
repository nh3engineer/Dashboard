// Reiter der Projektansicht für Ressourcen, Änderungen, Qualität, Risiken und Feedback.
import { useState, type ReactNode } from 'react';
import { useApp } from '../../app-context';
import { todayIso } from '../../calc';
import { date, signedEur } from '../../format';
import { aenderungForm, aufwandForm, CR_STATUS, feedbackForm, MANGEL_SCHWERE, MANGEL_STATUS, mangelForm, risikoForm, SKALA } from '../../forms';
import { nps, risikoStufe } from '../../kpi';
import type { Ampel, Aufwand, Table } from '../../types';
import { AmpelBadge, Icon, Legend, Tile } from '../ui';
import { NpsBar } from './Nps';
import { hours, monthLabel, npsAmpel, score1, signedHours, signedNps, stufeAmpel, stufeText, tageText, type ProjectRow } from './util';

function RowActions({ table, id, what, onEdit }: { table: Table; id: number; what: string; onEdit: () => void }) {
  const { remove } = useApp();
  return (
    <td className="row-actions">
      <button className="btn ghost icon-btn" onClick={onEdit} aria-label={`${what} bearbeiten`} title="Bearbeiten"><Icon name="edit" /></button>
      <button className="btn ghost icon-btn" onClick={() => remove(table, id, `„${what}“`)} aria-label={`${what} löschen`} title="Löschen"><Icon name="trash" /></button>
    </td>
  );
}

function ListCard({ title, action, legend, empty, children }: { title: string; action?: ReactNode; legend?: ReactNode; empty?: string | false; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2><div className="actions">{legend}{action}</div></div>
      {empty ? <p className="empty">{empty}</p> : children}
    </section>
  );
}

/* ---------- Ressourcen ---------- */

export function RessourcenTab({ row }: { row: ProjectRow }) {
  const { data, can, openForm } = useApp();
  const edit = can('ressourcen.bearbeiten');
  const { p, aufwand, k } = row;
  const monate = [...new Set(aufwand.map((a) => a.monat))].sort();
  const bereiche = [...new Set(aufwand.map((a) => a.bereich))].sort((a, b) => a.localeCompare(b));
  const aktuell = todayIso().slice(0, 7);
  const sum = (rows: Aufwand[]) => rows.reduce((a, r) => ({ soll: a.soll + r.stunden_soll, ist: a.ist + r.stunden_ist }), { soll: 0, ist: 0 });
  const cell = (rows: Aufwand[], key: string, strong = false) => {
    const s = sum(rows);
    return (
      <td key={key} className={`num pair ${strong ? 'strong' : ''}`} title={`Soll ${hours(s.soll)} · Ist ${hours(s.ist)} · Abweichung ${signedHours(s.ist - s.soll)}`}>
        {rows.length ? <><span>{hours(s.soll)}</span><span className="pair-ist">{hours(s.ist)}</span></> : <span className="muted">–</span>}
      </td>
    );
  };
  const add = <button className="btn primary" onClick={() => openForm(aufwandForm(p.id, data))}><Icon name="plus" />Aufwand</button>;
  const sorted = [...aufwand].sort((a, b) => b.monat.localeCompare(a.monat) || a.bereich.localeCompare(b.bereich));

  return (
    <>
      <div className="tiles">
        <Tile label="Stunden Ist" value={hours(k.stundenIst)} sub={`Soll bis heute ${hours(k.stundenSoll)}`} />
        <Tile label="Abweichung bis heute" value={signedHours(k.stundenIst - k.stundenSoll)} sub={k.aufwandAbw === null ? 'Kein Soll bis heute' : 'Ist gegenüber Soll'} />
        <Tile label="Soll gesamt" value={hours(k.stundenSollGesamt)} sub={`${bereiche.length} ${bereiche.length === 1 ? 'Bereich' : 'Bereiche'} · ${monate.length} ${monate.length === 1 ? 'Monat' : 'Monate'}`} />
      </div>
      <ListCard title="Stunden je Bereich und Monat" legend={<Legend />} action={edit && add} empty={!aufwand.length && 'Noch kein Aufwand erfasst.'}>
        <div className="table-wrap">
          <table className="table compact pivot">
            <thead>
              <tr>
                <th>Bereich</th>
                {monate.map((mo) => <th key={mo} className="num" aria-current={mo === aktuell ? 'date' : undefined}>{monthLabel(mo)}{mo === aktuell && <span className="now-mark"> · heute</span>}</th>)}
                <th className="num">Summe</th>
              </tr>
            </thead>
            <tbody>
              {bereiche.map((b) => {
                const own = aufwand.filter((a) => a.bereich === b);
                return (
                  <tr key={b}>
                    <td className="strong">{b}</td>
                    {monate.map((mo) => cell(own.filter((a) => a.monat === mo), mo))}
                    {cell(own, 'sum', true)}
                  </tr>
                );
              })}
              <tr className="total">
                <td>Summe</td>
                {monate.map((mo) => cell(aufwand.filter((a) => a.monat === mo), mo))}
                {cell(aufwand, 'sum')}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small table-note">Je Zelle: oben Soll, darunter Ist (Stunden).</p>
      </ListCard>
      {edit && aufwand.length > 0 && (
        <ListCard title="Einträge pflegen">
          <div className="table-wrap scroll-y">
            <table className="table">
              <thead><tr><th>Monat</th><th>Bereich</th><th className="num">Soll</th><th className="num">Ist</th><th className="num">Abweichung</th><th /></tr></thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{monthLabel(a.monat)}</td>
                    <td>{a.bereich}</td>
                    <td className="num">{hours(a.stunden_soll)}</td>
                    <td className="num">{hours(a.stunden_ist)}</td>
                    <td className="num">{signedHours(a.stunden_ist - a.stunden_soll)}</td>
                    <RowActions table="aufwand" id={a.id} what={`${a.bereich} ${monthLabel(a.monat)}`} onEdit={() => openForm(aufwandForm(p.id, data, a))} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListCard>
      )}
    </>
  );
}

/* ---------- Änderungen ---------- */

const crAmpel: Record<keyof typeof CR_STATUS, Ampel> = { offen: 'gelb', genehmigt: 'gruen', abgelehnt: 'neutral' };

export function AenderungenTab({ row }: { row: ProjectRow }) {
  const { can, openForm } = useApp();
  const edit = can('aenderungen.bearbeiten');
  // Ohne kosten.ansehen liefert der Server das Feld `kosten` nicht – Spalte dann weglassen
  const kosten = can('kosten.ansehen');
  const { p, aenderungen, k } = row;
  const sorted = [...aenderungen].sort((a, b) => b.datum.localeCompare(a.datum));

  return (
    <>
      <div className="tiles">
        <Tile label="Änderungen" value={k.crGesamt} sub={`${k.crGenehmigt} genehmigt`} />
        <Tile label="Offen" value={k.crOffen} sub="Entscheidung ausständig" ampel={k.crOffen ? 'gelb' : undefined} />
        {kosten && <Tile label="Genehmigte Mehrkosten" value={signedEur(k.crKosten)} sub={k.aenderungsquote === null ? undefined : `${(k.aenderungsquote * 100).toLocaleString('de-AT', { maximumFractionDigits: 1 })} % des Budgets`} />}
        <Tile label="Terminauswirkung" value={tageText(k.crTage)} sub="aus genehmigten Änderungen" />
      </div>
      <ListCard title="Änderungen (Change Requests)" empty={!sorted.length && 'Noch keine Änderungen erfasst.'}
        action={edit && <button className="btn primary" onClick={() => openForm(aenderungForm(p.id, can))}><Icon name="plus" />Änderung</button>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Datum</th><th>Änderung</th><th>Status</th>{kosten && <th className="num">Mehrkosten</th>}<th className="num">Termin</th>{edit && <th />}</tr></thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">{date(c.datum)}</td>
                  <td><div className="strong">{c.titel}</div>{c.beschreibung && <div className="muted small wrap">{c.beschreibung}</div>}</td>
                  <td><AmpelBadge ampel={crAmpel[c.status]}>{CR_STATUS[c.status]}</AmpelBadge></td>
                  {kosten && <td className="num nowrap">{c.kosten === undefined ? '–' : signedEur(c.kosten)}</td>}
                  <td className="num nowrap">{c.tage ? tageText(c.tage) : '–'}</td>
                  {edit && <RowActions table="aenderungen" id={c.id} what={c.titel} onEdit={() => openForm(aenderungForm(p.id, can, c))} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListCard>
    </>
  );
}

/* ---------- Qualität ---------- */

const schwereAmpel: Record<keyof typeof MANGEL_SCHWERE, Ampel> = { gering: 'neutral', mittel: 'gelb', kritisch: 'rot' };

export function QualitaetTab({ row }: { row: ProjectRow }) {
  const { can, openForm } = useApp();
  const edit = can('qualitaet.bearbeiten');
  const { p, maengel, k } = row;
  // Offene zuerst, darin die schwersten oben
  const rang = { kritisch: 0, mittel: 1, gering: 2 };
  const sorted = [...maengel].sort((a, b) => a.status.localeCompare(b.status) * -1 || rang[a.schwere] - rang[b.schwere] || b.datum.localeCompare(a.datum));

  return (
    <>
      <div className="tiles">
        <Tile label="Offene Mängel" value={k.maengelOffen} sub={`von ${k.maengelGesamt} gesamt`} ampel={k.maengelGesamt ? (k.maengelOffen ? 'gelb' : 'gruen') : undefined} />
        <Tile label="Davon kritisch" value={k.maengelKritischOffen} sub="offen und kritisch" ampel={k.maengelKritischOffen ? 'rot' : undefined} />
        <Tile label="Nacharbeit" value={hours(k.nacharbeitStunden)} sub="Aufwand für Mängelbehebung" />
        <Tile label="Behebungsquote" value={k.behebungsquote === null ? '–' : `${Math.round(k.behebungsquote * 100)} %`} sub={`${k.maengelGesamt - k.maengelOffen} behoben`} />
      </div>
      <ListCard title="Mängel" empty={!sorted.length && 'Keine Mängel erfasst.'}
        action={edit && <button className="btn primary" onClick={() => openForm(mangelForm(p.id))}><Icon name="plus" />Mangel</button>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Festgestellt</th><th>Mangel</th><th>Schwere</th><th>Status</th><th className="num">Nacharbeit</th>{edit && <th />}</tr></thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.id}>
                  <td className="nowrap">{date(x.datum)}</td>
                  <td className="strong">{x.titel}</td>
                  <td><AmpelBadge ampel={schwereAmpel[x.schwere]}>{MANGEL_SCHWERE[x.schwere]}</AmpelBadge></td>
                  <td><AmpelBadge ampel={x.status === 'behoben' ? 'gruen' : 'neutral'}>{MANGEL_STATUS[x.status]}</AmpelBadge></td>
                  <td className="num">{hours(x.nacharbeit_stunden)}</td>
                  {edit && <RowActions table="maengel" id={x.id} what={x.titel} onEdit={() => openForm(mangelForm(p.id, x))} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListCard>
    </>
  );
}

/* ---------- Risiken ---------- */

export function RisikenTab({ row }: { row: ProjectRow }) {
  const { can, openForm } = useApp();
  const edit = can('risiken.bearbeiten');
  const { p, risiken } = row;
  const scored = risiken.map((r) => ({ ...r, score: r.wahrscheinlichkeit * r.auswirkung }))
    .sort((a, b) => a.status.localeCompare(b.status) * -1 || b.eskalation - a.eskalation || b.score - a.score);
  const offen = scored.filter((r) => r.status === 'offen');
  const hoch = offen.filter((r) => risikoStufe(r.score) === 'hoch').length;
  const eskaliert = offen.filter((r) => r.eskalation).length;

  return (
    <>
      <div className="tiles">
        <Tile label="Offene Risiken" value={offen.length} sub={`von ${risiken.length} gesamt`} />
        <Tile label="Hohe Risiken" value={hoch} sub="Risikowert ab 15" ampel={hoch ? 'rot' : undefined} />
        <Tile label="Eskalationen" value={eskaliert} sub="Entscheidung des Managements nötig" ampel={eskaliert ? 'rot' : undefined} />
      </div>
      <ListCard title="Risiken" empty={!scored.length && 'Keine Risiken erfasst.'}
        legend={<span className="muted small">Risikowert = Wahrscheinlichkeit × Auswirkung (je 1–5)</span>}
        action={edit && <button className="btn primary" onClick={() => openForm(risikoForm(p.id))}><Icon name="plus" />Risiko</button>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Risiko</th><th className="num" title="Wahrscheinlichkeit">W</th><th className="num" title="Auswirkung">A</th><th className="num">Risikowert</th><th>Stufe</th><th>Status</th>{edit && <th />}</tr></thead>
            <tbody>
              {scored.map((r) => {
                const stufe = risikoStufe(r.score);
                return (
                  <tr key={r.id} className={r.status === 'geschlossen' ? 'closed' : r.eskalation ? 'eskaliert' : ''}>
                    <td>
                      <div className="strong">{r.titel}</div>
                      {r.massnahme && <div className="muted small wrap">Maßnahme: {r.massnahme}</div>}
                    </td>
                    <td className="num" title={`Wahrscheinlichkeit: ${SKALA[r.wahrscheinlichkeit - 1]}`}>{r.wahrscheinlichkeit}</td>
                    <td className="num" title={`Auswirkung: ${SKALA[r.auswirkung - 1]}`}>{r.auswirkung}</td>
                    <td className="num strong">{r.score}</td>
                    <td><AmpelBadge ampel={stufeAmpel[stufe]}>{stufeText[stufe]}</AmpelBadge></td>
                    <td className="nowrap">
                      {r.status === 'geschlossen' ? <span className="badge">Geschlossen</span> : r.eskalation ? <span className="badge eskalation"><Icon name="alert" size={14} />Eskalation</span> : <span className="badge">Offen</span>}
                    </td>
                    {edit && <RowActions table="risiken" id={r.id} what={r.titel} onEdit={() => openForm(risikoForm(p.id, r))} />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ListCard>
    </>
  );
}

/* ---------- Feedback ---------- */

export function FeedbackTab({ row }: { row: ProjectRow }) {
  const { me, can, openForm } = useApp();
  const [sent, setSent] = useState(false);
  const sehen = can('feedback.ansehen');
  const edit = can('feedback.bearbeiten');
  const abgeben = can('feedback.abgeben') || edit;
  const { p, feedback } = row;
  const n = nps(feedback);
  const sorted = [...feedback].sort((a, b) => b.datum.localeCompare(a.datum));
  const button = abgeben && <button className="btn primary" onClick={() => openForm(feedbackForm(p.id, me.name, undefined, () => setSent(true), edit))}><Icon name="star" />Bewertung abgeben</button>;

  return (
    <>
      {sent && <div className="banner ok" role="status"><span><Icon name="check" />Vielen Dank – Ihre Bewertung wurde gespeichert.</span></div>}
      {!sehen ? (
        <section className="card feedback-invite">
          <span className="notice-icon"><Icon name="star" size={22} /></span>
          <h2>Wie zufrieden sind Sie mit diesem Projekt?</h2>
          <p className="muted">Wie wahrscheinlich ist es, dass Sie uns weiterempfehlen? Bewerten Sie auf einer Skala von 0 (keinesfalls) bis 10 (auf jeden Fall) – gern mit Kommentar.</p>
          {button}
        </section>
      ) : (
        <>
          <div className="tiles">
            <Tile label="NPS dieses Projekts" value={signedNps(n.nps)} sub="Skala −100 bis +100" ampel={n.nps === null ? undefined : npsAmpel(n.nps)} />
            <Tile label="Bewertungen" value={n.anzahl} sub={`Ø ${score1(n.mittelwert)} von 10`} />
            <div className="tile">
              <div className="tile-label">Verteilung</div>
              <NpsBar n={n} />
            </div>
          </div>
          <ListCard title="Bewertungen" action={button} empty={!sorted.length && 'Noch keine Bewertungen vorhanden.'}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Datum</th><th className="num">Bewertung</th><th>Gruppe</th><th>Von</th><th>Kommentar</th>{edit && <th />}</tr></thead>
                <tbody>
                  {sorted.map((f) => (
                    <tr key={f.id}>
                      <td className="nowrap">{date(f.datum)}</td>
                      <td className="num strong">{f.score} / 10</td>
                      <td><span className="badge">{f.score >= 9 ? 'Promotor' : f.score >= 7 ? 'Passiv' : 'Detraktor'}</span></td>
                      <td>{f.von || '–'}</td>
                      <td className="wrap">{f.kommentar || <span className="muted">–</span>}</td>
                      {edit && <RowActions table="feedback" id={f.id} what={`Bewertung vom ${date(f.datum)}`} onEdit={() => openForm(feedbackForm(p.id, me.name, f))} />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ListCard>
        </>
      )}
    </>
  );
}

