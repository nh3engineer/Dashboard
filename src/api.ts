import type { Data, Me, PermissionDef, Role, Table, User } from './types';

export type { Table };

export interface AuthStatus {
  setupRequired: boolean;
  user: Me | null;
}

/** Benutzer-Daten fürs Anlegen/Ändern; `password` leer = unverändert. */
export type UserInput = Omit<User, 'id' | 'last_login'> & { id?: number; password?: string };
export type RoleInput = Pick<Role, 'name' | 'beschreibung' | 'permissions'> & { id?: number };

let onUnauthorized = () => {};
/** Wird aufgerufen, wenn die Sitzung abgelaufen ist (401 außerhalb der Anmeldung). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(url: string, method = 'GET', body?: unknown, onResponse?: (res: Response) => void): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Server nicht erreichbar. Bitte Verbindung prüfen.');
  }
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error, () => null);
    // Bei /api/auth/* bedeutet 401 „falsche Zugangsdaten“, nicht „Sitzung abgelaufen“.
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      onUnauthorized();
      throw new Error(msg || 'Sitzung abgelaufen. Bitte erneut anmelden.');
    }
    throw new Error(msg || (res.status === 403 ? 'Keine Berechtigung für diese Aktion.' : `Serverfehler (${res.status})`));
  }
  onResponse?.(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

const saveRow = <T, I extends { id?: number }>(base: string, row: I) =>
  row.id ? request<T>(`${base}/${row.id}`, 'PUT', row) : request<T>(base, 'POST', row);

export const api = {
  status: () => request<AuthStatus>('/api/auth/status'),
  setup: (body: { benutzername: string; name: string; password: string }) => request<Me>('/api/auth/setup', 'POST', body),
  login: (benutzername: string, password: string) => request<Me>('/api/auth/login', 'POST', { benutzername, password }),
  logout: () => request<void>('/api/auth/logout', 'POST'),
  password: (current: string, next: string) => request<void>('/api/auth/password', 'POST', { current, next }),

  data: () => request<Data>('/api/data'),
  save: (table: Table, row: Record<string, unknown>) => saveRow<{ id: number }, Record<string, unknown> & { id?: number }>(`/api/${table}`, row),
  remove: (table: Table, id: number) => request<void>(`/api/${table}/${id}`, 'DELETE'),
  exportUrl: '/api/export',
  exportAll: () => request<Data>('/api/export'),
  /** Ersetzt den Bestand; `entfallen` = Projektzuweisungen von Benutzern, die nicht übernommen werden konnten. */
  importAll: async (data: unknown) => {
    let entfallen = 0;
    await request<unknown>('/api/import', 'POST', data, (res) => { entfallen = Number(res.headers.get('X-Zuweisungen-Entfallen')) || 0; });
    return { entfallen };
  },

  admin: {
    permissions: () => request<PermissionDef[]>('/api/admin/permissions'),
    roles: () => request<Role[]>('/api/admin/roles'),
    saveRole: (role: RoleInput) => saveRow<Role, RoleInput>('/api/admin/roles', role),
    removeRole: (id: number) => request<void>(`/api/admin/roles/${id}`, 'DELETE'),
    users: () => request<User[]>('/api/admin/users'),
    saveUser: (user: UserInput) => saveRow<User, UserInput>('/api/admin/users', user),
    removeUser: (id: number) => request<void>(`/api/admin/users/${id}`, 'DELETE'),
  },
};
