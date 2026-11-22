import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { AppContext, type AppCtx, type FormConfig, type Route } from './app-context';
import { Admin } from './components/Admin';
import { Login, Setup } from './components/Login';
import { Management } from './components/Management';
import { Portfolio } from './components/Portfolio';
import { ProjectDetail } from './components/ProjectDetail';
import { Reports } from './components/Reports';
import { FormModal, Icon, ThemeToggle } from './components/ui';
import type { Data, Me } from './types';

function parseRoute(hash: string): Route {
  const projekt = hash.match(/^#\/projekt\/(\d+)/);
  if (projekt) return { page: 'projekt', id: Number(projekt[1]) };
  const page = hash.replace(/^#\//, '').split(/[/?]/)[0];
  return page === 'management' || page === 'berichte' || page === 'verwaltung' ? { page } : { page: 'portfolio' };
}
const toHash = (r: Route) => (r.page === 'projekt' ? `#/projekt/${r.id}` : r.page === 'portfolio' ? '#/' : `#/${r.page}`);

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function go(route: Route) {
  location.hash = toHash(route);
  window.scrollTo(0, 0);
}

type Auth = { state: 'laden' } | { state: 'fehler'; message: string } | { state: 'setup' } | { state: 'login'; notice?: string } | { state: 'ok'; me: Me };

export function App() {
  const [auth, setAuth] = useState<Auth>({ state: 'laden' });

  const check = useCallback(() => {
    setAuth({ state: 'laden' });
    api.status().then(
      (s) => setAuth(s.setupRequired ? { state: 'setup' } : s.user ? { state: 'ok', me: s.user } : { state: 'login' }),
      (e) => setAuth({ state: 'fehler', message: e.message }),
    );
  }, []);
  useEffect(check, [check]);
  useEffect(() => {
    setUnauthorizedHandler(() => setAuth((a) => (a.state === 'ok' ? { state: 'login', notice: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.' } : a)));
    return () => setUnauthorizedHandler(() => {});
  }, []);

  const signedIn = useCallback((me: Me) => setAuth({ state: 'ok', me }), []);
  const signedOut = useCallback((notice?: string) => setAuth({ state: 'login', notice }), []);

  if (auth.state === 'ok') return <Shell me={auth.me} onMe={signedIn} onSignedOut={signedOut} />;
  // Nach der Anmeldung nicht auf einer Seite landen, die dieser Benutzer gar nicht öffnen darf.
  const loggedIn = (me: Me) => {
    const needed = NAV.find((n) => n.page === parseRoute(location.hash).page)?.permission;
    if (needed && !me.permissions.includes(needed)) location.hash = '#/';
    signedIn(me);
  };
  if (auth.state === 'setup') return <Setup onDone={loggedIn} />;
  if (auth.state === 'login') return <Login onDone={loggedIn} notice={auth.notice} />;
  return (
    <div className="auth-page">
      {auth.state === 'laden' ? <p className="empty">Wird geladen …</p> : (
        <div className="auth-card">
          <h1>Keine Verbindung</h1>
          <p className="auth-intro">{auth.message}</p>
          <button className="btn primary auth-submit" onClick={check}>Erneut versuchen</button>
        </div>
      )}
    </div>
  );
}

const NAV: { page: Exclude<Route['page'], 'projekt'>; label: string; icon: string; permission?: string }[] = [
  { page: 'portfolio', label: 'Übersicht', icon: 'grid' },
  { page: 'management', label: 'Management', icon: 'chart', permission: 'kpi.management' },
  { page: 'berichte', label: 'Berichte', icon: 'file', permission: 'berichte.erstellen' },
  { page: 'verwaltung', label: 'Verwaltung', icon: 'shield', permission: 'benutzer.verwalten' },
];

const passwordFields = [
  { key: 'current', label: 'Aktuelles Passwort', type: 'password' as const, required: true, wide: true, autoComplete: 'current-password' },
  { key: 'next', label: 'Neues Passwort', type: 'password' as const, required: true, wide: true, autoComplete: 'new-password', hint: 'Mindestens 8 Zeichen' },
  { key: 'repeat', label: 'Neues Passwort wiederholen', type: 'password' as const, required: true, wide: true, autoComplete: 'new-password' },
];

function Shell({ me, onMe, onSignedOut }: { me: Me; onMe: (me: Me) => void; onSignedOut: (notice?: string) => void }) {
  const route = useRoute();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [form, setForm] = useState<FormConfig | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Lädt Daten und eigene Rechte neu – geänderte Rollen wirken so ohne neue Anmeldung.
  const reload = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.data(), api.status()]);
      if (!s.user) return onSignedOut('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.');
      setData(d);
      onMe(s.user);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [onMe, onSignedOut]);
  useEffect(() => { api.data().then(setData, (e) => setError(e.message)); }, []);

  const ctx = useMemo<AppCtx | null>(() => data && {
    me,
    data,
    can: (permission) => me.permissions.includes(permission),
    reload,
    openForm: setForm,
    remove: (table, id, what, after) => {
      if (!confirm(`${what} wirklich löschen?`)) return;
      api.remove(table, id).then(() => { after?.(); return reload(); }).catch((e) => setError(e.message));
    },
    go,
    reportError: setError,
  }, [me, data, reload]);

  async function saveForm(values: Record<string, unknown>) {
    const cfg = form!;
    const saved = await api.save(cfg.table, cfg.transform ? cfg.transform(values) : values);
    await reload();
    cfg.onSaved?.(saved);
  }

  async function importFile(file: File) {
    if (!confirm('Der Import ersetzt alle vorhandenen Projektdaten. Benutzer und Rollen bleiben erhalten. Fortfahren?')) return;
    // Meldungen eines früheren Versuchs nicht stehen lassen
    setInfo('');
    setError('');
    try {
      const { entfallen } = await api.importAll(JSON.parse(await file.text()));
      await reload();
      go({ page: 'portfolio' });
      setInfo(`Import abgeschlossen.${entfallen ? ` ${entfallen === 1 ? 'Eine Projektzuweisung' : `${entfallen} Projektzuweisungen`} von Benutzern konnte${entfallen === 1 ? '' : 'n'} keinem Projekt der Datei zugeordnet werden – bitte in der Verwaltung prüfen.` : ''}`);
    } catch (e) {
      setError(`Import fehlgeschlagen: ${e instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Sicherung.' : (e as Error).message}`);
    }
  }

  async function changePassword(v: Record<string, unknown>) {
    const next = String(v.next ?? '');
    if (next.length < 8) throw new Error('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
    if (next !== v.repeat) throw new Error('Die beiden neuen Passwörter stimmen nicht überein.');
    await api.password(String(v.current ?? ''), next);
    setInfo('Passwort geändert.');
  }

  const pickFile = () => fileInput.current?.click();
  const logout = () => api.logout().catch(() => {}).then(() => onSignedOut());
  const can = (permission?: string) => !permission || me.permissions.includes(permission);
  // Die Sicherung umfasst den gesamten Bestand – der Server verlangt dafür auch „alle Projekte“
  const backup = can('daten.export') && can('projekte.alle');
  const active = route.page === 'projekt' ? 'portfolio' : route.page;
  const needed = NAV.find((n) => n.page === active)?.permission;
  // Am Handy ist die Navigation eine wischbare Zeile – den aktiven Eintrag sichtbar halten
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = nav.current;
    const link = bar?.querySelector<HTMLElement>('.active');
    if (bar && link) bar.scrollLeft = link.offsetLeft - bar.offsetLeft - (bar.clientWidth - link.offsetWidth) / 2;
  }, [active, me.permissions]);

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/"><span className="logo" aria-hidden="true" /><span className="brand-name">Projekt-Dashboard</span></a>
        <nav className="nav" aria-label="Hauptnavigation" ref={nav}>
          {NAV.filter((n) => can(n.permission)).map((n) => (
            <a key={n.page} href={toHash({ page: n.page })} className={n.page === active ? 'active' : ''} aria-current={n.page === active ? 'page' : undefined}>
              <Icon name={n.icon} />{n.label}
            </a>
          ))}
        </nav>
        <div className="actions">
          {backup && (
            <>
              <a className="btn ghost hide-sm" href={api.exportUrl} download title="Alle Projektdaten als JSON sichern"><Icon name="download" /><span className="hide-md">Export</span></a>
              <button className="btn ghost hide-sm" onClick={pickFile} title="JSON-Sicherung einspielen"><Icon name="upload" /><span className="hide-md">Import</span></button>
              <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
            </>
          )}
          <ThemeToggle />
          <UserMenu me={me} onPassword={() => setPasswordOpen(true)} onLogout={logout} onImport={backup ? pickFile : undefined} />
        </div>
      </header>

      <main>
        {error && <div className="banner" role="alert">{error}<button className="btn ghost icon-btn" onClick={() => setError('')} aria-label="Meldung schließen"><Icon name="close" /></button></div>}
        {info && <div className="banner ok" role="status"><span><Icon name="check" /> {info}</span><button className="btn ghost icon-btn" onClick={() => setInfo('')} aria-label="Meldung schließen"><Icon name="close" /></button></div>}
        {!ctx ? (
          error ? <p className="empty"><button className="btn" onClick={() => { setError(''); reload(); }}>Erneut laden</button></p> : <p className="empty">Daten werden geladen …</p>
        ) : (
          <AppContext.Provider value={ctx}>
           <ErrorBoundary key={toHash(route)}>
            {!can(needed) ? (
              <NoAccess />
            ) : route.page === 'projekt' ? (
              ctx.data.projects.some((p) => p.id === route.id)
                ? <ProjectDetail key={route.id} projectId={route.id} />
                : <Notice icon="search" title="Projekt nicht gefunden">Das Projekt existiert nicht oder ist Ihnen nicht zugewiesen.</Notice>
            ) : route.page === 'management' ? <Management />
              : route.page === 'berichte' ? <Reports />
              : route.page === 'verwaltung' ? <Admin />
              : <Portfolio />}
           </ErrorBoundary>
          </AppContext.Provider>
        )}
      </main>

      {form && <FormModal title={form.title} fields={form.fields} initial={form.initial} onSave={saveForm} onClose={() => setForm(null)} />}
      {passwordOpen && <FormModal title="Passwort ändern" fields={passwordFields} initial={{}} onSave={changePassword} onClose={() => setPasswordOpen(false)} />}
    </>
  );
}

/** Fängt Fehler einer Ansicht ab, damit Kopfzeile und Navigation bedienbar bleiben; der Seitenwechsel setzt sie zurück (key). */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Notice icon="alert" title="Diese Ansicht konnte nicht angezeigt werden">Beim Aufbau der Seite ist ein Fehler aufgetreten. Bitte laden Sie die Seite neu; besteht der Fehler weiter, wenden Sie sich an Ihre Administratorin oder Ihren Administrator.</Notice>;
  }
}

