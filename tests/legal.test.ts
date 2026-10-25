import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scanMarkup, scanText } from '../scripts/external-urls.ts';
import { findPlaceholders, formspreeEndpoint, goatcounterEndpoint, LEGAL } from '../src/config/legal';
import {
  ageConfirmed,
  confirmAge,
  memoryStore,
  needsAgeCheck,
  needsStatsQuestion,
  resetAge,
  setStatsChoice,
  statsChoice,
} from '../src/legal/consent';
import { emptyContact, MAX_MESSAGE, sendContact, validateContact } from '../src/legal/contact';
import { statsAllowed, trackPageview, type StatsEnv } from '../src/legal/stats';
import { contentLabel, wording } from '../src/game/terms';

describe('Konfiguration & Platzhalter', () => {
  it('erkennt Platzhalter und leere Felder', () => {
    expect(findPlaceholders({ a: 'DEIN_X', b: { c: 'ok', d: '' }, e: 'TODO bitte' })).toEqual(['a', 'b.d', 'e']);
    expect(findPlaceholders({ a: 'Echter Wert' })).toEqual([]);
  });

  it('meldet aktuell nur Formspree-ID und GoatCounter-Code als offen', () => {
    expect(findPlaceholders(LEGAL)).toEqual(['formspreeId', 'goatcounterCode']);
  });

  it('enthält die Impressumsangaben', () => {
    expect(LEGAL.name).toBe('Sakir Mustafa Demiral');
    expect(`${LEGAL.street}, ${LEGAL.postalCity}, ${LEGAL.country}`).toBe('Burker Straße 73, 91301 Forchheim, Deutschland');
    expect(`${LEGAL.email.user}@${LEGAL.email.domain}`).toBe('m.demiral2@icloud.com');
  });

  it('baut keine Endpunkte aus Platzhaltern', () => {
    expect(formspreeEndpoint({ formspreeId: 'DEIN_FORMSPREE_ID' })).toBeNull();
    expect(formspreeEndpoint({ formspreeId: 'abcd1234' })).toBe('https://formspree.io/f/abcd1234');
    expect(goatcounterEndpoint({ goatcounterCode: 'DEIN_GOATCOUNTER_CODE' })).toBeNull();
    expect(goatcounterEndpoint({ goatcounterCode: 'lastcall' })).toBe('https://lastcall.goatcounter.com/count');
  });
});

