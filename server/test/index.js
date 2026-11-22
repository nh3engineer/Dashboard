// Einstieg für "node --test server/test/": Node (ab 21) behandelt ein Verzeichnis nicht als Suchpfad,
// sondern lädt dessen index.js. Jede Testdatei braucht einen eigenen Prozess (eigene DB über DB_PATH).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
// Bei "node --test" ohne Pfad findet Node die Testdateien selbst – dann hier nichts doppelt ausführen
const viaDirectory = basename(process.argv[1] ?? '') !== 'index.js';

if (viaDirectory) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // sonst liefert der Kindprozess kein lesbares Ergebnis
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
    test(file, () => {
      const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', join(dir, file)], { env, encoding: 'utf8' });
      assert.equal(run.status, 0, `\n${run.stdout}\n${run.stderr}`);
    });
  }
}