function Notice({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="card notice">
      <span className="notice-icon"><Icon name={icon} size={22} /></span>
      <h2>{title}</h2>
      <p className="muted">{children}</p>
      <a className="btn" href="#/"><Icon name="back" />Zur Übersicht</a>
    </div>
  );
}

const NoAccess = () => (
  <Notice icon="lock" title="Kein Zugriff">
    Für diesen Bereich fehlt Ihrer Rolle die Berechtigung. Bei Bedarf schaltet Ihre Administratorin oder Ihr Administrator den Bereich frei.
  </Notice>
);

/** `onImport` nur mit daten.export; Export/Import stehen am Handy hier statt in der Kopfzeile. */
function UserMenu({ me, onPassword, onLogout, onImport }: { me: Me; onPassword: () => void; onLogout: () => void; onImport?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [open]);
  const initials = me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  return (
    <div className="usermenu" ref={ref}>
      <button className="usermenu-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Benutzermenü: ${me.name}, ${me.role.name}`}>
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="usermenu-text hide-md"><strong>{me.name}</strong><small>{me.role.name}</small></span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="usermenu-pop" role="menu">
          <div className="usermenu-head"><strong>{me.name}</strong><span className="muted small">{me.benutzername} · {me.role.name}</span></div>
          {onImport && (
            <>
              <a role="menuitem" className="show-sm" href={api.exportUrl} download onClick={() => setOpen(false)}><Icon name="download" />Daten exportieren</a>
              <button role="menuitem" className="show-sm" onClick={() => { setOpen(false); onImport(); }}><Icon name="upload" />Daten importieren</button>
            </>
          )}
          <button role="menuitem" onClick={() => { setOpen(false); onPassword(); }}><Icon name="key" />Passwort ändern</button>
          <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }}><Icon name="logout" />Abmelden</button>
        </div>
      )}
    </div>
  );
}
