import { assertCanAct, drink, glassNo, liveGlass, other, remaining, settle } from './engine';
import { ITEMS } from './inventory';
import { pick, randInt, type Rng } from './rng';
import {
  RuleError,
  type Content,
  type GameEvent,
  type GameState,
  type ItemId,
  type PlayerIndex,
  type Result,
  type Target,
} from './types';

export type ItemRequest =
  | { item: 'spuernase'; glass: number }
  | { item: 'langfinger'; steal: ItemRequest }
  | { item: 'bierpause'; glass: number }
  | { item: 'doppelter'; glasses: [number, number]; target: Target }
  | { item: 'aussetzer' }
  | { item: 'abraeumer'; glass: number }
  | { item: 'teiler' }
  | { item: 'muenzteiler' }
  | { item: 'fluesterpost' }
  | { item: 'wendehals'; glass: number }
  | { item: 'wuerfelbecher' };

export type Source = 'selbst' | 'gegner';

const label = (c: Content) => (c === 'schnaps' ? 'Schnaps' : 'Wasser');

/** Warum ein Item gerade nicht geht – oder null, wenn es nutzbar ist. */
export function blockReason(s: GameState, item: ItemId, from: Source = 'selbst'): string | null {
  if (!s.settings.items) return 'Items sind aus';
  if (s.phase !== 'zug' || s.pending.length || s.splitter !== null) return 'Gerade nicht möglich';
  if (s.itemUsed) return 'Nur ein Item pro Zug';
  if (s.forcedGlass !== null) return 'Erst das gerochene Glas nehmen';
  const me = s.current;
  const owner = from === 'selbst' ? me : other(me);
  if (!s.players[owner].items.includes(item)) return 'Item nicht vorhanden';
  if (from === 'gegner' && (item === 'langfinger' || item === 'schutzengel')) return 'Kann nicht geklaut werden';
  const left = remaining(s).length;
  switch (item) {
    case 'schutzengel':
      return 'Wird automatisch angeboten, wenn du einen Schnaps trinken musst';
    case 'bierpause':
      return left < 2 ? 'Nicht beim letzten Glas' : null;
    case 'doppelter':
      return left < 2 ? 'Braucht mindestens zwei Gläser' : null;
    case 'aussetzer':
      return s.skipNext[other(me)] ? 'Gegenüber setzt schon aus' : null;
    case 'teiler':
    case 'muenzteiler':
      if (s.turnNumber !== 0) return 'Nur im ersten Zug der Runde';
      return left < 2 ? 'Braucht mindestens zwei Gläser' : null;
    case 'langfinger': {
      const loot = s.players[other(me)].items.filter((it) => blockReason(s, it, 'gegner') === null);
      return loot.length ? null : 'Beim Gegenüber gibt es nichts Brauchbares';
    }
    default:
      return null;
  }
}

/** Items, die man dem Gegenüber gerade klauen könnte. */
export function stealable(s: GameState): ItemId[] {
  return [...new Set(s.players[other(s.current)].items)].filter((it) => blockReason(s, it, 'gegner') === null);
}

export function useItem(prev: GameState, req: ItemRequest, rng: Rng): Result {
  assertCanAct(prev);
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const me = s.current;
  let effect = req;
  let from: Source = 'selbst';
  if (req.item === 'langfinger') {
    const why = blockReason(s, 'langfinger');
    if (why) throw new RuleError(why);
    if (req.steal.item === 'langfinger') throw new RuleError('Kann nicht geklaut werden');
    effect = req.steal;
    from = 'gegner';
    take(s, me, 'langfinger');
    events.push({ kind: 'item', player: me, item: 'langfinger', stolen: false });
  }
  const why = blockReason(s, effect.item, from);
  if (why) throw new RuleError(why);
  take(s, from === 'selbst' ? me : other(me), effect.item);
  events.push({ kind: 'item', player: me, item: effect.item, stolen: from === 'gegner' });
  s.itemUsed = true;
  apply(s, effect as Exclude<ItemRequest, { item: 'langfinger' }>, rng, events);
  return { state: s, events };
}

function take(s: GameState, p: PlayerIndex, item: ItemId) {
  const items = s.players[p].items;
  items.splice(items.indexOf(item), 1);
}

