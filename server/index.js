import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { all, exportAll, importAll, insert, remove, tables, update } from './db.js';
import { seed } from './seed.js';

if (all('projects').length === 0 && process.env.SEED !== 'false') seed();

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/api/data', (_req, res) => res.json(exportAll()));
app.get('/api/export', (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="projekt-dashboard-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(exportAll());
});
app.post('/api/import', (req, res) => {
  importAll(req.body);
  res.json(exportAll());
});

for (const table of Object.keys(tables)) {
  app.post(`/api/${table}`, (req, res) => res.status(201).json(insert(table, req.body ?? {})));
  app.put(`/api/${table}/:id`, (req, res) => {
    const row = update(table, Number(req.params.id), req.body ?? {});
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(row);
  });
  app.delete(`/api/${table}/:id`, (req, res) => {
    if (!remove(table, Number(req.params.id))) return res.status(404).json({ error: 'Nicht gefunden' });
    res.status(204).end();
  });
}

const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(resolve(dist, 'index.html')) : next()));
}

// Validierungs- und DB-Fehler als 400 an den Client
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Projekt-Dashboard läuft auf http://localhost:${port}`));
