import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Table } from './api';
import { todayIso } from './calc';
import { Portfolio } from './components/Portfolio';
import { ProjectDetail } from './components/ProjectDetail';
import { FormModal, Icon, STATUS_OPTIONS, type Field } from './components/ui';
import type { Data } from './types';

type Values = Record<string, unknown>;
interface Editing {
  table: Table;
  title: string;
  fields: Field[];
  initial: Values;
}

const projectFields: Field[] = [
  { key: 'name', label: 'Projektname', required: true, wide: true },
  { key: 'kunde', label: 'Kunde' },
  { key: 'leiter', label: 'Projektleitung' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'budget', label: 'Budget (€)', type: 'number', required: true },
  { key: 'start_soll', label: 'Start (Soll)', type: 'date', required: true },
  { key: 'ende_soll', label: 'Ende (Soll)', type: 'date', required: true },
  { key: 'beschreibung', label: 'Beschreibung', type: 'textarea', wide: true },
];

const isMilestone = (v: Values) => v.typ === 'meilenstein';
const taskFields: Field[] = [
  { key: 'name', label: 'Bezeichnung', required: true, wide: true },
  { key: 'typ', label: 'Typ', type: 'select', options: [{ value: 'phase', label: 'Phase' }, { value: 'meilenstein', label: 'Meilenstein' }] },
  { key: 'fortschritt', label: 'Fortschritt (%)', type: 'number', required: true },
  { key: 'start_soll', label: 'Start (Soll)', type: 'date', required: true, hidden: isMilestone },
  { key: 'ende_soll', label: 'Ende / Termin (Soll)', type: 'date', required: true },
  { key: 'start_ist', label: 'Start (Ist)', type: 'date', hidden: isMilestone },
  { key: 'ende_ist', label: 'Ende / Termin (Ist)', type: 'date' },
];

const KATEGORIEN = ['Personal', 'Material', 'Fremdleistung', 'Sonstiges'];

function useHashRoute(): [number | null, (id: number | null) => void] {
  const parse = () => {
    const m = location.hash.match(/^#\/projekt\/(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const [id, setId] = useState(parse);
  useEffect(() => {
    const on = () => setId(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [id, (next) => { location.hash = next ? `#/projekt/${next}` : '#/'; window.scrollTo(0, 0); }];
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [projectId, go] = useHashRoute();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dark, setDark] = useState(() => (localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark');
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => api.load().then(setData, (e) => setError(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const guarded = (action: () => Promise<unknown>) => action().then(reload).catch((e) => setError(e.message));
  const del = (table: Table, id: number, what: string, after?: () => void) => {
    if (confirm(`${what} wirklich löschen?`)) guarded(() => api.remove(table, id).then(after));
  };

  async function save(values: Values) {
    const v = { ...values };
    // Meilenstein hat nur einen Termin
    if (editing!.table === 'tasks' && v.typ === 'meilenstein') { v.start_soll = v.ende_soll; v.start_ist = null; }
    const saved = await api.save(editing!.table, v);
    await reload();
    if (editing!.table === 'projects' && !values.id) go(saved.id);
  }

  async function importFile(file: File) {
    if (!confirm('Der Import ersetzt alle vorhandenen Daten. Fortfahren?')) return;
    try {
      setData(await api.importAll(JSON.parse(await file.text())));
      go(null);
    } catch (e) {
      setError(`Import fehlgeschlagen: ${(e as Error).message}`);
    }
  }

  const project = data?.projects.find((p) => p.id === projectId);
  const today = todayIso();

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/"><span className="logo" aria-hidden="true" />Projekt-Dashboard</a>
        <div className="actions">
          <a className="btn ghost" href="/api/export" title="Alle Daten als JSON sichern"><Icon name="download" /><span className="hide-sm">Export</span></a>
          <button className="btn ghost" onClick={() => fileInput.current?.click()} title="JSON-Sicherung einspielen"><Icon name="upload" /><span className="hide-sm">Import</span></button>
          <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
          <button className="btn ghost icon-btn" onClick={() => setDark(!dark)} aria-label="Farbschema wechseln"><Icon name={dark ? 'sun' : 'moon'} /></button>
        </div>
      </header>

      <main>
        {error && <div className="banner" role="alert">{error}<button className="btn ghost icon-btn" onClick={() => setError('')} aria-label="Meldung schließen"><Icon name="close" /></button></div>}
        {!data ? (
          !error && <p className="empty">Daten werden geladen …</p>
        ) : projectId && !project ? (
          <p className="empty">Projekt nicht gefunden. <a href="#/">Zur Übersicht</a></p>
        ) : project ? (
          <ProjectDetail
            key={project.id}
            project={project}
            tasks={data.tasks.filter((t) => t.project_id === project.id)}
            costs={data.costs.filter((c) => c.project_id === project.id)}
            onBack={() => go(null)}
            onEditProject={() => setEditing({ table: 'projects', title: 'Projekt bearbeiten', fields: projectFields, initial: { ...project } })}
            onDeleteProject={() => del('projects', project.id, `Projekt „${project.name}“ mit allen Terminen und Kosten`, () => go(null))}
            onEditTask={(t) => setEditing({
              table: 'tasks', title: t ? 'Termin bearbeiten' : 'Neuer Termin', fields: taskFields,
              initial: t ? { ...t } : { project_id: project.id, name: '', typ: 'phase', fortschritt: 0, start_soll: today, ende_soll: today, start_ist: '', ende_ist: '' },
            })}
            onDeleteTask={(t) => del('tasks', t.id, `„${t.name}“`)}
            onEditCost={(c) => setEditing({
              table: 'costs', title: c ? 'Kostenposition bearbeiten' : 'Neue Kostenposition',
              fields: [
                { key: 'datum', label: 'Datum', type: 'date', required: true },
                { key: 'art', label: 'Art', type: 'select', options: [{ value: 'ist', label: 'Ist (Buchung)' }, { value: 'soll', label: 'Soll (Plan)' }] },
                { key: 'kategorie', label: 'Kategorie', required: true, suggestions: [...new Set([...KATEGORIEN, ...data.costs.map((x) => x.kategorie)])] },
                { key: 'betrag', label: 'Betrag (€)', type: 'number', required: true },
                { key: 'bezeichnung', label: 'Bezeichnung', wide: true },
              ],
              initial: c ? { ...c } : { project_id: project.id, datum: today, art: 'ist', kategorie: '', bezeichnung: '', betrag: '' },
            })}
            onDeleteCost={(c) => del('costs', c.id, 'Kostenposition')}
          />
        ) : (
          <Portfolio
            data={data}
            onOpen={go}
            onNew={() => setEditing({ table: 'projects', title: 'Neues Projekt', fields: projectFields, initial: { name: '', kunde: '', leiter: '', status: 'geplant', budget: '', start_soll: today, ende_soll: today, beschreibung: '' } })}
          />
        )}
      </main>

      {editing && <FormModal title={editing.title} fields={editing.fields} initial={editing.initial} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}
