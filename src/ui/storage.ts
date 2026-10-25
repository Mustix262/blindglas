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
  haptics: boolean;
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

/** Spielstände aus der 2-Spieler-Version (v1) übernehmen. */
function migrate(state: Record<string, unknown> & { version: number }): GameState | null {
  if (state.version === 2) return state as unknown as GameState;
  if (state.version !== 1) return null;
  const s = state as unknown as GameState;
  s.version = 2;
  s.players = s.players.map((p) => ({ ...p, out: false }));
  s.settings = { ...s.settings, shotLimit: null };
  s.direction = 1;
  s.beerPick = false;
  s.winner = null;
  return s;
}

export function loadGame(): SavedGame | null {
  const saved = read<SavedGame>(GAME_KEY);
  if (!saved?.state) return null;
  const state = migrate(saved.state as unknown as Record<string, unknown> & { version: number });
  return state ? { ...saved, state } : null;
}

export const saveGame = (g: SavedGame | null) => write(GAME_KEY, g);

export function loadPrefs(): Prefs {
  const p: Prefs = { muted: false, haptics: true, lastSettings: null, ...read<Prefs>(PREFS_KEY) };
  // Einstellungen aus der 2-Spieler-Version kennen noch kein Shot-Limit
  if (p.lastSettings) p.lastSettings = { ...p.lastSettings, shotLimit: p.lastSettings.shotLimit ?? null };
  return p;
}

export const savePrefs = (p: Prefs) => write(PREFS_KEY, p);
