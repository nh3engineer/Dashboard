import type { ReactNode } from 'react';
import type { Ampel } from '../../types';
import { AmpelBadge, Icon } from '../ui';

/** Abschnitt mit Kennzeichnung der Zielgruppe; `management` ist optisch abgesetzt. */
export function KpiSection({ title, hint, management, action, children }: { title: string; hint?: string; management?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`kpi-section ${management ? 'management' : ''}`} aria-label={title}>
      <div className="kpi-section-head">
        <span className="kpi-section-icon"><Icon name={management ? 'shield' : 'target'} size={18} /></span>
        <div>
          <h2>{title} <span className="kpi-tag">{management ? 'Management' : 'Projektteam'}</span></h2>
          {hint && <p className="muted small">{hint}</p>}
        </div>
        {action && <div className="kpi-section-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export type Fact = [label: string, value: ReactNode] | false | null | undefined;

/** Kennzahl-Karte: Wert, Ampel (Icon + Text), Formel-Hinweis und Detailzeilen. */
export function KpiCard({ icon, title, value, unit, ampel, status, formula, facts, children }: {
  icon: string; title: string; value: ReactNode; unit?: ReactNode; ampel?: Ampel; status?: ReactNode; formula?: ReactNode; facts?: Fact[]; children?: ReactNode;
}) {
  const rows = (facts ?? []).filter(Boolean) as [string, ReactNode][];
  return (
    <article className="kpi-card">
      <header>
        <span className="kpi-title"><Icon name={icon} />{title}</span>
        {ampel && <AmpelBadge ampel={ampel}>{status}</AmpelBadge>}
      </header>
      <div className="kpi-value">{value}{unit && <small>{unit}</small>}</div>
      {formula && <p className="kpi-formula">{formula}</p>}
      {children}
      {rows.length > 0 && (
        <dl className="kpi-facts">
          {rows.map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
    </article>
  );
}

/** Soll-/Ist-Balkenpaar mit gemeinsamer Skala. */
export function SollIstBars({ soll, ist, max, title }: { soll: number; ist: number; max?: number; title?: string }) {
  const top = Math.max(1e-9, max ?? Math.max(soll, ist));
  const w = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  return (
    <div className="dualbar-bars" title={title}>
      <div className="meter soll"><i style={{ width: w(soll) }} /></div>
      <div className="meter ist"><i style={{ width: w(ist) }} /></div>
    </div>
  );
}

export interface Segment { key: string; label: string; value: number; icon?: string }

/** Gestapelter Anteilsbalken mit Legende (Anzahl je Segment direkt beschriftet). */
export function ShareBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className="sharebar" role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
      <div className="sharebar-track">
        {total === 0 ? <i className="seg seg-leer" style={{ flexGrow: 1 }} /> : segments.filter((s) => s.value > 0).map((s) => (
          <i key={s.key} className={`seg seg-${s.key}`} style={{ flexGrow: s.value }} title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)} %)`} />
        ))}
      </div>
      <div className="sharebar-legend">
        {segments.map((s) => (
          <span key={s.key} className={`seg-label seg-${s.key}`}>
            {s.icon ? <Icon name={s.icon} size={14} /> : <i className="swatch" />}
            {s.label} <b>{s.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
