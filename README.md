# Erlebnispark – Prototyp

Mobile-first-Grundlage für ein 2D-Erlebnisparkspiel: TypeScript, Phaser 3, Vite und PWA. Der aktuelle Stand zeigt eine isometrische Parkkarte mit Wegen, Bäumen und Marktständen mit sichtbarer Tiefe. Erdbeerfelder werden mit ihrer Grafik aus `public/erdbeer-feld-1.webp` auf einer Fläche von 4 × 4 Plätzen dargestellt. Tippen/Klicken setzt ein Gebäude, Ziehen bewegt die Karte, die Schaltflächen und das Mausrad zoomen. Die Simulation liegt unabhängig von Phaser in `src/simulation`.

## Start

Voraussetzung: Node.js 22 oder neuer und npm.

```bash
npm install
npm run dev
```

Die angezeigte lokale URL im Browser öffnen. Im selben WLAN lässt sich die vom Entwicklungsserver angezeigte Netzwerkadresse auf dem Smartphone aufrufen, sofern die Firewall den Port zulässt. Für die Installation als PWA braucht die bereitgestellte App HTTPS oder localhost; die lokale Vite-Entwicklung dient nur zum Ausprobieren. Nach `npm install` die erzeugte `package-lock.json` mit ins Git-Repository aufnehmen; danach kann für reproduzierbare Installationen `npm ci` genutzt werden.

## Prüfungen

```bash
npm run check
npm run lint
npm test
npm run build
```

`npm run check` prüft TypeScript-Typen. `lint` prüft Code-Regeln, `test` führt den kleinen Simulationstest aus, `build` erstellt `dist/`. `npm run preview` zeigt den gebauten Stand lokal an.

## Struktur

- `src/game/`: Phaser-Darstellung und Eingabe
- `src/simulation/`: Spiellogik ohne Phaser-Abhängigkeit
- `src/main.ts` und `src/style.css`: HTML-Oberfläche und Layout
- `vite.config.ts`: Build und PWA-Manifest

## Wirtschaft anpassen

In `src/simulation/game.ts` enthält `BUILDING_ECONOMY` für jeden Gebäudetyp die Baukosten (`constructionCost`), Einnahmen pro Spielstunde (`incomePerHour`) und laufenden Ausgaben (`expensesPerHour`). Diese Werte steuern sowohl den Baukatalog als auch die Simulation. Das Startkapital lässt sich unter `INITIAL_PARK_METRICS.balance` ändern.

Spielstände werden über das Spielmenü im lokalen Browserspeicher gesichert und können im selben Browserprofil wieder geladen werden. Die PWA speichert außerdem die ausgelieferten App-Dateien. Die App erzwingt die Geräteausrichtung nicht auf jedem Browser; im Hochformat erscheint ein Drehhinweis.

Der Name und die Grafiken sind bewusst neutral gehalten. Vor einer öffentlichen Nutzung von Karls-Marke oder -Assets Rechte und Freigaben klären.
