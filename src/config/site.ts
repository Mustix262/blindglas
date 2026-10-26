/**
 * Öffentliche Adresse der Website – für Link-Vorschau, Suchmaschinen und die URL-Prüfung im Build.
 * Mit eigener Domain hier z. B. 'https://lastcall-spiel.de/' eintragen (mit Schrägstrich am Ende).
 */
export const SITE_URL = 'https://mustix262.github.io/last-call/';

export const SITE = {
  title: 'Last Call – Partyspiel fürs Handy',
  description:
    'Partyspiel für 2–6 Leute: Das Handy füllt die Gläser, nur es weiß, was drin ist. Alkoholfrei oder mit Alkoholmodus ab 18. Kostenlos, ohne Anmeldung, läuft offline.',
  image: 'og-image.png',
  imageAlt: 'Pixel-Schnapsglas und Schriftzug LAST CALL',
};

export const siteHost = () => new URL(SITE_URL).host;
