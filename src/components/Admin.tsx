import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type RoleInput, type UserInput } from '../api';
import { useApp } from '../app-context';
import type { PermissionDef, Project, Role, User } from '../types';
import { AmpelBadge, Icon, Modal } from './ui';
import '../styles/admin.css';

const ALL_PROJECTS = 'projekte.alle';
const stamp = new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** SQLite liefert „YYYY-MM-DD HH:MM:SS“ in UTC, ISO-Zeitstempel gehen unverändert durch. */
function lastLogin(value: string | null) {
  if (!value) return 'noch nie';
  const d = new Date(/[TZ]/.test(value) ? value : value.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? value : stamp.format(d);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function Admin() {
  const { me, data, reload, reportError } = useApp();
  const [tab, setTab] = useState<'benutzer' | 'rollen'>('benutzer');
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<PermissionDef[]>([]);
  /** Noch nicht gespeicherte Rechte je Rolle (nur geänderte Rollen). */
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [editUser, setEditUser] = useState<User | 'neu' | null>(null);
  const [editRole, setEditRole] = useState<Role | 'neu' | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, r, p] = await Promise.all([api.admin.users(), api.admin.roles(), api.admin.permissions()]);
      setUsers(u); setRoles(r); setPerms(p);
    } catch (e) {
      reportError((e as Error).message);
    }
  }, [reportError]);
  useEffect(() => { load(); }, [load]);

  // Eigene Rechte können betroffen sein → auch die App neu laden.
  const changed = () => Promise.all([load(), reload()]);

  const dirty = roles.filter((r) => drafts[r.id]);
  useEffect(() => {
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.length]);

  function toggle(role: Role, key: string) {
    const current = drafts[role.id] ?? role.permissions;
    // Wie am Server: Bearbeiten setzt Ansehen voraus – beim Abwählen von Ansehen entfällt auch Bearbeiten
    const [area, action] = key.split('.');
    const next = current.includes(key)
      ? current.filter((k) => k !== key && !(action === 'ansehen' && k === `${area}.bearbeiten`))
      : [...new Set([...current, key, ...(action === 'bearbeiten' && perms.some((p) => p.key === `${area}.ansehen`) ? [`${area}.ansehen`] : [])])];
    setDrafts(({ [role.id]: _, ...rest }) => (sameSet(next, role.permissions) ? rest : { ...rest, [role.id]: next }));
  }
  const discard = (id: number) => setDrafts(({ [id]: _, ...rest }) => rest);

  async function saveRights(role: Role) {
    setSaving(role.id);
    try {
      await api.admin.saveRole({ id: role.id, name: role.name, beschreibung: role.beschreibung, permissions: drafts[role.id] });
      discard(role.id);
      await changed();
    } catch (e) {
      reportError(`Rechte für „${role.name}“ nicht gespeichert: ${(e as Error).message}`);
    }
    setSaving(null);
  }

  async function removeUser(u: User) {
    if (!confirm(`Benutzer „${u.name}“ (${u.benutzername}) wirklich löschen?`)) return;
    try { await api.admin.removeUser(u.id); await changed(); } catch (e) { reportError((e as Error).message); }
  }
  async function removeRole(r: Role) {
    if (!confirm(`Rolle „${r.name}“ wirklich löschen?`)) return;
    try { await api.admin.removeRole(r.id); discard(r.id); await changed(); } catch (e) { reportError((e as Error).message); }
  }

  const roleOf = (u: User) => roles.find((r) => r.id === u.role_id);
  const projectsOf = (u: User) => {
    if (roleOf(u)?.permissions.includes(ALL_PROJECTS)) return <span className="muted">Alle</span>;
    if (!u.project_ids.length) return <span className="muted">Keine</span>;
    const names = u.project_ids.map((id) => data.projects.find((p) => p.id === id)?.name).filter(Boolean);
    return <span title={names.join('\n')}>{names.slice(0, 2).join(', ')}{u.project_ids.length > 2 && ` +${u.project_ids.length - 2}`}{!names.length && `${u.project_ids.length} Projekt(e)`}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Verwaltung</h1>
          <p className="desc">Benutzer anlegen, Rollen zuweisen und festlegen, welche Bereiche und Funktionen jede Rolle sehen und bearbeiten darf.</p>
        </div>
        {tab === 'benutzer'
          ? <button className="btn primary" onClick={() => setEditUser('neu')} disabled={!users}><Icon name="plus" />Neuer Benutzer</button>
          : <button className="btn primary" onClick={() => setEditRole('neu')} disabled={!users}><Icon name="plus" />Neue Rolle</button>}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'benutzer'} className={tab === 'benutzer' ? 'active' : ''} onClick={() => setTab('benutzer')}>Benutzer{users && ` (${users.length})`}</button>
        <button role="tab" aria-selected={tab === 'rollen'} className={tab === 'rollen' ? 'active' : ''} onClick={() => setTab('rollen')}>Rollen &amp; Rechte{dirty.length > 0 && <span className="dirty-dot" title="Ungespeicherte Änderungen" />}</button>
      </div>

      {!users ? <p className="empty">Wird geladen …</p> : tab === 'benutzer' ? (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Benutzername</th><th>E-Mail</th><th>Rolle</th><th>Projekte</th><th>Status</th><th>Letzter Login</th><th /></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="strong nowrap">{u.name}{u.id === me.id && <span className="badge you">Sie</span>}</td>
                    <td>{u.benutzername}</td>
                    <td>{u.email || <span className="muted">–</span>}</td>
                    <td className="nowrap">{roleOf(u)?.name ?? <span className="muted">–</span>}</td>
                    <td className="admin-projects">{projectsOf(u)}</td>
                    <td>{u.aktiv ? <AmpelBadge ampel="gruen">Aktiv</AmpelBadge> : <span className="badge"><Icon name="lock" size={14} />Gesperrt</span>}</td>
                    <td className="nowrap muted">{lastLogin(u.last_login)}</td>
                    <td className="row-actions">
                      <button className="btn ghost icon-btn" onClick={() => setEditUser(u)} aria-label={`${u.name} bearbeiten`} title="Bearbeiten"><Icon name="edit" /></button>
                      <button className="btn ghost icon-btn danger" onClick={() => removeUser(u)} disabled={u.id === me.id} aria-label={`${u.name} löschen`} title={u.id === me.id ? 'Das eigene Konto kann nicht gelöscht werden' : 'Löschen'}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card">
          {dirty.length > 0 && (
            <div className="unsaved" role="status">
              <span><Icon name="warn" /> Ungespeicherte Änderungen: {dirty.map((r) => r.name).join(', ')}</span>
              <span className="unsaved-actions">
                <button className="btn primary" disabled={saving !== null} onClick={async () => { for (const r of dirty) await saveRights(r); }}><Icon name="save" />{dirty.length > 1 ? 'Alle speichern' : 'Speichern'}</button>
                <button className="btn" disabled={saving !== null} onClick={() => setDrafts({})}><Icon name="undo" />Verwerfen</button>
              </span>
            </div>
          )}
          <div className="matrix-wrap">
            <table className="table matrix">
              <thead>
                <tr>
                  <th className="matrix-first">Bereich / Funktion</th>
                  {roles.map((r) => (
                    <th key={r.id} className={drafts[r.id] ? 'is-dirty' : ''}>
                      <div className="role-head">
                        <span className="role-name">{r.name}</span>
                        <span className="muted small">{r.system ? 'Systemrolle · ' : ''}{users.filter((u) => u.role_id === r.id).length} Benutzer</span>
                        {!r.system && (
                          <span className="role-actions">
                            <button className="btn ghost icon-btn" onClick={() => setEditRole(r)} aria-label={`Rolle ${r.name} umbenennen`} title="Umbenennen"><Icon name="edit" size={14} /></button>
                            <button className="btn ghost icon-btn danger" onClick={() => removeRole(r)} aria-label={`Rolle ${r.name} löschen`} title="Löschen"><Icon name="trash" size={14} /></button>
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Set(perms.map((p) => p.group))].map((group) => [
                  <tr key={group} className="matrix-group">
                    <th className="matrix-first" scope="rowgroup">{group}</th>
                    <td colSpan={roles.length} />
                  </tr>,
                  ...perms.filter((p) => p.group === group).map((p) => (
                    <tr key={p.key}>
                      <th className="matrix-first" scope="row">{p.label}</th>
                      {roles.map((r) => (
                        <td key={r.id} className={drafts[r.id] && drafts[r.id].includes(p.key) !== r.permissions.includes(p.key) ? 'cell-changed' : ''}>
                          <input type="checkbox" aria-label={`${p.label} – ${r.name}`} disabled={r.system}
                            checked={r.system || (drafts[r.id] ?? r.permissions).includes(p.key)} onChange={() => toggle(r, p.key)} />
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
              <tfoot>
                <tr>
                  <th className="matrix-first">Änderungen</th>
                  {roles.map((r) => (
                    <td key={r.id}>
                      {r.system ? <span className="muted small">immer alle Rechte</span> : drafts[r.id] ? (
                        <span className="save-cell">
                          <button className="btn primary" onClick={() => saveRights(r)} disabled={saving !== null}><Icon name="save" />{saving === r.id ? 'Speichert …' : 'Speichern'}</button>
                          <button className="btn ghost" onClick={() => discard(r.id)} disabled={saving !== null}><Icon name="undo" />Verwerfen</button>
                        </span>
                      ) : <span className="muted small saved"><Icon name="check" size={14} />gespeichert</span>}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted small matrix-note"><Icon name="info" size={14} /> Ohne „Alle Projekte sehen“ sieht eine Rolle nur die Projekte, die dem jeweiligen Benutzer zugewiesen sind – so erhalten z. B. Kunden und Bauherren Zugang nur zu ihrem Projekt.</p>
        </section>
      )}

      {editUser && <UserDialog user={editUser === 'neu' ? null : editUser} roles={roles} projects={data.projects} onClose={() => setEditUser(null)} onSaved={changed} />}
      {editRole && <RoleDialog role={editRole === 'neu' ? null : editRole} roles={roles} onClose={() => setEditRole(null)} onSaved={changed} />}
    </>
  );
}

function UserDialog({ user, roles, projects, onClose, onSaved }: { user: User | null; roles: Role[]; projects: Project[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [v, setV] = useState<UserInput>(() => user
    ? { ...user, password: '' }
    : { benutzername: '', name: '', email: '', role_id: (roles.find((r) => !r.system) ?? roles[0])?.id ?? 0, aktiv: true, project_ids: [], password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof UserInput>(key: K, value: UserInput[K]) => setV((old) => ({ ...old, [key]: value }));

  const seesAll = roles.find((r) => r.id === v.role_id)?.permissions.includes(ALL_PROJECTS) ?? false;
  // Zuweisungen zu Projekten, die man selbst nicht sieht, bleiben beim Speichern erhalten.
  const hidden = v.project_ids.filter((id) => !projects.some((p) => p.id === id)).length;
  const toggleProject = (id: number) => set('project_ids', v.project_ids.includes(id) ? v.project_ids.filter((x) => x !== id) : [...v.project_ids, id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (v.password && v.password.length < 8) return setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
    setBusy(true);
    setError('');
    try {
      const { password, ...rest } = v;
      await api.admin.saveUser({ ...rest, name: v.name.trim(), benutzername: v.benutzername.trim(), email: v.email.trim(), ...(password ? { password } : {}) });
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={user ? 'Benutzer bearbeiten' : 'Neuer Benutzer'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label htmlFor="u-name"><span>Name *</span><input id="u-name" required autoFocus value={v.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label htmlFor="u-user"><span>Benutzername *</span><input id="u-user" required minLength={3} maxLength={64} pattern="\S+" title="3 bis 64 Zeichen ohne Leerzeichen" autoComplete="off" autoCapitalize="none" spellCheck={false} value={v.benutzername} onChange={(e) => set('benutzername', e.target.value)} /></label>
          <label htmlFor="u-mail"><span>E-Mail</span><input id="u-mail" type="email" autoComplete="off" value={v.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label htmlFor="u-role">
            <span>Rolle *</span>
            <select id="u-role" required value={v.role_id} onChange={(e) => set('role_id', Number(e.target.value))}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label htmlFor="u-pass" className="wide">
            <span>{user ? 'Neues Passwort' : 'Passwort *'}</span>
            <input id="u-pass" type="password" autoComplete="new-password" required={!user} minLength={8} value={v.password} onChange={(e) => set('password', e.target.value)}
              placeholder={user ? 'leer = unverändert' : ''} />
            <small className="hint">Mindestens 8 Zeichen{user ? '. Leer lassen, um das Passwort nicht zu ändern.' : '.'}</small>
          </label>
          <label htmlFor="u-aktiv" className="check wide">
            <input id="u-aktiv" type="checkbox" checked={v.aktiv} onChange={(e) => set('aktiv', e.target.checked)} />
            <span>Konto aktiv<small className="hint">Gesperrte Benutzer können sich nicht anmelden.</small></span>
          </label>
        </div>

        <fieldset className="project-pick">
          <legend>Zugewiesene Projekte{v.project_ids.length > 0 && ` (${v.project_ids.length})`}</legend>
          <p className={`pick-note small ${seesAll ? 'is-info' : 'muted'}`}>
            <Icon name="info" size={14} />
            {seesAll
              ? 'Die gewählte Rolle darf „Alle Projekte sehen“ – die Zuweisung hat daher derzeit keine Wirkung.'
              : 'Die Zuweisung wirkt nur, wenn die Rolle nicht „Alle Projekte sehen“ hat: Der Benutzer sieht dann ausschließlich diese Projekte.'}
          </p>
          {projects.length === 0 ? <p className="muted small">Noch keine Projekte vorhanden.</p> : (
            <div className="pick-list">
              {projects.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={v.project_ids.includes(p.id)} onChange={() => toggleProject(p.id)} />
                  <span>{p.name}{p.kunde && <small className="hint">{p.kunde}</small>}</span>
                </label>
              ))}
            </div>
          )}
          {hidden > 0 && <p className="muted small">Zusätzlich {hidden} für Sie nicht sichtbare(s) Projekt(e) – bleiben zugewiesen.</p>}
        </fieldset>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

function RoleDialog({ role, roles, onClose, onSaved }: { role: Role | null; roles: Role[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState(role?.name ?? '');
  const [beschreibung, setBeschreibung] = useState(role?.beschreibung ?? '');
  const [copyFrom, setCopyFrom] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Beim Umbenennen bleiben die gespeicherten Rechte; offene Matrix-Änderungen werden nicht mitgespeichert.
      const body: RoleInput = { id: role?.id, name: name.trim(), beschreibung: beschreibung.trim(), permissions: role?.permissions ?? roles.find((r) => r.id === copyFrom)?.permissions ?? [] };
      await api.admin.saveRole(body);
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={role ? 'Rolle bearbeiten' : 'Neue Rolle'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label htmlFor="r-name" className="wide"><span>Name *</span><input id="r-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bauleitung" /></label>
          <label htmlFor="r-desc" className="wide"><span>Beschreibung</span><textarea id="r-desc" rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} /></label>
          {!role && (
            <label htmlFor="r-copy" className="wide">
              <span>Rechte übernehmen von</span>
              <select id="r-copy" value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))}>
                <option value={0}>– keine (leer starten) –</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <small className="hint">Die Rechte lassen sich danach in der Matrix anpassen.</small>
            </label>
          )}
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
