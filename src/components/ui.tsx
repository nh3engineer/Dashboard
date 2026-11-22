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
  user: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />,
  users: <path d="M9 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-6 7c0-2.8 2.7-4.5 6-4.5s6 1.700 6 4.500M16 5.200a3.500 3.500 0 010 6.600M17.500 14.800c2.100.500 3.500 2 3.500 4.200" />,
  lock: <path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" />,
  key: <path d="M15 7a4 4 0 11-3.500 6H9v2H7v2H4v-3l5.200-5.200A4 4 0 0115 7zm.500 3.500v.010" />,
  logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  file: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  shield: <path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6l7-3zM9 12l2 2 4-4" />,
  chart: <path d="M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  undo: <path d="M9 6L5 10l4 4M5 10h9a5 5 0 010 10h-3" />,
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
  info: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 8v5m0-8.500v.500" />,
  calendar: <path d="M5 6h14v14H5zM5 10h14M9 3v4m6-4v4" />,
  clock: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3 2" />,
  flag: <path d="M6 21V4m0 1h11l-2 4 2 4H6" />,
  star: <path d="M12 3.500l2.600 5.400 5.900.800-4.300 4.100 1 5.800-5.200-2.800-5.200 2.800 1-5.800-4.300-4.100 5.900-.800z" />,
  euro: <path d="M18 6.500A7 7 0 007 12a7 7 0 0011 5.500M4 10h9M4 14h9" />,
  trend: <path d="M4 17l5-5 4 4 7-8m0 0h-5m5 0v5" />,
  target: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 5a4 4 0 100 8 4 4 0 000-8zm0 3.500v1" />,
  search: <path d="M11 4a7 7 0 100 14 7 7 0 000-14zm5 12l4 4" />,
  eye: <path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zm9.500-3a3 3 0 100 6 3 3 0 000-6z" />,
  print: <path d="M7 9V4h10v5M7 17H4v-8h16v8h-3M7 14h10v6H7z" />,
  forward: <path d="M9 5l7 7-7 7" />,
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
    <div className="tile">
      <div className="tile-label"><span>{label}</span>{ampel && ampel !== 'neutral' && <AmpelBadge ampel={ampel} />}</div>
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
  /** `checkbox` liefert 0/1, `number` eine Zahl (leer bleibt leer). */
  type?: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'checkbox' | 'password' | 'email' | 'month';
  options?: { value: string; label: string }[];
  suggestions?: string[];
  required?: boolean;
  wide?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  autoComplete?: string;
  hidden?: (values: Record<string, unknown>) => boolean;
}

type Values = Record<string, unknown>;

const isOn = (v: unknown) => v === true || v === 1 || v === '1';

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
      const out = { ...values };
      for (const f of fields) {
        if (f.type === 'checkbox') out[f.key] = isOn(out[f.key]) ? 1 : 0;
        else if (f.type === 'number' && out[f.key] !== '' && out[f.key] != null) out[f.key] = Number(out[f.key]);
      }
      await onSave(out);
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
            if (f.type === 'checkbox') return (
              <label key={f.key} className={`check ${f.wide ? 'wide' : ''}`} htmlFor={common.id}>
                <input id={common.id} type="checkbox" checked={isOn(values[f.key])} onChange={(e) => set(f.key, e.target.checked ? 1 : 0)} />
                <span>{f.label}{f.hint && <small className="hint">{f.hint}</small>}</span>
              </label>
            );
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
                    <input {...common} type={f.type ?? 'text'} step={f.type === 'number' ? f.step ?? 'any' : undefined} min={f.min} max={f.max} autoComplete={f.autoComplete} value={v} list={f.suggestions ? `l-${f.key}` : undefined}
                      onChange={(e) => set(f.key, e.target.value)} />
                    {f.suggestions && <datalist id={`l-${f.key}`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
                  </>
                )}
                {f.hint && <small className="hint">{f.hint}</small>}
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

/** Farbschema-Umschalter; merkt sich die Wahl im Browser. */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  return (
    <button type="button" className="btn ghost icon-btn" onClick={() => setDark(!dark)} aria-label="Farbschema wechseln" title="Farbschema wechseln">
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}
