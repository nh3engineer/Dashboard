# Projekt-Dashboard

Web-Anwendung für den Soll-/Ist-Vergleich von Projekten: Fortschritt, Terminplan, Kosten, Kennzahlen und PDF-Berichte –
mit Benutzerverwaltung, Rollen und Rechten.

## Funktionen

- **Projektübersicht** – Kennzahlen über alle sichtbaren Projekte, Ampeln für Termin und Kosten, Zeitplan, Kostenvergleich, Suche und Statusfilter
- **Projektdetail** – Reiter Übersicht, Terminplan (Gantt mit Soll-/Ist-Balken und kritischem Pfad), Kosten, Ressourcen, Änderungen, Qualität, Risiken, Feedback
- **Standard-KPIs** (Projektteam) – SPI, CPI, Fertigstellung und Meilenstein-Termintreue, Aufwand, Änderungsquote, Mängel
- **Management-KPIs** (eigene Seite „Management“ und Abschnitt im Projekt) – nur mit dem Recht `kpi.management` sichtbar
- **Berichte** – sieben PDF-Berichte, auswählbar in einem Feld, mit Vorschau
- **Verwaltung** – Benutzer, Rollen und Rechte-Matrix; Projekte je Benutzer zuweisen (z. B. Zugang für Kunde/Bauherr)
- **Export/Import** – alle Fachdaten als JSON-Datei (Sicherung, Übertragung)
- Helles und dunkles Farbschema, am Handy bedienbar

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
`npm run seed` setzt die Fachdaten auf die Beispieldaten zurück; Benutzer und Rollen bleiben, Projektzuweisungen entfallen.

| Variable      | Bedeutung                                                                   |
|---------------|-----------------------------------------------------------------------------|
| `PORT`        | Port des Servers (Standard 3001)                                            |
| `DB_PATH`     | Pfad der SQLite-Datei (Standard `data/dashboard.db`)                        |
| `SEED`        | `false` = keine Beispieldaten beim ersten Start                             |
| `TRUST_PROXY` | hinter einem Reverse-Proxy setzen (z. B. `1`), damit die Login-Bremse die echte Client-Adresse sieht |

## Ersteinrichtung und Anmeldung

Solange es keinen Benutzer gibt, zeigt die Anwendung die Ersteinrichtung: Name, Benutzername und Passwort
(mindestens 8 Zeichen) eingeben – damit wird das Administrator-Konto angelegt. Alle weiteren Benutzer legt
der Administrator unter **Verwaltung** an.

Die Anmeldung läuft über ein Sitzungs-Cookie (httpOnly, SameSite=Strict, 12 Stunden, gleitend verlängert).
Passwörter werden mit scrypt gehasht; wiederholte Fehlversuche werden gebremst. Das eigene Passwort ändert man im Benutzermenü.
Für den Betrieb außerhalb des internen Netzes gehört ein Reverse-Proxy mit HTTPS davor.

## Rollen und Rechte

Jeder Benutzer hat genau eine Rolle. Die Rechte einer Rolle werden unter **Verwaltung → Rollen & Rechte** in einer Matrix
gesetzt; eigene Rollen lassen sich anlegen. Der Server erzwingt alle Rechte – nicht freigegebene Daten werden gar nicht ausgeliefert.

| Rolle            | Voreinstellung                                                                                   |
|------------------|--------------------------------------------------------------------------------------------------|
| Administrator    | alle Rechte, Systemrolle (nicht änder- oder löschbar)                                            |
| Geschäftsführung | alle Rechte außer Benutzerverwaltung                                                             |
| Management       | alle Projekte lesend, Standard- und Management-KPIs, Berichte                                    |
| Projektleitung   | zugewiesene Projekte bearbeiten (Termine, Kosten, Ressourcen, Änderungen, Qualität, Risiken), Standard-KPIs, Berichte |
| Kunde / Bauherr  | zugewiesene Projekte: Terminplan und Änderungen ansehen (ohne Kosten), Feedback abgeben, Berichte |

