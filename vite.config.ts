import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { findPlaceholders, LEGAL } from './src/config/legal.ts';

// Auf GitHub Pages liegt die App unter /<repo-name>/ – der Workflow setzt BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

/**
 * Nur eigene Dateien. Ausnahmen (nur als Verbindung, kein Skript):
 * GoatCounter (erst nach Einwilligung) und Formspree (erst beim Absenden des Kontaktformulars).
 * 'unsafe-inline' bei Styles ist nötig für einzelne style-Attribute (z. B. Flaschendrehen).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://*.goatcounter.com https://formspree.io",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Setzt die CSP als <meta>-Tag – nur im Build, damit der Entwicklungsserver (Hot Reload) weiter läuft. */
const csp = (): Plugin => ({
  name: 'last-call-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

/** Warnt deutlich, solange in src/config/legal.ts noch Platzhalter stehen. */
const legalPlaceholders = (): Plugin => ({
  name: 'last-call-legal-placeholders',
  apply: 'build',
  buildStart() {
    const open = findPlaceholders(LEGAL);
    if (!open.length) return;
    const line = '!'.repeat(64);
    console.warn(
      `\n\x1b[33m${line}\n  ACHTUNG: In src/config/legal.ts stehen noch Platzhalter:\n${open
        .map((k) => `    - ${k}`)
        .join('\n')}\n  Kontaktformular bzw. Statistik bleiben bis dahin abgeschaltet.\n${line}\x1b[0m\n`,
    );
  },
});

export default defineConfig({
  base,
  plugins: [
    csp(),
    legalPlaceholders(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Last Call',
        short_name: 'Last Call',
        description: 'Partyspiel für 2–6: Was ist im Glas? Nur das Handy weiß es.',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#070506',
        theme_color: '#070506',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
