import { goatcounterEndpoint, LEGAL } from '../config/legal';
import { statsChoice, type KeyValueStore } from './consent';

/**
 * Anonyme Besucherstatistik über GoatCounter – ausschließlich nach Einwilligung.
 * Es wird KEIN fremdes Skript geladen: Ein Seitenaufruf wird mit einem einzigen,
 * cookielosen Request an den GoatCounter-Zähl-Endpunkt gemeldet.
 */
export interface StatsEnv {
  store: KeyValueStore;
  fetch: (url: string, init: RequestInit) => Promise<unknown>;
  /** Do-Not-Track / Global Privacy Control */
  doNotTrack: boolean;
  online: boolean;
  screenWidth: number;
  goatcounterCode?: string;
}

export function browserDoNotTrack(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return n.doNotTrack === '1' || w.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true;
}

/** Ist GoatCounter eingerichtet? Sonst gibt es keine Statistik – und auch keine Frage danach. */
export const statsConfigured = (code: string = LEGAL.goatcounterCode) =>
  goatcounterEndpoint({ goatcounterCode: code }) !== null;

/** Darf gerade überhaupt gezählt werden? */
export function statsAllowed(env: Pick<StatsEnv, 'store' | 'doNotTrack' | 'goatcounterCode'>): boolean {
  const code = env.goatcounterCode ?? LEGAL.goatcounterCode;
  return statsChoice(env.store) === 'ja' && !env.doNotTrack && goatcounterEndpoint({ goatcounterCode: code }) !== null;
}

/** Meldet einen Seitenaufruf. Gibt zurück, ob ein Request abgeschickt wurde. */
export function trackPageview(env: StatsEnv, path: string): boolean {
  if (!statsAllowed(env) || !env.online) return false;
  const endpoint = goatcounterEndpoint({ goatcounterCode: env.goatcounterCode ?? LEGAL.goatcounterCode })!;
  const params = new URLSearchParams({
    p: path,
    s: String(env.screenWidth),
    rnd: Math.random().toString(36).slice(2),
  });
  // no-cors + omit: keine Cookies, keine Antwort nötig. Fehler sind egal.
  void Promise.resolve(
    env.fetch(`${endpoint}?${params}`, { method: 'GET', mode: 'no-cors', credentials: 'omit', keepalive: true }),
  ).catch(() => {});
  return true;
}
