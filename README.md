# Last Call

Ein Trinkspiel für 2–6 Leute als Web-App fürs Handy: Das Handy füllt virtuelle Gläser mit Schnaps oder Wasser – nur es weiß, welches was ist. Pass-and-Play reihum, optional mit Shot-Limit und Sieger. Läuft komplett offline, ohne Server, ohne Tracking.

**Trinkt verantwortungsvoll. Nur für Erwachsene.**

## Entwickeln

```bash
npm install
npm run dev      # Entwicklungsserver (im WLAN auch vom Handy erreichbar)
npm test         # Unit-Tests der Spiellogik (Vitest)
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal ansehen
npm run icons    # App-Icons neu erzeugen
```

## Aufbau

- `src/game/` – reine Spiellogik ohne DOM: Verteilung, Zugreihenfolge und Spielrichtung, Items mit Zielauswahl, Ausscheiden, Rundenende. Jede Aktion liefert einen neuen Zustand plus eine Liste von Ereignissen.
- `src/ui/` – Oberfläche: Bildschirme, Overlays, Sound (Web Audio), Haptik, Speichern im `localStorage`.
- `tests/` – Vitest-Tests für die Logik.
- `.github/workflows/deploy.yml` – testet, baut und veröffentlicht auf GitHub Pages.

## Veröffentlichen auf GitHub Pages

1. Neues Repository auf GitHub anlegen (z. B. `last-call`).
2. Projekt hochladen:
   ```bash
   git init
   git add .
   git commit -m "Last Call"
   git branch -M main
   git remote add origin https://github.com/<dein-name>/last-call.git
   git push -u origin main
   ```
3. Im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
4. Unter **Actions** läuft der Workflow „Deploy auf GitHub Pages“ (Tests → Build → Deploy). Danach ist die App erreichbar unter `https://<dein-name>.github.io/last-call/`.

Jeder weitere Push auf `main` veröffentlicht automatisch eine neue Version. Die installierte App holt sich das Update beim nächsten Öffnen mit Internet.

## Aufs iPhone

1. Die GitHub-Pages-Adresse in **Safari** öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil) → **„Zum Home-Bildschirm“** → Hinzufügen.
3. Last Call einmal mit Internet starten – danach läuft es auch offline.

Hinweis: Safari auf dem iPhone unterstützt die Vibrations-API nicht. Die App nutzt dort ab iOS 18 einen Umweg über das System-Haptik-Feedback; auf älteren Versionen gibt es keine Vibration.

Lizenzen: siehe [LICENSES.md](LICENSES.md).
