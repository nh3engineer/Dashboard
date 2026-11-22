# Projekt-Dashboard

Web-Anwendung für den Soll-/Ist-Vergleich von Projekten: Fortschritt, Terminplan und Kosten.

## Funktionen

- **Projektübersicht** – Kennzahlen über alle Projekte, Ampeln für Termin und Kosten, Zeitplan und Kostenvergleich je Projekt, Suche und Statusfilter
- **Projektdetail** – Kennzahlen (Fortschritt Soll/Ist, Terminverzug, Budget, Ist-Kosten, Prognose Endkosten, SPI/CPI)
- **Terminplan** – Gantt-Diagramm mit Soll- und Ist-Balken, Phasen und Meilensteine pflegen
- **Kosten** – kumulierter Soll-/Ist-Verlauf mit Budgetlinie, Auswertung nach Kategorie, Plan- und Ist-Positionen pflegen
- **Export/Import** – kompletter Datenbestand als JSON-Datei (Sicherung, Übertragung)
- Helles und dunkles Farbschema

## Starten

Voraussetzung: Node.js ab Version 22.13.

```bash
npm install
```

Entwicklung (API auf Port 3001, Oberfläche auf http://localhost:5173):

```bash
npm run dev
```

Produktivbetrieb (alles auf http://localhost:3001):

```bash
npm run build
```

```bash
npm start
```

Beim ersten Start werden Beispieldaten angelegt (abschaltbar mit `SEED=false`).
`npm run seed` setzt die Datenbank auf die Beispieldaten zurück.

## Daten

Die Daten liegen in einer SQLite-Datei (`data/dashboard.db`, Pfad änderbar über `DB_PATH`).
Es wird das in Node.js eingebaute `node:sqlite` verwendet – kein separater Datenbankserver nötig.

| Tabelle    | Inhalt                                                          |
|------------|-----------------------------------------------------------------|
| `projects` | Stammdaten, Soll-Termine, Budget                                |
| `tasks`    | Phasen und Meilensteine mit Soll-/Ist-Terminen und Fortschritt  |
| `costs`    | Kostenpositionen mit Datum, Kategorie, Art (`soll`/`ist`)       |

Die REST-Schnittstelle (`/api/projects`, `/api/tasks`, `/api/costs`, jeweils POST/PUT/DELETE,
sowie `/api/data`, `/api/export`, `/api/import`) kann auch von anderen Systemen befüllt werden.

## Kennzahlen

- **Fortschritt Soll** – Anteil der bis heute geplanten Leistung, gewichtet nach Plandauer der Phasen
- **Fortschritt Ist** – gemeldeter Fortschritt der Phasen, gleich gewichtet
- **Terminverzug** – größter Verzug der noch offenen Phasen/Meilensteine in Tagen
- **SPI** = Ist-Fortschritt / Soll-Fortschritt, **CPI** = Leistungswert / Ist-Kosten (Leistungswert = Budget × Ist-Fortschritt)
- **Prognose Endkosten** = Budget / CPI
- **Ampeln** – Termin: bis 3 Tage grün, bis 14 Tage gelb, darüber rot. Kosten: Prognose bis +2 % grün, bis +10 % gelb, darüber rot

Die Anwendung hat keine Benutzeranmeldung und ist für den Betrieb im internen Netz gedacht.
