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
export const MAX_GLASSES = 8;

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

export const remaining = (s: GameState): Glass[] => s.glasses.filter((g) => !g.empty);

export function glassNo(id: number): number {
  return id + 1;
}

export function createGame(settings: Settings): GameState {
  return {
    version: 1,
    settings,
    players: [
      { name: settings.names[0], shots: 0, sips: 0, items: [] },
      { name: settings.names[1], shots: 0, sips: 0, items: [] },
    ],
    round: 0,
    glasses: [],
    announced: { schnaps: 0, wasser: 0 },
    phase: 'rundenende',
    current: 0,
    turnNumber: 0,
    itemUsed: false,
    skipNext: [false, false],
    forcedGlass: null,
    splitter: null,
    pending: [],
    after: null,
    barkeeperShots: 0,
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
  const count =
    s.settings.glassCount === 'zufall' ? randInt(rng, MIN_GLASSES, MAX_GLASSES) : s.settings.glassCount;
  const contents = distribute(rng, count);
  s.round += 1;
  s.glasses = contents.map((content, id) => ({ id, content, empty: false }));
  s.announced = {
    schnaps: contents.filter((c) => c === 'schnaps').length,
    wasser: contents.filter((c) => c === 'wasser').length,
  };
  s.phase = 'rundenstart';
  s.turnNumber = 0;
  s.itemUsed = false;
  s.skipNext = [false, false];
  s.forcedGlass = null;
  s.splitter = null;
  s.pending = [];
  s.after = null;
  dealRound(s, rng, events);
  return { state: s, events };
}

/** Münzwurf: wer beginnt die Runde. */
export function flipStarter(prev: GameState, rng: Rng): Result {
  if (prev.phase !== 'rundenstart') throw new RuleError('Kein Rundenstart');
  const s = structuredClone(prev);
  const winner: PlayerIndex = rng() < 0.5 ? 0 : 1;
  s.current = winner;
  s.phase = 'zug';
  return { state: s, events: [{ kind: 'coin', winner, reason: 'start' }, { kind: 'turn', player: winner, again: false }] };
}

export function assertCanAct(s: GameState) {
  if (s.phase !== 'zug') throw new RuleError('Gerade ist kein Zug');
  if (s.pending.length) throw new RuleError('Erst den offenen Schnaps klären');
  if (s.splitter !== null) throw new RuleError('Erst die Gläser verteilen');
}

export function liveGlass(s: GameState, id: number): Glass {
  const g = s.glasses[id];
  if (!g || g.empty) throw new RuleError('Dieses Glas ist schon leer');
  return g;
}

/** Normaler Zug: ein Glas nehmen und selbst trinken oder weitergeben. */
export function takeGlass(prev: GameState, glassId: number, target: Target, rng: Rng): Result {
  assertCanAct(prev);
  if (prev.forcedGlass !== null && prev.forcedGlass !== glassId) {
    throw new RuleError(`Du musst Glas ${glassNo(prev.forcedGlass)} nehmen`);
  }
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const drinker = target === 'selbst' ? s.current : other(s.current);
  const g = liveGlass(s, glassId);
  drink(s, [g], drinker, events);
  const risk = target === 'selbst' && g.content === 'wasser';
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

/** Arbeitet offene Schnäpse ab und führt danach die Fortsetzung aus. */
export function settle(s: GameState, after: Continuation, rng: Rng, events: GameEvent[]) {
  s.after = after;
  flush(s, rng, events);
}

function flush(s: GameState, rng: Rng, events: GameEvent[]) {
  while (s.pending.length) {
    const head = s.pending[0];
    if (hasItem(s, head.player, 'schutzengel')) return; // Entscheidung abwarten
    s.pending.shift();
    s.players[head.player].shots += 1;
    events.push({ kind: 'shot', player: head.player });
  }
  const after = s.after;
  s.after = null;
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
    p.shots += 1;
    events.push({ kind: 'shot', player: head.player });
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
  s.itemUsed = false;
  s.forcedGlass = null;
}

export function endTurn(s: GameState, events: GameEvent[]) {
  newTurn(s);
  if (remaining(s).length === 0) {
    endRound(s, events);
    return;
  }
  const next = other(s.current);
  if (s.skipNext[next]) {
    s.skipNext[next] = false;
    events.push({ kind: 'skip', player: next });
    events.push({ kind: 'turn', player: s.current, again: true });
  } else {
    s.current = next;
    events.push({ kind: 'turn', player: next, again: false });
  }
}

function endRound(s: GameState, events: GameEvent[]) {
  s.phase = 'rundenende';
  s.forcedGlass = null;
  s.skipNext = [false, false];
  events.push({ kind: 'roundEnd' });
}
