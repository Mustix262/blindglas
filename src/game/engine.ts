import { dealRound, grant, hasItem } from './inventory';
import { randInt, shuffle, type Rng } from './rng';
import {
  RuleError,
  type Content,
  type Continuation,
  type GameEvent,
  type GameState,
  type Glass,
  type PlayerIndex,
  type Result,
  type Settings,
  type Target,
} from './types';

export const MIN_GLASSES = 2;
export const MAX_GLASSES = 12;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const remaining = (s: GameState): Glass[] => s.glasses.filter((g) => !g.empty);

export function glassNo(id: number): number {
  return id + 1;
}

/** Standard-Glasanzahl: Spieler × 2, höchstens 12. */
export const defaultGlassCount = (players: number) => Math.min(MAX_GLASSES, players * 2);

/** Spanne für „zufällige“ Glasanzahl. Bei 2 Spielern wie bisher 2–8. */
export function randomGlassRange(players: number): [number, number] {
  return [Math.max(MIN_GLASSES, players), Math.min(MAX_GLASSES, Math.max(8, players * 2 + 2))];
}

// ---------------------------------------------------------------- Spieler & Reihenfolge

/** Alle noch nicht ausgeschiedenen Spieler in Sitzreihenfolge. */
export const activePlayers = (s: GameState): PlayerIndex[] =>
  s.players.map((_, i) => i).filter((i) => !s.players[i].out);

export const isActive = (s: GameState, p: PlayerIndex) => p >= 0 && p < s.players.length && !s.players[p].out;

/** Aktive Mitspieler von p (ohne p selbst). */
export const opponents = (s: GameState, p: PlayerIndex = s.current) => activePlayers(s).filter((i) => i !== p);

/** Der nächste aktive Spieler in Spielrichtung (ohne Aussetzen zu berücksichtigen). */
export function nextActive(s: GameState, from: PlayerIndex): PlayerIndex {
  const n = s.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + s.direction + n) % n;
    if (!s.players[i].out) return i;
  }
  return from;
}

/** Löst ein Ziel auf. 'gegner' ist nur eindeutig, wenn genau ein Mitspieler übrig ist. */
export function resolveTarget(s: GameState, t: Target, allowSelf = true): PlayerIndex {
  if (t === 'selbst') {
    if (!allowSelf) throw new RuleError('Du musst jemand anderen wählen');
    return s.current;
  }
  if (t === 'gegner') {
    const opp = opponents(s);
    if (opp.length !== 1) throw new RuleError('Bitte einen Mitspieler auswählen');
    return opp[0];
  }
  if (!isActive(s, t)) throw new RuleError('Dieser Spieler ist nicht mehr dabei');
  if (t === s.current && !allowSelf) throw new RuleError('Du musst jemand anderen wählen');
  return t;
}

// ---------------------------------------------------------------- Spielstart & Runde

export function createGame(settings: Settings): GameState {
  const n = settings.names.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new RuleError('2 bis 6 Spieler');
  return {
    version: 2,
    settings: { ...settings, names: [...settings.names] },
    players: settings.names.map((name) => ({ name, shots: 0, sips: 0, items: [], out: false })),
    round: 0,
    glasses: [],
    announced: { schnaps: 0, wasser: 0 },
    phase: 'rundenende',
    current: 0,
    direction: 1,
    turnNumber: 0,
    itemsUsed: 0,
    skipNext: settings.names.map(() => false),
    forcedGlass: null,
    splitter: null,
    beerPick: false,
    pending: [],
    after: null,
    barkeeperShots: 0,
    winner: null,
  };
}

/** Würfelt die Gläser einer Runde aus: mindestens ein Schnaps und ein Wasser. */
export function distribute(rng: Rng, count: number): Content[] {
  if (count < MIN_GLASSES || count > MAX_GLASSES) throw new RuleError('Ungültige Glasanzahl');
  const schnaps = randInt(rng, 1, count - 1);
  const contents: Content[] = [];
  for (let i = 0; i < count; i++) contents.push(i < schnaps ? 'schnaps' : 'wasser');
  return shuffle(rng, contents);
}

