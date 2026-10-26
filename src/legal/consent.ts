/**
 * Einwilligungen, die pro Gerät gespeichert werden:
 * - Statistik (GoatCounter): nur nach ausdrücklichem „Ja“
 * - Altersbestätigung für den Alkoholmodus
 */

/** Minimal-Schnittstelle von localStorage – in Tests ersetzbar. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Schlüssel stammen noch vom alten Namen „Last Call“ – bleiben so, damit Entscheidungen erhalten bleiben
export const STATS_KEY = 'lastcall.stats.v1';
export const AGE_KEY = 'lastcall.age18.v1';

export type StatsChoice = 'ja' | 'nein';

/** Sicherer Zugriff: Private-Modus o. Ä. darf die App nicht abstürzen lassen. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function browserStore(): KeyValueStore {
  return safe(() => window.localStorage, memoryStore());
}

export function statsChoice(store: KeyValueStore): StatsChoice | null {
  const v = safe(() => store.getItem(STATS_KEY), null);
  return v === 'ja' || v === 'nein' ? v : null;
}

export const setStatsChoice = (store: KeyValueStore, choice: StatsChoice) =>
  safe(() => store.setItem(STATS_KEY, choice), undefined);

/** Beim allerersten Start muss gefragt werden. */
export const needsStatsQuestion = (store: KeyValueStore) => statsChoice(store) === null;

export const ageConfirmed = (store: KeyValueStore) => safe(() => store.getItem(AGE_KEY), null) === 'ja';

export const confirmAge = (store: KeyValueStore) => safe(() => store.setItem(AGE_KEY, 'ja'), undefined);

export const resetAge = (store: KeyValueStore) => safe(() => store.removeItem(AGE_KEY), undefined);

/** Der Alkoholmodus braucht eine Altersbestätigung, der klassische (alkoholfreie) nie. */
export const needsAgeCheck = (mode: 'klassisch' | 'alkohol', store: KeyValueStore) =>
  mode === 'alkohol' && !ageConfirmed(store);
