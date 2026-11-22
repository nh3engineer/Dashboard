import { createApp } from './app.js';
import { all } from './db.js';
import { seed } from './seed.js';

if (all('projects').length === 0 && process.env.SEED !== 'false') seed();

const port = Number(process.env.PORT) || 3001;
// Express 5 ruft den Callback auch im Fehlerfall auf (z. B. Port belegt) – sonst endet der Prozess kommentarlos.
createApp().listen(port, (err) => {
  if (!err) return console.log(`Projekt-Dashboard läuft auf http://localhost:${port}`);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} ist bereits belegt – läuft das Dashboard schon in einem anderen Fenster?`);
    console.error('Dort mit Strg+C beenden oder einen anderen Port wählen, z. B. unter Windows:  set PORT=3002 && npm start');
  } else {
    console.error(`Start fehlgeschlagen: ${err.message}`);
  }
  process.exit(1);
});
