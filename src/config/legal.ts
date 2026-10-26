/**
 * Zentrale Angaben für Impressum, Datenschutzerklärung, Kontaktformular und Statistik.
 * Alles, was mit "DEIN_" beginnt, ist ein Platzhalter – der Build warnt, solange einer übrig ist.
 */
export interface LegalConfig {
  name: string;
  street: string;
  postalCity: string;
  country: string;
  email: { user: string; domain: string };
  formspreeId: string;
  goatcounterCode: string;
  authority: { name: string; address: string; url: string };
}

export const LEGAL: LegalConfig = {
  name: 'Sakir Mustafa Demiral',
  street: 'Burker Straße 73',
  postalCity: '91301 Forchheim',
  country: 'Deutschland',
  /** E-Mail in Teilen, damit sie nicht am Stück im Code steht (Spam-Schutz). */
  email: { user: 'm.demiral2', domain: 'icloud.com' },
  /** Formspree-Formular-ID, z. B. "xyzabcde" aus https://formspree.io/f/xyzabcde */
  formspreeId: 'mdeeeoyn',
  /** GoatCounter-Code, z. B. "mdemiral" für https://mdemiral.goatcounter.com */
  goatcounterCode: 'mdemiral',
  /** Für mich zuständige Datenschutz-Aufsichtsbehörde. */
  authority: {
    name: 'Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)',
    address: 'Promenade 18, 91522 Ansbach',
    url: 'https://www.lda.bayern.de',
  },
};

const PLACEHOLDER = /^DEIN_|TODO|XXX|PLATZHALTER/i;

/** Liefert die Namen aller Felder, in denen noch ein Platzhalter steht. */
export function findPlaceholders(cfg: unknown, path = ''): string[] {
  if (typeof cfg === 'string') return PLACEHOLDER.test(cfg) || cfg.trim() === '' ? [path] : [];
  if (cfg && typeof cfg === 'object') {
    return Object.entries(cfg).flatMap(([k, v]) => findPlaceholders(v, path ? `${path}.${k}` : k));
  }
  return [];
}

export const isPlaceholder = (value: string) => PLACEHOLDER.test(value) || value.trim() === '';

export const formspreeEndpoint = (cfg: Pick<LegalConfig, 'formspreeId'> = LEGAL) =>
  isPlaceholder(cfg.formspreeId) ? null : `https://formspree.io/f/${cfg.formspreeId}`;

export const goatcounterEndpoint = (cfg: Pick<LegalConfig, 'goatcounterCode'> = LEGAL) =>
  isPlaceholder(cfg.goatcounterCode) ? null : `https://${cfg.goatcounterCode}.goatcounter.com/count`;
