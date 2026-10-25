/*
 * HINWEIS (nicht in der App sichtbar):
 * Die Datenschutzerklärung unten ist ein sorgfältig erstellter Entwurf, aber keine Rechtsberatung.
 * Vor der Veröffentlichung mit einem Generator (z. B. https://datenschutz-generator.de) abgleichen
 * und prüfen, ob GitHub und Formspree aktuell unter dem EU-US Data Privacy Framework zertifiziert
 * sind (Liste: https://www.dataprivacyframework.gov/list).
 */
import { LEGAL } from '../config/legal';
import { MAX_MESSAGE, type ContactErrors, type ContactFields } from '../legal/contact';

export type Route = 'impressum' | 'datenschutz' | 'kontakt';

export const ROUTES: Route[] = ['impressum', 'datenschutz', 'kontakt'];

export const routeFromHash = (hash: string): Route | null => {
  const r = hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : null;
};

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** E-Mail wird erst im Browser zusammengesetzt; der mailto-Link entsteht erst beim Antippen. */
export const mailLink = () =>
  `<a href="#" class="mail" data-act="mail">${LEGAL.email.user}<span>@</span>${LEGAL.email.domain}</a>`;

const link = (route: Route, label: string) => `<a href="#/${route}" data-act="route" data-arg="${route}">${label}</a>`;

const ext = (url: string, label: string) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;

export const LIABILITY =
  'Die Nutzung von „Last Call“ erfolgt auf eigene Verantwortung. Niemand muss mitspielen oder trinken – kein Gruppenzwang. Im Alkoholmodus gilt: verantwortungsvoll trinken, Wasser zwischendurch, und danach nie Auto fahren.';

const address = () => `${esc(LEGAL.name)}<br>${esc(LEGAL.street)}<br>${esc(LEGAL.postalCity)}<br>${esc(LEGAL.country)}`;

export function impressumHtml() {
  return `
  <h1 class="page-title">Impressum</h1>
  <h2>Angaben gemäß § 5 DDG</h2>
  <p>${address()}</p>
  <h2>Kontakt</h2>
  <p>E-Mail: ${mailLink()}<br>Kontaktformular: ${link('kontakt', 'Zum Kontaktformular')}</p>
  <h2>Haftungshinweis</h2>
  <p>${LIABILITY}</p>
  <p>Für Inhalte externer Links (z. B. in der Datenschutzerklärung) sind ausschließlich deren Betreiber verantwortlich.</p>
  <p class="muted small">Siehe auch die ${link('datenschutz', 'Datenschutzerklärung')}.</p>`;
}

export function datenschutzHtml() {
  return `
  <h1 class="page-title">Datenschutzerklärung</h1>
  <p>Kurz gesagt: „Last Call“ läuft komplett auf deinem Gerät. Es gibt keine Konten, keine Cookies und keine Werbung. Daten verlassen dein Gerät nur beim Laden der Website, wenn du der anonymen Statistik zustimmst oder wenn du mir über das Kontaktformular oder per E-Mail schreibst.</p>

  <h2>1. Verantwortlicher</h2>
  <p>${address()}<br>E-Mail: ${mailLink()}</p>

  <h2>2. Hosting über GitHub Pages</h2>
  <p>Diese Website wird über GitHub Pages bereitgestellt (GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA). Beim Aufruf der Seite verarbeitet GitHub technisch notwendige Daten, insbesondere deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Datei, Browser- und Betriebssystemangaben, und speichert sie in Server-Logs. Das ist nötig, um die Website sicher und zuverlässig auszuliefern.</p>
  <p>Rechtsgrundlage ist mein berechtigtes Interesse an einer sicheren und stabilen Bereitstellung der Website (Art. 6 Abs. 1 lit. f DSGVO). Dabei können Daten in die USA übermittelt werden. GitHub ist nach dem EU-US Data Privacy Framework zertifiziert, sodass für die Übermittlung ein Angemessenheitsbeschluss der EU-Kommission besteht (Art. 45 DSGVO). Mehr dazu: ${ext('https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement', 'Datenschutzerklärung von GitHub')}.</p>

  <h2>3. Kontaktformular (Formspree)</h2>
  <p>Wenn du das ${link('kontakt', 'Kontaktformular')} abschickst, werden deine Angaben – Name (freiwillig), E-Mail-Adresse und Nachricht – sowie technisch bedingt deine IP-Adresse an den Dienst Formspree (Formspree Inc., USA) übermittelt, der mir die Nachricht per E-Mail weiterleitet. Eine Verbindung zu Formspree entsteht erst beim Absenden, vorher nicht.</p>
  <p>Zweck ist ausschließlich die Beantwortung deiner Anfrage. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit deine Anfrage auf einen Vertrag oder vorvertragliche Maßnahmen zielt, ansonsten mein berechtigtes Interesse an der Beantwortung von Anfragen (Art. 6 Abs. 1 lit. f DSGVO). Für die Übermittlung in die USA stützt sich Formspree auf das EU-US Data Privacy Framework bzw., soweit keine Zertifizierung besteht, auf Standardvertragsklauseln der EU-Kommission (Art. 46 DSGVO). Ich speichere deine Angaben nur, bis deine Anfrage erledigt ist, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>

  <h2>4. Kontakt per E-Mail (iCloud)</h2>
  <p>Schreibst du mir per E-Mail (auch Antworten auf Kontaktanfragen), wird die Nachricht über meinen E-Mail-Anbieter iCloud Mail (Apple Distribution International Ltd., Irland, bzw. Apple Inc., USA) verarbeitet. Ich nutze deine Angaben nur zur Beantwortung deiner Nachricht (Art. 6 Abs. 1 lit. b bzw. f DSGVO) und lösche sie, wenn die Anfrage erledigt ist. Mehr dazu: ${ext('https://www.apple.com/de/legal/privacy/', 'Datenschutzrichtlinie von Apple')}.</p>

  <h2>5. Anonyme Besucherstatistik (GoatCounter) – nur mit Einwilligung</h2>
  <p>Nur wenn du beim ersten Start oder später in den Einstellungen ausdrücklich zustimmst, meldet die App Seitenaufrufe an den Statistikdienst GoatCounter. Erfasst werden: die aufgerufene Seite (z. B. Startseite, Impressum), die Bildschirmbreite, Browser und Betriebssystem, die ungefähre Herkunft (Land) sowie die Herkunftsseite. GoatCounter verwendet <b>keine Cookies</b> und speichert keine IP-Adressen dauerhaft; aus ihnen wird nur kurzzeitig ein anonymer Wert gebildet, um mehrfache Aufrufe zu erkennen. Es wird kein fremdes Skript geladen – die App schickt nur eine einzelne Zählanfrage.</p>
  <p>Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Du kannst sie jederzeit mit Wirkung für die Zukunft widerrufen: Menü (≡) › „Statistik: aus“. Danach findet sofort keine Zählung mehr statt. Ist in deinem Browser „Do Not Track“ oder „Global Privacy Control“ aktiviert, wird auch mit Einwilligung nichts gezählt. Mehr dazu: ${ext('https://www.goatcounter.com/help/privacy', 'Datenschutz bei GoatCounter')}.</p>

  <h2>6. Speicherung auf deinem Gerät</h2>
  <p>Die App nutzt den lokalen Speicher deines Browsers (localStorage) ausschließlich für deinen Spielstand, deine Einstellungen (z. B. Namen, Ton an/aus) und deine Entscheidungen zu Statistik und Altersbestätigung. Diese Daten bleiben auf deinem Gerät und werden nicht an mich übertragen. Damit die App offline funktioniert, speichert der Browser außerdem die Programmdateien zwischen. Du kannst alles jederzeit löschen, indem du die Websitedaten in deinem Browser löschst bzw. die App vom Home-Bildschirm entfernst.</p>

  <h2>7. Deine Rechte</h2>
  <p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Eine erteilte Einwilligung kannst du jederzeit widerrufen (Art. 7 Abs. 3). Wende dich dafür einfach an mich (siehe oben).</p>
  <p>Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Für mich zuständig ist: ${esc(LEGAL.authority.name)}, ${esc(LEGAL.authority.address)}, ${ext(LEGAL.authority.url, 'www.lda.bayern.de')}.</p>

  <p class="muted small">Stand: Oktober 2026</p>`;
}