Bereiche mit je „ansehen“ und „bearbeiten“: Termine, Kosten, Ressourcen, Änderungen, Qualität, Risiken, Kundenfeedback
(zusätzlich „abgeben“). Dazu: `projekte.alle`, `projekte.bearbeiten`, `kpi.standard`, `kpi.management`,
`berichte.erstellen`, `benutzer.verwalten`, `daten.export`.

- Ohne „Alle Projekte sehen“ sieht ein Benutzer nur die ihm zugewiesenen Projekte.
- Budget und Kosten (auch Mehrkosten von Änderungen) gibt es nur mit `kosten.ansehen`, den Auftragswert nur mit `kpi.management`.
- `daten.export` ist ein Vollzugriff auf alle Fachdaten (Export enthält alles, Import ersetzt alles) – ohne Projekt- und
  Feldfilter. Der Server lässt Export und Import deshalb nur zusammen mit „Alle Projekte sehen“ zu.
- „Bearbeiten“ schließt „Ansehen“ desselben Bereichs ein; die Matrix und der Server vergeben es mit.
- Bereiche (Kapazitäten) gelten für alle Projekte. Anlegen, Ändern und Löschen braucht `ressourcen.bearbeiten`
  **und** „Alle Projekte sehen“ – die Projektleitung pflegt den Aufwand ihrer Projekte, aber keine Kapazitäten.
- Beim Import bleiben Projektzuweisungen von Benutzern am gleichnamigen Projekt, sofern der Projektname vorher und in der
  Datei eindeutig ist; nicht zuordenbare Zuweisungen entfallen und werden nach dem Import gemeldet.

## Kennzahlen

**Basis**

- **Fortschritt Soll** – Anteil der bis heute geplanten Leistung, gewichtet nach Plandauer der Phasen
- **Fortschritt Ist** – gemeldeter Fortschritt der Phasen, gleich gewichtet
- **Terminverzug** – größter Verzug der noch offenen Phasen/Meilensteine in Tagen
- **Prognose Endkosten** = Budget / CPI (mindestens die Ist-Kosten). Annahme dahinter: Kosten entstehen proportional
  zum Fortschritt. Ist der Kostenplan stark front- oder endlastig, weichen CPI und Prognose vom Soll-/Ist-Vergleich der Kosten ab.
- **Ampeln** – Termin: bis 3 Tage grün, bis 14 Tage gelb, darüber rot. Kosten: Prognose bis +2 % grün, bis +10 % gelb, darüber rot (Ist-Kosten ohne Budget: rot)

**Standard-KPIs** (`kpi.standard`)

- **SPI** = Ist-Fortschritt / Soll-Fortschritt · **CPI** = Leistungswert / Ist-Kosten (Leistungswert = Budget × Ist-Fortschritt); ab 0,95 grün, ab 0,85 gelb. Ohne Terminplan gibt es keinen SPI, ohne Budget oder Fortschritt keinen CPI
- **Meilenstein-Termintreue** = termingerecht erreichte / (fällige oder erreichte) Meilensteine; ab 90 % grün, ab 70 % gelb
- **Aufwandsabweichung** = Ist-Stunden / Soll-Stunden bis heute − 1 (laufender Monat anteilig); bis +5 % grün, bis +15 % gelb
- **Änderungsquote** = genehmigte Mehrkosten / Budget; bis 5 % grün, bis 10 % gelb (offene Anträge höchstens gelb)
- **Qualität** – offene und kritische Mängel, Nacharbeitsstunden, Behebungsquote = behobene / alle Mängel

**Management-KPIs** (`kpi.management`)

- **Deckungsbeitrag** = Auftragswert − Prognose Endkosten · **Marge** = Deckungsbeitrag / Auftragswert
- **ROI** = (Auftragswert − Prognose Endkosten) / Prognose Endkosten
- Projekte ohne Auftragswert (z. B. aus einer Datenbank der Vorversion) haben keinen Deckungsbeitrag; die Portfolio-Werte für
  Deckungsbeitrag, Marge und ROI rechnen nur mit den Projekten, bei denen ein Auftragswert hinterlegt ist
