import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { findPlaceholders, LEGAL } from './src/config/legal.ts';
import { SITE, SITE_URL } from './src/config/site.ts';

// Die App liegt im Stammverzeichnis der eigenen Domain (https://blindglas.com/).
// Nur falls sie wieder in einem Unterordner laufen soll: BASE_PATH setzen, z. B. "/last-call/".
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
  name: 'blindglas-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

/** Warnt deutlich, solange in src/config/legal.ts noch Platzhalter stehen. */
const legalPlaceholders = (): Plugin => ({
  name: 'blindglas-legal-placeholders',
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

/**
 * Link-Vorschau (WhatsApp, Instagram & Co.) und Suchmaschinen:
 * Open-Graph-/Twitter-Tags, kanonische Adresse, robots.txt und sitemap.xml.
 */
const seo = (): Plugin => ({
  name: 'blindglas-seo',
  transformIndexHtml: (html) => {
    const image = new URL(SITE.image, SITE_URL).href;
    const tags = [
      `<link rel="canonical" href="${SITE_URL}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Blindglas" />`,
      `<meta property="og:locale" content="de_DE" />`,
      `<meta property="og:title" content="${SITE.title}" />`,
      `<meta property="og:description" content="${SITE.description}" />`,
      `<meta property="og:url" content="${SITE_URL}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${SITE.imageAlt}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ];
    return html
      .replace(/<title>.*<\/title>/, `<title>${SITE.title}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${SITE.description}" />`)
      .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n` });
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}</loc></url>\n</urlset>\n`,
    });
  },
});

export default defineConfig({
  base,
  plugins: [
    csp(),
    legalPlaceholders(),
    seo(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Blindglas',
        short_name: 'Blindglas',
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
