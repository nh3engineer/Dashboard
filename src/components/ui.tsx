import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Ampel, Status } from '../types';
import { pct } from '../format';

const paths: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: <path d="M12 4l9 16H3L12 4zm0 6v5m0 2.5v.5" />,
  alert: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 5v5m0 3v.5" />,
  circle: <circle cx="12" cy="12" r="7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  trash: <path d="M5 7h14M10 7V4h4v3m-7 0l1 13h8l1-13M10 11v6m4-6v6" />,
  back: <path d="M15 5l-7 7 7 7" />,
  sun: <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6L7 7m10 10l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />,
  moon: <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />,
  download: <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />,
  upload: <path d="M12 16V5m0 0L8 9m4-4l4 4M5 20h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const ampelIcon: Record<Ampel, string> = { gruen: 'check', gelb: 'warn', rot: 'alert', neutral: 'circle' };
const ampelText: Record<Ampel, string> = { gruen: 'Im Plan', gelb: 'Achtung', rot: 'Kritisch', neutral: 'Offen' };

/** Status immer als Icon + Text, nie nur Farbe. */
export function AmpelBadge({ ampel, children }: { ampel: Ampel; children?: ReactNode }) {
  return (
    <span className={`badge ampel-${ampel}`}>
      <Icon name={ampelIcon[ampel]} size={14} />
      {children ?? ampelText[ampel]}
    </span>
  );
}

const statusLabel: Record<Status, string> = { geplant: 'Geplant', laufend: 'Laufend', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen' };
export const STATUS_OPTIONS = Object.entries(statusLabel).map(([value, label]) => ({ value, label }));

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge status-${status}`}>{statusLabel[status]}</span>;
}

export function Tile({ label, value, sub, ampel }: { label: string; value: ReactNode; sub?: ReactNode; ampel?: Ampel }) {
  return (
    <div className={`tile ${ampel ? `tile-${ampel}` : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend" aria-label="Legende">
      <span><i className="swatch soll" />Soll</span>
      <span><i className="swatch ist" />Ist</span>
    </div>
  );
}

/** Zwei dünne Balken übereinander: Soll- und Ist-Fortschritt. */
export function DualBar({ soll, ist }: { soll: number; ist: number }) {
  return (
    <div className="dualbar" title={`Soll ${pct(soll)} · Ist ${pct(ist)}`}>
      <div className="dualbar-bars">
        <div className="meter soll"><i style={{ width: `${soll * 100}%` }} /></div>
        <div className="meter ist"><i style={{ width: `${ist * 100}%` }} /></div>
      </div>
      <div className="dualbar-nums">
        <span>{pct(soll)}</span>
        <span>{pct(ist)}</span>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  suggestions?: string[];
  required?: boolean;
  wide?: boolean;
  hidden?: (values: Record<string, unknown>) => boolean;
}

type Values = Record<string, unknown>;

export function FormModal({ title, fields, initial, onSave, onClose }: { title: string; fields: Field[]; initial: Values; onSave: (v: Values) => Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: string, v: unknown) => setValues((old) => ({ ...old, [key]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(values);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          {fields.filter((f) => !f.hidden?.(values)).map((f, i) => {
            const v = (values[f.key] ?? '') as string | number;
            const common = { id: `f-${f.key}`, required: f.required, autoFocus: i === 0 };
            return (
              <label key={f.key} className={f.wide ? 'wide' : ''} htmlFor={common.id}>
                <span>{f.label}{f.required && ' *'}</span>
                {f.type === 'select' ? (
                  <select {...common} value={v} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea {...common} rows={3} value={v} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <>
                    <input {...common} type={f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined} value={v} list={f.suggestions ? `l-${f.key}` : undefined}
                      onChange={(e) => set(f.key, e.target.value)} />
                    {f.suggestions && <datalist id={`l-${f.key}`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
                  </>
                )}
              </label>
            );
          })}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}
