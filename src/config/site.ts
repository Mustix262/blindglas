/**
 * Öffentliche Adresse der Website – für Link-Vorschau, Suchmaschinen und die URL-Prüfung im Build.
 * Eigene Domain (DNS bei Namecheap → GitHub Pages). Immer mit Schrägstrich am Ende.
 */
export const SITE_URL = 'https://blindglas.com/';

export const SITE = {
  title: 'Blindglas – Partyspiel fürs Handy',
  description:
    'Partyspiel für 2–6 Leute: Das Handy füllt die Gläser, nur es weiß, was drin ist. Alkoholfrei oder mit Alkoholmodus ab 18. Kostenlos, ohne Anmeldung, läuft offline.',
  image: 'og-image.png',
  imageAlt: 'Pixel-Glas und Schriftzug BLINDGLAS',
};

export const siteHost = () => new URL(SITE_URL).host;
