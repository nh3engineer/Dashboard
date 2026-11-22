import { useState, type MouseEvent } from 'react';
import { toDay, todayIso } from '../calc';
import { date, month } from '../format';
import { Icon } from './ui';
import '../styles/kpi.css';

export interface GanttRow {
  id: number;
  label: string;
  sub?: string;
  sollStart: string;
  sollEnd: string;
  istStart?: string | null;
  /** null bei begonnener Aufgabe = läuft noch (Balken bis heute) */
  istEnd?: string | null;
  milestone?: boolean;
  /** Ist-Fortschritt 0..100 */
  pct: number;
  /** liegt auf dem kritischen Pfad – Kennzeichnung über Marke am Namen und Kontur, nicht über Farbe allein */
  critical?: boolean;
}

const DAY = 86400000;

export function Gantt({ rows, onRowClick }: { rows: GanttRow[]; onRowClick?: (id: number) => void }) {
  const [tip, setTip] = useState<{ row: GanttRow; x: number; y: number } | null>(null);
  if (!rows.length) return <p className="empty">Noch keine Termine erfasst.</p>;

  const today = toDay(todayIso());
  const all = rows.flatMap((r) => [r.sollStart, r.sollEnd, r.istStart, r.istEnd].filter(Boolean).map((d) => toDay(d!)));
  const lo = Math.min(...all, today);
  const hi = Math.max(...all, today);
  const pad = Math.max(3, Math.round((hi - lo) * 0.03));
  const min = lo - pad;
  const span = hi + pad - min;
  const x = (day: number) => ((day - min) / span) * 100;

  // Monatsraster; bei langen Zeiträumen nur jeden n-ten Monat beschriften
  const months: number[] = [];
  const d0 = new Date(min * DAY);
  for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1; ; m++) {
    const day = Math.round(Date.UTC(y, m, 1) / DAY);
    if (day > min + span) break;
    months.push(day);
  }
  const step = Math.ceil(months.length / 7);

  const move = (row: GanttRow) => (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    setTip({ row, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div className="gantt">
      <div className="gantt-labels">
        <div className="gantt-head" />
        {rows.map((r) => (
          <div key={r.id} className={`gantt-label ${onRowClick ? 'clickable' : ''}`} onClick={() => onRowClick?.(r.id)}>
            <span className="gantt-name" title={r.critical ? `${r.label} – kritischer Pfad` : r.label}>
              {r.critical && <span className="kp-mark" aria-label="Kritischer Pfad"><Icon name="flag" size={12} />KP</span>}
              {r.label}
            </span>
            {r.sub && <span className="gantt-sub">{r.sub}</span>}
          </div>
        ))}
      </div>
      <div className="gantt-scroll">
        <div className="gantt-track" onMouseLeave={() => setTip(null)}>
          <div className="gantt-head">
            {months.map((m, i) => i % step === 0 && <span key={m} style={{ left: `${x(m)}%` }}>{month(m)}</span>)}
          </div>
          {months.map((m) => <i key={m} className="gantt-grid" style={{ left: `${x(m)}%` }} />)}
          <i className="gantt-today" style={{ left: `${x(today)}%` }}><b>Heute</b></i>
          {rows.map((r) => {
            const s = toDay(r.sollStart);
            const e = toDay(r.sollEnd);
            const is = r.istStart ? toDay(r.istStart) : null;
            const ie = r.istEnd ? toDay(r.istEnd) : is !== null ? Math.max(today, is) : null;
            return (
              <div key={r.id} className={`gantt-row ${r.critical ? 'critical' : ''}`} onMouseMove={move(r)}>
                {r.milestone ? (
                  <>
                    <i className="gantt-ms soll" style={{ left: `${x(e)}%` }} />
                    {r.istEnd && <i className="gantt-ms ist" style={{ left: `${x(toDay(r.istEnd))}%` }} />}
                  </>
                ) : (
                  <>
                    <i className="gantt-bar soll" style={{ left: `${x(s)}%`, width: `${Math.max(0.4, x(e) - x(s))}%` }} />
                    {is !== null && ie !== null && (
                      <i className={`gantt-bar ist ${r.istEnd ? '' : 'running'}`} style={{ left: `${x(is)}%`, width: `${Math.max(0.4, x(ie) - x(is))}%` }} />
                    )}
                  </>
                )}
              </div>
            );
          })}
          {tip && (
            <div className="tooltip" style={{ left: tip.x, top: tip.y }} data-flip={tip.x > 320 ? '' : undefined}>
              <strong>{tip.row.label}</strong>
              {tip.row.critical && <div><Icon name="flag" size={12} />Kritischer Pfad</div>}
              {tip.row.milestone ? (
                <>
                  <div><i className="swatch soll" />Soll <b>{date(tip.row.sollEnd)}</b></div>
                  <div><i className="swatch ist" />Ist <b>{tip.row.istEnd ? date(tip.row.istEnd) : 'offen'}</b></div>
                </>
              ) : (
                <>
                  <div><i className="swatch soll" />Soll <b>{date(tip.row.sollStart)} – {date(tip.row.sollEnd)}</b></div>
                  <div><i className="swatch ist" />Ist <b>{tip.row.istStart ? `${date(tip.row.istStart)} – ${tip.row.istEnd ? date(tip.row.istEnd) : 'läuft'}` : 'nicht begonnen'}</b></div>
                  <div className="muted">Fortschritt {Math.round(tip.row.pct)} %</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="gantt-pct">
        <div className="gantt-head" />
        {rows.map((r) => <div key={r.id} className="gantt-label num">{r.milestone ? (r.pct >= 100 ? '✓' : '') : `${Math.round(r.pct)} %`}</div>)}
      </div>
    </div>
  );
}