export function startRound(prev: GameState, rng: Rng): Result {
  if (prev.phase !== 'rundenende') throw new RuleError('Die Runde läuft noch');
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const [lo, hi] = randomGlassRange(activePlayers(s).length);
  const count = s.settings.glassCount === 'zufall' ? randInt(rng, lo, hi) : s.settings.glassCount;
  const contents = distribute(rng, count);
  s.round += 1;
  s.glasses = contents.map((content, id) => ({ id, content, empty: false }));
  s.announced = {
    schnaps: contents.filter((c) => c === 'schnaps').length,
    wasser: contents.filter((c) => c === 'wasser').length,
  };
  s.phase = 'rundenstart';
  s.turnNumber = 0;
  s.itemsUsed = 0;
  s.skipNext = s.players.map(() => false);
  s.forcedGlass = null;
  s.splitter = null;
  s.beerPick = false;
  s.pending = [];
  s.after = null;
  dealRound(s, rng, events);
  return { state: s, events };
}

/** Zufallsauswahl unter allen aktiven Spielern (bei zwei Spielern: Münzwurf). */
export function drawPlayer(s: GameState, rng: Rng): PlayerIndex {
  const candidates = activePlayers(s);
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Wer beginnt die Runde. */
export function flipStarter(prev: GameState, rng: Rng): Result {
  if (prev.phase !== 'rundenstart') throw new RuleError('Kein Rundenstart');
  const s = structuredClone(prev);
  const winner = drawPlayer(s, rng);
  s.current = winner;
  s.phase = 'zug';
  return {
    state: s,
    events: [
      { kind: 'coin', winner, reason: 'start' },
      { kind: 'turn', player: winner, again: false },
    ],
  };
}

// ---------------------------------------------------------------- Züge

export function assertCanAct(s: GameState) {
  if (s.phase !== 'zug') throw new RuleError('Gerade ist kein Zug');
  if (s.pending.length) throw new RuleError('Erst den offenen Schnaps klären');
  if (s.splitter !== null) throw new RuleError('Erst die Gläser verteilen');
  if (s.beerPick) throw new RuleError('Erst wählen, wer Bier trinkt');
}

export function liveGlass(s: GameState, id: number): Glass {
  const g = s.glasses[id];
  if (!g || g.empty) throw new RuleError('Dieses Glas ist schon leer');
  return g;
}

/** Normaler Zug: ein Glas nehmen und selbst trinken oder jemandem geben. */
export function takeGlass(prev: GameState, glassId: number, target: Target, rng: Rng): Result {
  assertCanAct(prev);
  if (prev.forcedGlass !== null && prev.forcedGlass !== glassId) {
    throw new RuleError(`Du musst Glas ${glassNo(prev.forcedGlass)} nehmen`);
  }
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const drinker = resolveTarget(s, target);
  const g = liveGlass(s, glassId);
  drink(s, [g], drinker, events);
  const risk = drinker === s.current && g.content === 'wasser';
  settle(s, risk ? 'mutprobe' : 'zugende', rng, events);
  return { state: s, events };
}

/** Leert Gläser, meldet sie und stellt Schnäpse in die Warteschlange. */
export function drink(s: GameState, glasses: Glass[], drinker: PlayerIndex | 'niemand' | 'barkeeper', events: GameEvent[]) {
  for (const g of glasses) {
    g.empty = true;
    g.drunkBy = drinker;
  }
  events.push({ kind: 'reveal', glasses: glasses.map((g) => ({ id: g.id, content: g.content })), drinker });
  for (const g of glasses) {
    if (g.content !== 'schnaps') continue;
    if (drinker === 'barkeeper') {
      s.barkeeperShots += 1;
      events.push({ kind: 'shot', player: 'barkeeper' });
    } else if (drinker !== 'niemand') {
      s.pending.push({ player: drinker, glassId: g.id });
    }
  }
}

/** Zählt einen Shot und prüft das Shot-Limit. */
function addShot(s: GameState, p: PlayerIndex, events: GameEvent[]) {
  const pl = s.players[p];
  pl.shots += 1;
  events.push({ kind: 'shot', player: p });
  const limit = s.settings.shotLimit;
  if (limit === null || pl.out || pl.shots < limit || s.winner !== null) return;
  pl.outOrder = s.players.filter((x) => x.out).length;
  pl.out = true;
  s.skipNext[p] = false;
  events.push({ kind: 'out', player: p });
  const left = activePlayers(s);
  if (left.length === 1) s.winner = left[0];
}

/** Arbeitet offene Schnäpse ab und führt danach die Fortsetzung aus. */
export function settle(s: GameState, after: Continuation, rng: Rng, events: GameEvent[]) {
  s.after = after;
  flush(s, rng, events);
}

function flush(s: GameState, rng: Rng, events: GameEvent[]) {
  // Steht der Sieger fest, sind übrige Schnäpse egal
  while (s.pending.length && s.winner === null) {
    const head = s.pending[0];
    if (hasItem(s, head.player, 'schutzengel')) return; // Entscheidung abwarten
    s.pending.shift();
    addShot(s, head.player, events);
  }
  const after = s.after;
  s.after = null;
  if (s.winner !== null) return endGame(s, events);
  if (after) continueWith(s, after, rng, events);
}

/** Entscheidung über den Schutzengel für den ersten offenen Schnaps. */
export function resolvePending(prev: GameState, useProtection: boolean, rng: Rng): Result {
  const head = prev.pending[0];
  if (!head) throw new RuleError('Nichts offen');
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  s.pending.shift();
  const p = s.players[head.player];
  const idx = p.items.indexOf('schutzengel');
  if (useProtection && idx >= 0) {
    p.items.splice(idx, 1);
    events.push({ kind: 'protected', player: head.player });
  } else {
    addShot(s, head.player, events);
  }
  flush(s, rng, events);
  return { state: s, events };
}

function continueWith(s: GameState, after: Continuation, rng: Rng, events: GameEvent[]) {
  if (after === 'mutprobe') {
    if (s.settings.items) {
      // Mit Items gibt es statt des Extrazugs ein Extra-Item
      events.push({ kind: 'mutprobe', player: s.current, item: grant(s, s.current, rng) });
      endTurn(s, events);
    } else if (remaining(s).length === 0) {
      endRound(s, events);
    } else {
      // Extrazug: neuer Zug für denselben Spieler
      events.push({ kind: 'mutprobe', player: s.current, item: null });
      newTurn(s);
      events.push({ kind: 'turn', player: s.current, again: true });
    }
  } else if (after === 'zugende') {
    endTurn(s, events);
  } else if (remaining(s).length === 0) {
    endRound(s, events);
  }
}

function newTurn(s: GameState) {
  s.turnNumber += 1;
  s.itemsUsed = 0;
  s.forcedGlass = null;
}

export function endTurn(s: GameState, events: GameEvent[]) {
  newTurn(s);
  if (remaining(s).length === 0) {
    endRound(s, events);
    return;
  }
  const before = s.current;
  let next = nextActive(s, before);
  // Wer aussetzen muss, wird einmal übersprungen
  while (s.skipNext[next] && next !== before) {
    s.skipNext[next] = false;
    events.push({ kind: 'skip', player: next });
    next = nextActive(s, next);
  }
  s.current = next;
  events.push({ kind: 'turn', player: next, again: next === before });
}

function endRound(s: GameState, events: GameEvent[]) {
  s.phase = 'rundenende';
  s.forcedGlass = null;
  s.skipNext = s.players.map(() => false);
  events.push({ kind: 'roundEnd' });
}

function endGame(s: GameState, events: GameEvent[]) {
  s.phase = 'spielende';
  s.forcedGlass = null;
  s.splitter = null;
  s.beerPick = false;
  s.pending = [];
  events.push({ kind: 'gameOver', winner: s.winner! });
}
