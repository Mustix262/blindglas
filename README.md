# Blindglas

Ein Partyspiel für 2–6 Leute als Web-App fürs Handy: Das Handy füllt virtuelle Gläser – nur es weiß, welches was enthält. Zwei Modi: **Klassisch** (alkoholfrei, Zitrone & Limo) und **Alkoholmodus** (Schnaps & Bier, nur ab 18, mit Altersabfrage). Pass-and-Play reihum, optional mit Shot-Limit und Sieger. Läuft komplett offline, ohne Konten, ohne Cookies; Statistik nur mit Einwilligung.

**Nutzung auf eigene Verantwortung. Kein Gruppenzwang. Im Alkoholmodus verantwortungsvoll trinken und danach nie Auto fahren.**

## Entwickeln

```bash
npm install
npm run dev      # Entwicklungsserver (im WLAN auch vom Handy erreichbar)
npm test         # Unit-Tests der Spiellogik (Vitest)
npm run build    # Produktions-Build nach dist/ (prüft danach auf externe URLs)
npm run check:external  # nur die URL-Prüfung von dist/
npm run preview  # Build lokal ansehen
npm run icons    # App-Icons neu erzeugen
```

## Aufbau

- `src/game/` – reine Spiellogik ohne DOM: Verteilung, Zugreihenfolge und Spielrichtung, Items mit Zielauswahl, Ausscheiden, Rundenende. Jede Aktion liefert einen neuen Zustand plus eine Liste von Ereignissen.
- `src/ui/` – Oberfläche: Bildschirme, Overlays, Sound (Web Audio), Speichern im `localStorage`, Impressum/Datenschutz/Kontakt (`pages.ts`).
- `src/config/legal.ts` – **alle rechtlichen Angaben an einer Stelle** (Impressum, Formspree-ID, GoatCounter-Code). Der Build warnt, solange Platzhalter (`DEIN_…`) drinstehen.
- `src/legal/` – Einwilligung (Statistik, Altersabfrage), Kontaktformular, Statistik – ohne DOM, mit Tests.
- `scripts/check-build.ts` – prüft den Build auf nicht erlaubte externe URLs (erlaubt: GoatCounter nach Einwilligung, Formspree beim Absenden).
- `tests/` – Vitest-Tests für Logik und Rechtliches.
- `.github/workflows/deploy.yml` – testet, baut und veröffentlicht auf GitHub Pages.

## Veröffentlichen auf GitHub Pages

1. Neues Repository auf GitHub anlegen (z. B. `last-call`).
2. Projekt hochladen:
   ```bash
   git init
   git add .
   git commit -m "Blindglas"
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
3. Blindglas einmal mit Internet starten – danach läuft es auch offline.

Lizenzen: siehe [LICENSES.md](LICENSES.md).
