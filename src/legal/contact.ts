import { formspreeEndpoint, LEGAL } from '../config/legal';

/**
 * Kontaktformular. Bis zum Absenden passiert nichts im Netz – erst `sendContact`
 * schickt die Daten per fetch an Formspree (kein Formspree-Skript, kein iframe).
 */
export const MAX_MESSAGE = 2000;

export interface ContactFields {
  name: string;
  email: string;
  message: string;
  /** Honeypot: für Menschen unsichtbar, Bots füllen es aus. */
  website: string;
}

export type ContactErrors = Partial<Record<'email' | 'message' | 'name', string>>;

export type SendResult =
  | { status: 'ok' }
  | { status: 'invalid'; errors: ContactErrors }
  | { status: 'offline' }
  | { status: 'error'; message: string }
  | { status: 'not-configured' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emptyContact = (): ContactFields => ({ name: '', email: '', message: '', website: '' });

export function validateContact(f: ContactFields): ContactErrors {
  const errors: ContactErrors = {};
  if (!f.email.trim()) errors.email = 'Bitte gib deine E-Mail-Adresse an.';
  else if (!EMAIL.test(f.email.trim())) errors.email = 'Das sieht nicht nach einer gültigen E-Mail-Adresse aus.';
  if (!f.message.trim()) errors.message = 'Bitte schreib eine Nachricht.';
  else if (f.message.length > MAX_MESSAGE) errors.message = `Höchstens ${MAX_MESSAGE} Zeichen.`;
  if (f.name.length > 100) errors.name = 'Der Name ist zu lang.';
  return errors;
}

export interface ContactEnv {
  fetch: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;
  online: boolean;
  formspreeId?: string;
}

export async function sendContact(f: ContactFields, env: ContactEnv): Promise<SendResult> {
  const errors = validateContact(f);
  if (Object.keys(errors).length) return { status: 'invalid', errors };
  // Honeypot ausgefüllt → Bot. Tun wir so, als hätte es geklappt, senden aber nichts.
  if (f.website.trim()) return { status: 'ok' };
  const endpoint = formspreeEndpoint({ formspreeId: env.formspreeId ?? LEGAL.formspreeId });
  if (!endpoint) return { status: 'not-configured' };
  if (!env.online) return { status: 'offline' };
  try {
    const res = await env.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        name: f.name.trim(),
        email: f.email.trim(),
        message: f.message.trim(),
        _subject: 'Last Call – Kontaktformular',
      }),
    });
    if (res.ok) return { status: 'ok' };
    return { status: 'error', message: `Der Server hat mit Fehler ${res.status} geantwortet.` };
  } catch {
    return { status: 'error', message: 'Die Verbindung ist fehlgeschlagen.' };
  }
}
