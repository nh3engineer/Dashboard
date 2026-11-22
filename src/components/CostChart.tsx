import { useEffect, useRef, useState } from 'react';
import { costCurve, fromDay, toDay, todayIso } from '../calc';
import { date, eur, eurCompact, month, num, signedEur } from '../format';
import type { Cost } from '../types';
import { Legend } from './ui';

function niceStep(max: number, ticks: number) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Kumulierte Soll-/Ist-Kosten über die Zeit mit Budgetlinie. */
export function CostChart({ costs, budget }: { costs: Cost[]; budget: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = costCurve(costs);
  if (pts.length < 2) return <p className="empty">Noch keine Kosten erfasst.</p>;

  const H = 280;
  const m = { t: 16, r: 20, b: 28, l: 64 };
  const iw = Math.max(100, width - m.l - m.r);
  const ih = H - m.t - m.b;
  const today = toDay(todayIso());
  const d0 = pts[0].day;
  const d1 = pts[pts.length - 1].day;
  const maxVal = Math.max(budget, ...pts.map((p) => Math.max(p.soll, p.ist ?? 0)));
  const step = niceStep(maxVal * 1.05, 4);
  const yMax = Math.ceil((maxVal * 1.05) / step) * step;
  const x = (day: number) => m.l + ((day - d0) / (d1 - d0)) * iw;
  const y = (v: number) => m.t + ih - (v / yMax) * ih;

  const line = (key: 'soll' | 'ist') =>
    pts.filter((p) => p[key] !== null).map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p[key]!).toFixed(1)}`).join('');
  const istPts = pts.filter((p) => p.ist !== null);
  const lastIst = istPts[istPts.length - 1];
  const lastSoll = pts[pts.length - 1];

  // Monatsanfänge als X-Ticks, ausgedünnt nach verfügbarer Breite
  const ticks = pts.filter((p) => new Date(p.day * 86400000).getUTCDate() !== 1 || p === pts[0]).map((p) => p.day);
  const monthStarts = [...new Set(ticks.map((d) => { const dt = new Date(d * 86400000); return Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1) / 86400000); }))].filter((d) => d >= d0);
  const every = Math.ceil(monthStarts.length / Math.max(2, Math.floor(iw / 64)));

  const hp = hover === null ? null : pts[hover];
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const day = d0 + ((e.clientX - box.left) / box.width) * (d1 - d0);
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.day - day) < Math.abs(pts[best].day - day)) best = i; });
    setHover(best);
  };

  return (
    <div className="chart" ref={wrap}>
      <Legend />
      <svg width={width} height={H} role="img" aria-label="Kumulierte Kosten: Soll und Ist über die Zeit">
        {Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'axis' : 'grid'} x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            <text className="tick" x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end">{num(v)}</text>
          </g>
        ))}
        {monthStarts.map((d, i) => i % every === 0 && <text key={d} className="tick" x={x(d)} y={H - 8} textAnchor="start">{month(d)}</text>)}

        {budget > 0 && (
          <g>
            <line className="budget-line" x1={m.l} x2={m.l + iw} y1={y(budget)} y2={y(budget)} />
            <text className="tick strong" x={m.l + 6} y={y(budget) - 6}>Budget {eurCompact(budget)}</text>
          </g>
        )}
        {today > d0 && today < d1 && (
          <g>
            <line className="today-line" x1={x(today)} x2={x(today)} y1={m.t} y2={m.t + ih} />
            <text className="tick" x={x(today) + 5} y={m.t + ih - 6}>Heute</text>
          </g>
        )}

        <path className="line soll" d={line('soll')} />
        {istPts.length > 1 && <path className="line ist" d={line('ist')} />}
        <circle className="dot soll" cx={x(lastSoll.day)} cy={y(lastSoll.soll)} r="4.5" />
        {lastIst && <circle className="dot ist" cx={x(lastIst.day)} cy={y(lastIst.ist!)} r="4.5" />}

        {hp && (
          <g pointerEvents="none">
            <line className="crosshair" x1={x(hp.day)} x2={x(hp.day)} y1={m.t} y2={m.t + ih} />
            <circle className="dot soll" cx={x(hp.day)} cy={y(hp.soll)} r="4.5" />
            {hp.ist !== null && <circle className="dot ist" cx={x(hp.day)} cy={y(hp.ist)} r="4.5" />}
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: x(hp.day), top: m.t + 28 }} data-flip={x(hp.day) > width / 2 ? '' : undefined}>
          <strong>{date(fromDay(hp.day))}</strong>
          <div><i className="swatch soll" />Soll <b>{eur(hp.soll)}</b></div>
          {hp.ist !== null && (
            <>
              <div><i className="swatch ist" />Ist <b>{eur(hp.ist)}</b></div>
              <div className="muted">Abweichung {signedEur(hp.ist - hp.soll)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
