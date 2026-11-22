import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { erlaubteBerichte, erstelleBericht, type BerichtId } from '../reports';
import '../styles/reports.css';
import { Icon } from './ui';

interface Vorschau {
  url: string;
  dateiname: string;
  seiten: number;
}

/** Seite „Berichte“: Berichtstyp (und ggf. Projekt) wählen, als PDF herunterladen oder in der Vorschau ansehen. */
export function Reports() {
  const { me, data, can, reportError } = useApp();
  const typen = useMemo(() => erlaubteBerichte(can), [can]);
  const projekte = useMemo(() => data.projects.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')), [data.projects]);

  const [typId, setTypId] = useState<BerichtId | undefined>(typen[0]?.id);
  const [projektId, setProjektId] = useState<number | undefined>(projekte[0]?.id);
  const [busy, setBusy] = useState<'pdf' | 'vorschau' | null>(null);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [meldung, setMeldung] = useState('');

  // Auswahl gültig halten, wenn sich Rechte oder Projekte nach einem Neuladen ändern
  const typ = typen.find((t) => t.id === typId) ?? typen[0];
  const projekt = projekte.find((p) => p.id === projektId) ?? projekte[0];
  const fehltProjekt = !!typ?.projektbezogen && !projekt;

  // Blob-URL freigeben, sobald die Vorschau ersetzt oder die Seite verlassen wird
  const offeneUrl = useRef<string | null>(null);
  const zeige = (v: Vorschau | null) => {
    if (offeneUrl.current) URL.revokeObjectURL(offeneUrl.current);
    offeneUrl.current = v?.url ?? null;
    setVorschau(v);
  };
  useEffect(() => () => { if (offeneUrl.current) URL.revokeObjectURL(offeneUrl.current); }, []);

  // Eine Vorschau gilt nur für die Auswahl und den Datenstand, mit denen sie erzeugt wurde
  useEffect(() => {
    zeige(null);
    setMeldung('');
  }, [typ?.id, projekt?.id, data]);

  if (!typ) return <p className="empty">Für Ihre Rolle sind keine Berichte freigegeben.</p>;

  async function erstellen(art: 'pdf' | 'vorschau') {
    if (!typ || fehltProjekt || busy) return;
    setBusy(art);
    setMeldung('');
    try {
      const datei = await erstelleBericht(typ.id, { data, me, can, projectId: typ.projektbezogen ? projekt?.id : undefined });
      const url = URL.createObjectURL(datei.blob);
      if (art === 'vorschau') {
        zeige({ url, dateiname: datei.dateiname, seiten: datei.seiten });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = datei.dateiname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // erst nach dem Start des Downloads freigeben
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setMeldung(`${datei.dateiname} wurde erstellt (${datei.seiten} ${datei.seiten === 1 ? 'Seite' : 'Seiten'}).`);
      }
    } catch (err) {
      reportError(`Der Bericht konnte nicht erstellt werden: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const inhalt = typ.inhalt(can);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Berichte</h1>
          <p className="desc">Berichte als PDF erstellen – zum Ablegen, Ausdrucken oder Weitergeben. Jeder Bericht enthält nur, was Ihre Rolle sehen darf.</p>
        </div>
      </div>

      <div className="report-layout">
        <section className="card report-form" aria-label="Bericht auswählen">
          <label htmlFor="report-type">
            <span>Bericht</span>
            <select id="report-type" value={typ.id} onChange={(e) => setTypId(e.target.value as BerichtId)}>
              {typen.map((t) => <option key={t.id} value={t.id}>{t.titel}</option>)}
            </select>
          </label>

          {typ.projektbezogen && (
            <label htmlFor="report-project">
              <span>Projekt</span>
              {projekte.length ? (
                <select id="report-project" value={projekt?.id} onChange={(e) => setProjektId(Number(e.target.value))}>
                  {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kunde ? ` – ${p.kunde}` : ''}</option>)}
                </select>
              ) : (
                <select id="report-project" disabled><option>Kein Projekt verfügbar</option></select>
              )}
            </label>
          )}

          <div className="report-desc">
            <p>{typ.beschreibung}</p>
            <dl>
              <dt>Zielgruppe</dt>
              <dd>{typ.zielgruppe}</dd>
              <dt>Umfang</dt>
              <dd>{typ.projektbezogen ? 'Ein Projekt' : `Alle für Sie sichtbaren Projekte (${data.projects.length})`}</dd>
              <dt>Inhalt</dt>
              <dd>
                <ul>{inhalt.map((punkt) => <li key={punkt}><Icon name="check" size={14} />{punkt}</li>)}</ul>
              </dd>
            </dl>
          </div>

          {fehltProjekt && <p className="report-note" role="note"><Icon name="info" />Ihnen ist noch kein Projekt zugewiesen. Dieser Bericht braucht ein Projekt.</p>}

          <div className="report-actions">
            <button type="button" className="btn primary" onClick={() => erstellen('pdf')} disabled={fehltProjekt || !!busy}>
              <Icon name="download" />{busy === 'pdf' ? 'Wird erstellt …' : 'PDF erstellen'}
            </button>
            <button type="button" className="btn" onClick={() => erstellen('vorschau')} disabled={fehltProjekt || !!busy}>
              <Icon name="eye" />{busy === 'vorschau' ? 'Wird erstellt …' : 'Vorschau'}
            </button>
          </div>
          <p className="report-status small muted" role="status">{meldung}</p>
        </section>

        <section className="card report-preview" aria-label="Vorschau">
          {vorschau ? (
            <>
              <div className="card-head">
                <div className="report-preview-title">
                  <h2>Vorschau</h2>
                  <span className="small muted">{vorschau.dateiname} · {vorschau.seiten} {vorschau.seiten === 1 ? 'Seite' : 'Seiten'}</span>
                </div>
                <div className="actions">
                  <a className="btn" href={vorschau.url} target="_blank" rel="noopener"><Icon name="forward" />In neuem Tab öffnen</a>
                  <a className="btn" href={vorschau.url} download={vorschau.dateiname}><Icon name="download" />Herunterladen</a>
                </div>
              </div>
              <iframe className="report-frame" src={vorschau.url} title={`Vorschau ${typ.titel}`} />
            </>
          ) : (
            <div className="report-empty">
              <span className="report-empty-icon"><Icon name="file" size={24} /></span>
              <strong>{busy === 'vorschau' ? 'Vorschau wird erstellt …' : 'Noch keine Vorschau'}</strong>
              <span className="muted">Mit „Vorschau“ sehen Sie den Bericht hier, bevor Sie ihn herunterladen.</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
