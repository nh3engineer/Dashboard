import type { Data } from './types';

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error, () => null);
    throw new Error(msg || `Serverfehler (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type Table = 'projects' | 'tasks' | 'costs';

export const api = {
  load: () => request<Data>('/api/data'),
  save: (table: Table, row: Record<string, unknown>) =>
    row.id ? request<{ id: number }>(`/api/${table}/${row.id}`, 'PUT', row) : request<{ id: number }>(`/api/${table}`, 'POST', row),
  remove: (table: Table, id: number) => request<void>(`/api/${table}/${id}`, 'DELETE'),
  importAll: (data: unknown) => request<Data>('/api/import', 'POST', data),
};