function apply(s: GameState, req: Exclude<ItemRequest, { item: 'langfinger' }>, rng: Rng, events: GameEvent[]) {
  const me = s.current;
  switch (req.item) {
    case 'spuernase': {
      const g = liveGlass(s, req.glass);
      s.forcedGlass = g.id;
      events.push({ kind: 'secret', viewer: me, text: `Glas ${glassNo(g.id)} ist ${label(g.content)}` });
      return;
    }
    case 'bierpause': {
      const g = liveGlass(s, req.glass);
      s.players[me].sips += 1;
      events.push({ kind: 'beer', player: me });
      drink(s, [g], 'niemand', events);
      settle(s, 'weiter', rng, events);
      return;
    }
    case 'doppelter': {
      const [a, b] = req.glasses;
      if (a === b) throw new RuleError('Zwei verschiedene Gläser wählen');
      const glasses = [liveGlass(s, a), liveGlass(s, b)];
      drink(s, glasses, req.target === 'selbst' ? me : other(me), events);
      const risk = req.target === 'selbst' && glasses.every((g) => g.content === 'wasser');
      settle(s, risk ? 'mutprobe' : 'zugende', rng, events);
      return;
    }
    case 'aussetzer':
      s.skipNext[other(me)] = true;
      return;
    case 'abraeumer': {
      const g = liveGlass(s, req.glass);
      drink(s, [g], s.settings.barkeeper ? 'barkeeper' : 'niemand', events);
      settle(s, 'zugende', rng, events);
      return;
    }
    case 'teiler':
      s.splitter = me;
      events.push({ kind: 'splitStart', splitter: me });
      return;
    case 'muenzteiler': {
      const winner: PlayerIndex = rng() < 0.5 ? 0 : 1;
      s.splitter = winner;
      events.push({ kind: 'coin', winner, reason: 'teiler' });
      events.push({ kind: 'splitStart', splitter: winner });
      return;
    }
    case 'fluesterpost': {
      const g = pick(rng, remaining(s));
      events.push({ kind: 'secret', viewer: me, text: `Glas ${glassNo(g.id)} ist ${label(g.content)}` });
      return;
    }
    case 'wendehals': {
      const g = liveGlass(s, req.glass);
      g.content = g.content === 'schnaps' ? 'wasser' : 'schnaps';
      if (s.settings.barkeeper) {
        events.push({
          kind: 'secret',
          viewer: 'barkeeper',
          text: `Glas ${glassNo(g.id)} heimlich umfüllen: jetzt ${label(g.content)}`,
        });
      }
      return;
    }
    case 'wuerfelbecher': {
      const value = randInt(rng, 1, 6);
      const player = value <= 2 ? other(me) : me;
      s.players[player].sips += 1;
      events.push({ kind: 'dice', value, player });
      events.push({ kind: 'beer', player });
      return;
    }
  }
}

/** Gläser, die bei der Teilung jeder Seite zustehen. Bei ungerader Zahl bleibt eins stehen. */
export const splitShare = (s: GameState) => Math.floor(remaining(s).length / 2);

/**
 * Teiler/Münzteiler: Zuordnung Glas → Spieler. Jeder bekommt gleich viele.
 * Ein übrig gebliebenes Glas bleibt stehen, dann ist das Gegenüber am Zug.
 */
export function split(prev: GameState, assignment: Record<number, PlayerIndex>, rng: Rng): Result {
  if (prev.splitter === null) throw new RuleError('Keine Teilung offen');
  const share = splitShare(prev);
  const ids = Object.keys(assignment).map(Number);
  const counts = [0, 0];
  for (const id of ids) {
    liveGlass(prev, id);
    counts[assignment[id]] += 1;
  }
  if (counts[0] !== share || counts[1] !== share) {
    throw new RuleError(`Jeder muss genau ${share} Gläser bekommen`);
  }
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  s.splitter = null;
  for (const p of [0, 1] as const) {
    const mine = ids.filter((id) => assignment[id] === p).map((id) => s.glasses[id]);
    drink(s, mine, p, events);
  }
  settle(s, 'zugende', rng, events);
  return { state: s, events };
}

export { ITEMS };