describe('Statistik nur mit Einwilligung', () => {
  const env = (over: Partial<StatsEnv> = {}): StatsEnv & { fetch: ReturnType<typeof vi.fn> } => ({
    store: memoryStore(),
    fetch: vi.fn(() => Promise.resolve({})),
    doNotTrack: false,
    online: true,
    screenWidth: 390,
    goatcounterCode: 'lastcall',
    ...over,
  }) as StatsEnv & { fetch: ReturnType<typeof vi.fn> };

  it('fragt beim ersten Start nach', () => {
    const e = env();
    expect(needsStatsQuestion(e.store)).toBe(true);
    setStatsChoice(e.store, 'nein');
    expect(needsStatsQuestion(e.store)).toBe(false);
  });

  it('kein Request vor der Zustimmung', () => {
    const e = env();
    expect(trackPageview(e, '/')).toBe(false);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('kein Request bei „Nein“', () => {
    const e = env();
    setStatsChoice(e.store, 'nein');
    expect(trackPageview(e, '/')).toBe(false);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('nach „Ja“ genau ein cookieloser Request an GoatCounter', () => {
    const e = env();
    setStatsChoice(e.store, 'ja');
    expect(trackPageview(e, '/impressum')).toBe(true);
    expect(e.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = e.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/lastcall\.goatcounter\.com\/count\?p=%2Fimpressum&/);
    expect(init.credentials).toBe('omit');
  });

  it('nach Widerruf sofort keine Requests mehr', () => {
    const e = env();
    setStatsChoice(e.store, 'ja');
    trackPageview(e, '/');
    setStatsChoice(e.store, 'nein');
    expect(trackPageview(e, '/kontakt')).toBe(false);
    expect(e.fetch).toHaveBeenCalledTimes(1);
  });

  it('respektiert „Do Not Track“ auch mit Zustimmung', () => {
    const e = env({ doNotTrack: true });
    setStatsChoice(e.store, 'ja');
    expect(statsAllowed(e)).toBe(false);
    expect(trackPageview(e, '/')).toBe(false);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('ohne eingetragenen GoatCounter-Code passiert nichts', () => {
    const e = env({ goatcounterCode: 'DEIN_GOATCOUNTER_CODE' });
    setStatsChoice(e.store, 'ja');
    expect(trackPageview(e, '/')).toBe(false);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('übersteht einen kaputten Speicher', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
    expect(statsChoice(broken)).toBeNull();
    expect(() => setStatsChoice(broken, 'ja')).not.toThrow();
  });
});

describe('Altersabfrage', () => {
  it('nur im Alkoholmodus und nur bis zur Bestätigung', () => {
    const store = memoryStore();
    expect(needsAgeCheck('klassisch', store)).toBe(false);
    expect(needsAgeCheck('alkohol', store)).toBe(true);
    confirmAge(store);
    expect(ageConfirmed(store)).toBe(true);
    expect(needsAgeCheck('alkohol', store)).toBe(false);
  });

  it('lässt sich zurücksetzen', () => {
    const store = memoryStore();
    confirmAge(store);
    resetAge(store);
    expect(needsAgeCheck('alkohol', store)).toBe(true);
  });
});

describe('Spielmodus-Wörter', () => {
  it('klassisch ist alkoholfrei', () => {
    expect(contentLabel('schnaps', 'klassisch')).toBe('Zitrone');
    expect(contentLabel('schnaps', 'alkohol')).toBe('Schnaps');
    expect(wording('Schluck {Bier} – {Bierpause}', 'klassisch')).toBe('Schluck Limo – Limopause');
    expect(wording('Schluck {Bier} – {Bierpause}', 'alkohol')).toBe('Schluck Bier – Bierpause');
  });
});

describe('Kontaktformular', () => {
  const ok = { name: 'Anna', email: 'anna@example.org', message: 'Hallo!', website: '', consent: true };
  const env = (over: { online?: boolean; ok?: boolean; status?: number; throws?: boolean } = {}) => {
    const fetch = vi.fn(() =>
      over.throws ? Promise.reject(new Error('net')) : Promise.resolve({ ok: over.ok ?? true, status: over.status ?? 200 }),
    );
    return { fetch, online: over.online ?? true, formspreeId: 'abcd1234' };
  };

  it('validiert E-Mail und Nachricht, Name ist optional', () => {
    const empty = validateContact(emptyContact());
    expect(empty.email).toBe('Bitte gib deine E-Mail-Adresse an.');
    expect(empty.message).toBe('Bitte schreib eine Nachricht.');
    expect(empty.consent).toBeDefined();
    expect(validateContact({ ...ok, email: 'kein-at-zeichen' }).email).toBeDefined();
    expect(validateContact({ ...ok, email: 'a@b' }).email).toBeDefined();
    expect(validateContact({ ...ok, name: '' })).toEqual({});
    expect(validateContact({ ...ok, message: 'x'.repeat(MAX_MESSAGE) })).toEqual({});
    expect(validateContact({ ...ok, message: 'x'.repeat(MAX_MESSAGE + 1) }).message).toBeDefined();
  });

  it('ohne Einwilligung in die USA-Übermittlung: kein Request', async () => {
    const e = env();
    const r = await sendContact({ ...ok, consent: false }, e);
    expect(r.status).toBe('invalid');
    expect(r.status === 'invalid' && r.errors.consent).toBeTruthy();
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('kein Request bei ungültigen Eingaben', async () => {
    const e = env();
    const r = await sendContact({ ...ok, email: '' }, e);
    expect(r.status).toBe('invalid');
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('kein Request vor dem Absenden: Validieren allein schickt nichts', () => {
    const e = env();
    validateContact(ok);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('Erfolg: ein POST an Formspree mit den Feldern, ohne Honeypot', async () => {
    const e = env();
    expect(await sendContact(ok, e)).toEqual({ status: 'ok' });
    expect(e.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = e.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://formspree.io/f/abcd1234');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ name: 'Anna', email: 'anna@example.org', message: 'Hallo!' });
    expect(body.website).toBeUndefined();
    expect(body.consent).toBeUndefined();
  });

  it('Honeypot ausgefüllt: tut erfolgreich, sendet aber nichts', async () => {
    const e = env();
    expect(await sendContact({ ...ok, website: 'http://spam' }, e)).toEqual({ status: 'ok' });
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('Serverfehler und Netzwerkfehler werden gemeldet', async () => {
    expect((await sendContact(ok, env({ ok: false, status: 422 }))).status).toBe('error');
    expect((await sendContact(ok, env({ throws: true }))).status).toBe('error');
  });

  it('offline: kein Request, Ergebnis „offline“', async () => {
    const e = env({ online: false });
    expect(await sendContact(ok, e)).toEqual({ status: 'offline' });
    expect(e.fetch).not.toHaveBeenCalled();
  });

  it('ohne Formspree-ID: kein Request', async () => {
    const e = { ...env(), formspreeId: 'DEIN_FORMSPREE_ID' };
    expect(await sendContact(ok, e)).toEqual({ status: 'not-configured' });
    expect(e.fetch).not.toHaveBeenCalled();
  });
});

describe('Externe URLs', () => {
  it('erlaubt GoatCounter, Formspree und reine Text-Hosts', () => {
    const f = scanText('a.js', 'fetch(`https://${c}.goatcounter.com/count`);x="https://formspree.io/f/1";ns="http://www.w3.org/2000/svg"');
    expect(f.every((x) => x.allowed)).toBe(true);
  });

  it('liest Hosts in einer CSP korrekt (Semikolon gehört nicht dazu)', () => {
    const f = scanText('i.html', 'connect-src https://*.goatcounter.com https://formspree.io; manifest-src');
    expect(f.map((x) => x.host)).toEqual(['*.goatcounter.com', 'formspree.io']);
    expect(f.every((x) => x.allowed)).toBe(true);
  });

  it('meldet fremde Hosts', () => {
    const f = scanText('a.js', 'import "https://cdn.example.com/lib.js"; u="https://fonts.googleapis.com/css"');
    expect(f.filter((x) => !x.allowed).map((x) => x.host)).toEqual(['cdn.example.com', 'fonts.googleapis.com']);
  });

  it('HTML/CSS dürfen keine externen Ressourcen einbinden', () => {
    expect(scanMarkup('i.html', '<link href="https://fonts.googleapis.com/x" rel="stylesheet">')).toHaveLength(1);
    expect(scanMarkup('s.css', '@font-face{src:url(https://x.org/f.woff2)}')).toHaveLength(1);
    expect(scanMarkup('i.html', '<link href="./assets/a.css"><meta http-equiv="Content-Security-Policy" content="connect-src https://formspree.io">')).toHaveLength(0);
  });

  it.skipIf(!existsSync('dist'))('der aktuelle Build enthält keine unerlaubten URLs', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const files = walk('dist').filter((f) => /\.(html|css|js|webmanifest)$/.test(f));
    const bad = files.flatMap((f) => {
      const t = readFileSync(f, 'utf8');
      return [...scanText(f, t), ...(/\.(html|css)$/.test(f) ? scanMarkup(f, t) : [])].filter((x) => !x.allowed);
    });
    expect(bad).toEqual([]);
  });
});
