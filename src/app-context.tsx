import { createContext, useContext } from 'react';
import type { Field } from './components/ui';
import type { Data, Me, Table } from './types';

export type Route =
  | { page: 'portfolio' }
  | { page: 'projekt'; id: number }
  | { page: 'management' }
  | { page: 'berichte' }
  | { page: 'verwaltung' };

export interface FormConfig {
  table: Table;
  title: string;
  fields: Field[];
  /** Bei vorhandener `id` wird aktualisiert, sonst angelegt. */
  initial: Record<string, unknown>;
  /** Werte vor dem Speichern anpassen (z. B. abhängige Felder setzen). */
  transform?: (values: Record<string, unknown>) => Record<string, unknown>;
  onSaved?: (saved: { id: number }) => void;
}

export interface AppCtx {
  me: Me;
  /** Bereits serverseitig nach Berechtigung gefiltert. */
  data: Data;
  can: (permission: string) => boolean;
  reload: () => Promise<void>;
  /** Öffnet den Bearbeiten-Dialog; speichert über die API und lädt die Daten neu. */
  openForm: (config: FormConfig) => void;
  /** Fragt nach und löscht dann den Datensatz. */
  remove: (table: Table, id: number, what: string, after?: () => void) => void;
  go: (route: Route) => void;
  reportError: (message: string) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp außerhalb des AppContext verwendet');
  return ctx;
}