- **Budgetauslastung** = Ist-Kosten / Budget · **Gesamtkostenabweichung** = Prognose Endkosten − Budget · **Nachfinanzierung** = Summe der Überschreitungen
- **Kritischer Pfad** – größter Verzug der offenen Einträge, die als „kritischer Pfad“ markiert sind
- **Top-Risiken** – Risikowert = Wahrscheinlichkeit × Auswirkung (je 1–5); ab 8 mittel, ab 15 hoch; Eskalationen zuerst
- **Kapazität** – geplante Stunden aller Projekte je Bereich und Monat / Kapazität des Bereichs; über 100 % = Engpass
- **NPS** = Anteil Promotoren (9–10) − Anteil Detraktoren (0–6), Skala −100 bis +100

## Berichte

Unter **Berichte** (`berichte.erstellen`) Berichtstyp und gegebenenfalls Projekt wählen, dann „PDF erstellen“ oder „Vorschau“.
Jeder Bericht enthält nur, was die eigene Rolle sehen darf; Abschnitte ohne Recht entfallen.

| Bericht                 | Umfang      | angeboten mit      |
|-------------------------|-------------|--------------------|
| Projektstatusbericht    | ein Projekt | `termine.ansehen`  |
| Terminbericht           | ein Projekt | `termine.ansehen`  |
| Kostenbericht           | ein Projekt | `kosten.ansehen`   |
| Portfolio-Übersicht     | alle sichtbaren Projekte | immer |
| Management-Bericht      | alle sichtbaren Projekte | `kpi.management` |
| Risikobericht           | alle sichtbaren Projekte | `risiken.ansehen` |
| Kundenbericht (Bauherrenbericht) | ein Projekt | `termine.ansehen` – ohne interne Kennzahlen, Risiken und Ressourcen |

Die PDFs entstehen im Browser (jsPDF); es werden keine Daten an fremde Dienste gesendet.

## Daten

Die Daten liegen in einer SQLite-Datei (`data/dashboard.db`). Es wird das in Node.js eingebaute `node:sqlite`
verwendet – kein separater Datenbankserver nötig. Bestehende Datenbanken werden beim Start automatisch erweitert.

| Tabelle       | Inhalt                                                                  |
|---------------|-------------------------------------------------------------------------|
| `projects`    | Stammdaten, Soll-Termine, Budget, Auftragswert                          |
| `tasks`       | Phasen und Meilensteine mit Soll-/Ist-Terminen, Fortschritt, kritischer Pfad |
| `costs`       | Kostenpositionen mit Datum, Kategorie, Art (`soll`/`ist`)               |
| `aufwand`     | geplante und geleistete Stunden je Projekt, Bereich und Monat           |
| `bereiche`    | Organisationsbereiche mit Kapazität in Stunden pro Monat                |
| `aenderungen` | Änderungsanträge mit Status, Mehrkosten und Terminauswirkung            |
| `maengel`     | Mängel mit Schwere, Status und Nacharbeitsstunden                       |
| `risiken`     | Risiken mit Wahrscheinlichkeit, Auswirkung, Maßnahme, Eskalation        |
| `feedback`    | Kundenbewertungen 0–10 mit Kommentar                                    |

Dazu kommen `roles`, `users`, `user_projects` und `sessions`; sie sind nicht Teil von Export/Import.

Die REST-Schnittstelle (`/api/<tabelle>` mit POST/PUT/DELETE, `/api/data`, `/api/export`, `/api/import`,
`/api/auth/*`, `/api/admin/*`) verlangt eine Anmeldung und prüft dieselben Rechte wie die Oberfläche.

## Tests

```bash
node --test server/test/
```

Die Tests prüfen Anmeldung, Verwaltung, Sichtbarkeit je Rolle und die Datenbank-Migration; sie arbeiten mit temporären Datenbanken.
