import { useApp } from '../../app-context';
import { todayIso } from '../../calc';
import { bereichForm } from '../../forms';
import type { Kapazitaet } from '../../kpi';
import { Icon } from '../ui';
import { hours, monthLabel } from './util';

/** Stufen der einfarbigen Skala (hell → dunkel); über 100 % zusätzlich mit ▲ gekennzeichnet. */
const STUFEN = [
  { bis: 0.5, label: 'bis 50 %' },
  { bis: 0.75, label: 'bis 75 %' },
  { bis: 0.9, label: 'bis 90 %' },
  { bis: 1, label: 'bis 100 %' },
  { bis: Infinity, label: 'über 100 %' },
];
const stufe = (x: number) => STUFEN.findIndex((s) => x <= s.bis) + 1;

/** Auslastung Bereich × Monat; Zeilenkopf mit Kapazität und – mit ressourcen.bearbeiten – deren Pflege. */
export function Heatmap({ kap }: { kap: Kapazitaet }) {
  const { data, can, openForm, remove } = useApp();
  // Bereiche gelten für alle Projekte – der Server verlangt zum Ändern auch „alle Projekte“
  const edit = can('ressourcen.bearbeiten') && can('projekte.alle');
  const aktuell = todayIso().slice(0, 7);

  return (
    <>
      <div className="table-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th>Bereich</th>
              {kap.monate.map((mo) => <th key={mo} className={mo === aktuell ? 'now' : ''}>{monthLabel(mo)}{mo === aktuell && <small>heute</small>}</th>)}
              <th className="num">Engpässe</th>
            </tr>
          </thead>
          <tbody>
            {kap.zeilen.map((z) => {
              const b = data.bereiche.find((x) => x.name === z.bereich);
              return (
                <tr key={z.bereich}>
                  <th scope="row">
                    <div className="heat-head">
                      <div>
                        <div>{z.bereich}</div>
                        <div className="muted small">{z.kapazitaet > 0 ? `${hours(z.kapazitaet)} / Monat` : 'Kapazität nicht hinterlegt'}</div>
                      </div>
                      {edit && (
                        <span className="heat-actions">
                          <button className="btn ghost icon-btn" onClick={() => openForm(bereichForm(b ?? { name: z.bereich }))} aria-label={`Kapazität ${z.bereich} bearbeiten`} title="Kapazität bearbeiten"><Icon name="edit" /></button>
                          {b && <button className="btn ghost icon-btn" onClick={() => remove('bereiche', b.id, `Bereich „${b.name}“ (Kapazität)`)} aria-label={`Bereich ${z.bereich} löschen`} title="Bereich löschen"><Icon name="trash" /></button>}
                        </span>
                      )}
                    </div>
                  </th>
                  {z.zellen.map((c) => {
                    const a = c.auslastung;
                    const tip = `${z.bereich}, ${monthLabel(c.monat)}: ${hours(c.soll)} geplant${a === null ? ' – keine Kapazität hinterlegt' : ` von ${hours(z.kapazitaet)} Kapazität`} · ${hours(c.ist)} geleistet`;
                    return (
                      <td key={c.monat} title={tip} className={a === null ? 'heat-leer' : `heat-${stufe(a)}`}>
                        {a === null ? (c.soll > 0 ? <span className="muted">{hours(c.soll)}</span> : <span className="muted">–</span>) : (
                          <>{a > 1 && <span aria-label="Engpass">▲ </span>}{Math.round(a * 100)} %</>
                        )}
                      </td>
                    );
                  })}
                  <td className="num">{z.engpaesse ? <span className="badge eskalation"><Icon name="alert" size={14} />{z.engpaesse} {z.engpaesse === 1 ? 'Monat' : 'Monate'}</span> : <span className="muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="heat-legend" aria-label="Legende Auslastung">
        <span className="muted">Auslastung = geplante Stunden ÷ Kapazität</span>
        {STUFEN.map((s, i) => <span key={s.label}><i className={`heat-${i + 1}`} />{i === 4 && '▲ '}{s.label}</span>)}
      </div>
    </>
  );
}