export interface ContactUi {
  fields: ContactFields;
  errors: ContactErrors;
  status: 'idle' | 'sending' | 'ok' | 'error' | 'offline' | 'not-configured';
  message: string;
}

export function kontaktHtml(c: ContactUi) {
  const err = (k: keyof ContactErrors) => (c.errors[k] ? `<span class="field-error" role="alert">${esc(c.errors[k]!)}</span>` : '');
  const notice: Record<ContactUi['status'], string> = {
    idle: '',
    sending: '<p class="form-note sending" role="status">Wird gesendet …</p>',
    ok: '<p class="form-note ok" role="status">Danke! Deine Nachricht ist angekommen. Ich melde mich per E-Mail.</p>',
    error: `<p class="form-note error" role="alert">Senden fehlgeschlagen: ${esc(c.message)} Deine Nachricht ist noch da – versuch es gleich noch einmal oder schreib mir eine E-Mail.</p>`,
    offline: '<p class="form-note error" role="alert">Du bist gerade offline. Zum Senden ist eine Internetverbindung nötig – deine Nachricht bleibt hier stehen, bis du wieder online bist.</p>',
    'not-configured': `<p class="form-note error" role="alert">Das Kontaktformular ist noch nicht eingerichtet. Schreib mir bitte direkt eine E-Mail: ${mailLink()}</p>`,
  };
  const sending = c.status === 'sending';
  return `
  <h1 class="page-title">Kontakt</h1>
  <p>Fragen, Ideen oder einen Fehler gefunden? Schreib mir gern.</p>
  <form class="contact" data-form="contact" novalidate>
    <label class="field"><span>Name (optional)</span>
      <input name="name" maxlength="100" autocomplete="name" value="${esc(c.fields.name)}">${err('name')}</label>
    <label class="field"><span>E-Mail-Adresse *</span>
      <input name="email" type="email" inputmode="email" autocomplete="email" required value="${esc(c.fields.email)}"
        aria-invalid="${!!c.errors.email}">${err('email')}</label>
    <label class="field"><span>Nachricht *</span>
      <textarea name="message" rows="6" maxlength="${MAX_MESSAGE}" required aria-invalid="${!!c.errors.message}">${esc(c.fields.message)}</textarea>
      <small class="counter"><span data-count>${c.fields.message.length}</span> / ${MAX_MESSAGE}</small>${err('message')}</label>
    <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off" value="${esc(c.fields.website)}"></label></div>
    <button class="btn primary big" type="submit" ${sending ? 'disabled' : ''}>${sending ? 'WIRD GESENDET …' : 'ABSENDEN'}</button>
    <p class="form-privacy">Deine Angaben werden nur zur Beantwortung deiner Anfrage verwendet. Mehr in der ${link('datenschutz', 'Datenschutzerklärung')}.</p>
    ${notice[c.status]}
  </form>`;
}
