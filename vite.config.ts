import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Auf GitHub Pages liegt die App unter /<repo-name>/ – der Workflow setzt BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Last Call',
        short_name: 'Last Call',
        description: 'Trinkspiel für 2–6: Schnaps oder Wasser – nur das Handy weiß es.',
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
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
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
