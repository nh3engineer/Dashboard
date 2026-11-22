import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import type { Me } from '../types';
import { Icon, ThemeToggle } from './ui';

function AuthPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-card">
        <div className="brand auth-brand"><span className="logo" aria-hidden="true" />Projekt-Dashboard</div>
        <h1>{title}</h1>
        <p className="auth-intro">{intro}</p>
        {children}
      </div>
      <p className="auth-foot muted small">Termine, Kosten und Kennzahlen – Soll und Ist auf einen Blick.</p>
    </div>
  );
}

export function Login({ onDone, notice }: { onDone: (me: Me) => void; notice?: string }) {
  const [benutzername, setBenutzername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await api.login(benutzername.trim(), password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Anmelden" intro="Melden Sie sich mit Ihrem Benutzerkonto an.">
      <form className="auth-form" onSubmit={submit}>
        {notice && !error && <p className="auth-note" role="status"><Icon name="info" />{notice}</p>}
        <label htmlFor="login-user">
          <span>Benutzername</span>
          <input id="login-user" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus value={benutzername} onChange={(e) => setBenutzername(e.target.value)} />
        </label>
        <label htmlFor="login-pass">
          <span>Passwort</span>
          <input id="login-pass" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="auth-error" role="alert"><Icon name="alert" />{error}</p>}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>{busy ? 'Anmeldung läuft …' : 'Anmelden'}</button>
        <p className="muted small">Zugangsdaten vergessen? Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.</p>
      </form>
    </AuthPage>
  );
}

/** Erster Start: Es gibt noch keinen Benutzer – Administrator anlegen. */
export function Setup({ onDone }: { onDone: (me: Me) => void }) {
  const [v, setV] = useState({ name: '', benutzername: '', password: '', repeat: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (v.password.length < 8) return setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
    if (v.password !== v.repeat) return setError('Die beiden Passwörter stimmen nicht überein.');
    setBusy(true);
    setError('');
    try {
      onDone(await api.setup({ name: v.name.trim(), benutzername: v.benutzername.trim(), password: v.password }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthPage title="Willkommen" intro="Legen Sie zum Start das Administrator-Konto an. Weitere Benutzer, Rollen und Rechte verwalten Sie danach unter „Verwaltung“.">
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="setup-name">
          <span>Name</span>
          <input id="setup-name" name="name" autoComplete="name" required autoFocus value={v.name} onChange={set('name')} />
        </label>
        <label htmlFor="setup-user">
          <span>Benutzername</span>
          <input id="setup-user" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={v.benutzername} onChange={set('benutzername')} />
        </label>
        <label htmlFor="setup-pass">
          <span>Passwort <small className="hint">mindestens 8 Zeichen</small></span>
          <input id="setup-pass" name="new-password" type="password" autoComplete="new-password" required minLength={8} value={v.password} onChange={set('password')} />
        </label>
        <label htmlFor="setup-repeat">
          <span>Passwort wiederholen</span>
          <input id="setup-repeat" name="new-password-repeat" type="password" autoComplete="new-password" required value={v.repeat} onChange={set('repeat')} />
        </label>
        {error && <p className="auth-error" role="alert"><Icon name="alert" />{error}</p>}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>{busy ? 'Wird angelegt …' : 'Administrator anlegen'}</button>
      </form>
    </AuthPage>
  );
}
