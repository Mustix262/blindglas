import type { GameEvent, GameState, Settings } from '../game/types';

const GAME_KEY = 'lastcall.game.v1';
const PREFS_KEY = 'lastcall.prefs.v1';

export interface SavedGame {
  state: GameState;
  /** Noch nicht angezeigte Ereignisse (z. B. ein Geheimnis, das gerade übergeben wird). */
  queue: GameEvent[];
  barkeeperDone: boolean;
}

export interface Prefs {
  muted: boolean;
  lastSettings: Settings | null;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privater Modus o. Ä. – Spiel läuft trotzdem, nur ohne Speichern.
  }
}

export function loadGame(): SavedGame | null {
  const saved = read<SavedGame>(GAME_KEY);
  return saved?.state?.version === 1 ? saved : null;
}

export const saveGame = (g: SavedGame | null) => write(GAME_KEY, g);

export const loadPrefs = (): Prefs => ({ muted: false, lastSettings: null, ...read<Prefs>(PREFS_KEY) });

export const savePrefs = (p: Prefs) => write(PREFS_KEY, p);
