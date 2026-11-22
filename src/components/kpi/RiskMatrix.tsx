import { risikoStufe, type RisikoBewertet } from '../../kpi';
import { stufeText } from './util';

const ACHSE = [1, 2, 3, 4, 5];

/** 5×5-Matrix der offenen Risiken: Zeilen = Wahrscheinlichkeit, Spalten = Auswirkung, Zahl = Anzahl. */
export function RiskMatrix({ risiken }: { risiken: RisikoBewertet[] }) {
  return (
    <div className="riskmatrix-wrap">
      <table className="riskmatrix" aria-label="Risikomatrix: Anzahl offener Risiken je Wahrscheinlichkeit und Auswirkung">
        <tbody>
          {[...ACHSE].reverse().map((w, i) => (
            <tr key={w}>
              {i === 0 && <th rowSpan={5} className="axis-y" scope="rowgroup"><span>Wahrscheinlichkeit</span></th>}
              <th scope="row">{w}</th>
              {ACHSE.map((a) => {
                const hier = risiken.filter((r) => r.wahrscheinlichkeit === w && r.auswirkung === a);
                const stufe = risikoStufe(w * a);
                return (
                  <td key={a} className={`rm-${stufe} ${hier.length ? 'filled' : ''}`}
                    title={`Wahrscheinlichkeit ${w} × Auswirkung ${a} = ${w * a} (${stufeText[stufe]})${hier.length ? `\n${hier.map((r) => `• ${r.titel}${r.projekt ? ` (${r.projekt})` : ''}`).join('\n')}` : ''}`}>
                    {hier.length || ''}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr><th /><th />{ACHSE.map((a) => <th key={a} scope="col">{a}</th>)}</tr>
          <tr><th /><th /><th colSpan={5} className="axis-x">Auswirkung</th></tr>
        </tbody>
      </table>
      <div className="rm-legend">
        <span><i className="rm-niedrig" />Niedrig (unter 8)</span>
        <span><i className="rm-mittel" />Mittel (8–14)</span>
        <span><i className="rm-hoch" />Hoch (ab 15)</span>
      </div>
    </div>
  );
}
