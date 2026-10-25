/**
 * Findet externe URLs in Build-Dateien und prüft sie gegen eine Erlaubnisliste.
 *
 * - REQUEST_HOSTS: dürfen zur Laufzeit angefragt werden (und nur unter Bedingungen,
 *   die der App-Code sicherstellt: Statistik nach Einwilligung, Formspree beim Absenden).
 * - TEXT_HOSTS: tauchen nur als Text oder Link auf, es wird nie etwas von dort geladen
 *   (SVG-Namensraum, Lizenztexte, Fehlermeldungen von Workbox, Links in der Datenschutzerklärung).
 */
export const REQUEST_HOSTS = ['formspree.io', 'goatcounter.com'];

export const TEXT_HOSTS = [
  'www.w3.org', // SVG-Namensraum, kein Request
  'scripts.sil.org', // Text in der Schriftlizenz (OFL)
  'bit.ly', // Hinweistext in einer Workbox-Fehlermeldung
  'www.lda.bayern.de', // Link zur Aufsichtsbehörde
  'docs.github.com', // Link zur GitHub-Datenschutzerklärung
  'www.dataprivacyframework.gov', // Link zum EU-US Data Privacy Framework
  'www.apple.com', // Link zur Apple-Datenschutzrichtlinie
];

export interface Finding {
  file: string;
  url: string;
  host: string;
  allowed: boolean;
}

// Semikolon und Komma beenden eine URL (z. B. in der CSP: "https://formspree.io;")
const URL_RE = /https?:\/\/[^\s"'`<>);,\\]+/g;

/** Host einer gefundenen URL; Template-Platzhalter wie ${code} werden neutralisiert. */
export function hostOf(url: string): string {
  const rest = url.replace(/^https?:\/\//, '').replace(/\$\{[^}]*\}/g, 'x');
  return rest.split(/[/?#:]/)[0].toLowerCase();
}

const matches = (host: string, allowed: string) => host === allowed || host.endsWith(`.${allowed}`);

export function isAllowedHost(host: string): boolean {
  return [...REQUEST_HOSTS, ...TEXT_HOSTS].some((a) => matches(host, a));
}

export function scanText(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    const host = hostOf(url);
    if (host === 'localhost' || host === '') continue;
    out.push({ file, url, host, allowed: isAllowedHost(host) });
  }
  return out;
}

/** HTML und CSS dürfen gar keine externen Ressourcen einbinden (außer in der CSP selbst). */
export function scanMarkup(file: string, text: string): Finding[] {
  const stripped = text.replace(/<meta[^>]+Content-Security-Policy[^>]*>/gi, '');
  const refs = [...stripped.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']|url\(\s*["']?(https?:\/\/[^"')]+)/gi)];
  return refs.map((m) => {
    const url = m[1] ?? m[2];
    return { file, url, host: hostOf(url), allowed: false };
  });
}
