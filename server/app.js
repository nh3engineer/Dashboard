import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRow, deleteRow, updateRow, visibleData } from './access.js';
import { adminRouter } from './admin.js';
import { authenticate, authRouter, requireLogin, requirePermission } from './auth.js';
import { exportAll, importAll, TABLES } from './db.js';
import { HttpError } from './errors.js';

/** Baut die Express-App, ohne zu lauschen (index.js startet sie, die Tests binden sie an einen freien Port). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Hinter einem Reverse-Proxy: TRUST_PROXY=1 setzen, damit die Login-Bremse die echte Client-Adresse sieht
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '10mb' }));
  api.use(authenticate);
  api.use('/auth', authRouter);
  // Ab hier nur noch angemeldet
  api.use(requireLogin);

  api.get('/data', (req, res) => res.json(visibleData(req.user)));
  // Sicherung = gesamter Bestand ohne Projekt- und Feldfilter, deshalb nur zusammen mit "alle Projekte"
  const fullAccess = [requirePermission('daten.export'), requirePermission('projekte.alle')];
  api.get('/export', fullAccess, (_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="projekt-dashboard-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportAll());
  });
  api.post('/import', fullAccess, (req, res) => {
    const { entfallen } = importAll(req.body);
    res.setHeader('X-Zuweisungen-Entfallen', String(entfallen));
    res.json(visibleData(req.user));
  });

  for (const table of TABLES) {
    api.post(`/${table}`, (req, res) => res.status(201).json(createRow(req.user, table, req.body)));
    api.put(`/${table}/:id`, (req, res) => res.json(updateRow(req.user, table, Number(req.params.id), req.body)));
    api.delete(`/${table}/:id`, (req, res) => {
      deleteRow(req.user, table, Number(req.params.id));
      res.status(204).end();
    });
  }

  api.use('/admin', requirePermission('benutzer.verwalten'), adminRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Unbekannte Schnittstelle')));

  api.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    // Fehler des JSON-Parsers (ungültiges JSON, zu groß)
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Die Datei ist zu groß (maximal 10 MB)' });
    if (err.status >= 400 && err.status < 500) return res.status(400).json({ error: 'Ungültige Anfrage' });
    if (/UNIQUE constraint failed/.test(err.message)) return res.status(400).json({ error: 'Der Name ist bereits vergeben' });
    console.error(err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  });
  app.use('/api', api);

  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(resolve(dist, 'index.html')) : next()));
  }
  return app;
}
