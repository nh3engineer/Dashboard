import { createApp } from './app.js';
import { all } from './db.js';
import { seed } from './seed.js';

if (all('projects').length === 0 && process.env.SEED !== 'false') seed();

const port = Number(process.env.PORT) || 3001;
createApp().listen(port, () => console.log(`Projekt-Dashboard läuft auf http://localhost:${port}`));
