import {
  activePlayers,
  assertCanAct,
  drawPlayer,
  drink,
  glassNo,
  isActive,
  liveGlass,
  opponents,
  remaining,
  resolveTarget,
  settle,
} from './engine';
import { ITEMS } from './inventory';
import { contentLabel, terms } from './terms';
import { pick, randInt, type Rng } from './rng';
import {
  RuleError,
  type GameEvent,
  type GameState,
  type ItemId,
  type PlayerIndex,
  type Result,
  type Target,
} from './types';

export type ItemRequest =
  | { item: 'spuernase'; glass: number }
  /** from: bei wem geklaut wird (im 2-Spieler-Spiel optional). */
  | { item: 'langfinger'; from?: PlayerIndex; steal: ItemRequest }
  | { item: 'bierpause'; glass: number }
  | { item: 'doppelter'; glasses: [number, number]; target: Target }
  /** target: wer aussetzt (im 2-Spieler-Spiel optional). */
  | { item: 'aussetzer'; target?: PlayerIndex }
  | { item: 'abraeumer'; glass: number }
  | { item: 'teiler' }
  | { item: 'muenzteiler' }
  | { item: 'fluesterpost' }
  | { item: 'wendehals'; glass: number }
  | { item: 'wuerfelbecher' }
  | { item: 'kehrtwende' };

/** Wem das Item gehört: dem aktuellen Spieler, dem einzigen Gegner oder einem bestimmten Mitspieler. */
export type Source = 'selbst' | 'gegner' | PlayerIndex;

const UNSTEALABLE: ItemId[] = ['langfinger', 'schutzengel'];

function ownerOf(s: GameState, from: Source): PlayerIndex {
  if (from === 'selbst') return s.current;
  return resolveTarget(s, from, false);
}

/** Warum ein Item gerade nicht geht – oder null, wenn es nutzbar ist. */
export function blockReason(s: GameState, item: ItemId, from: Source = 'selbst'): string | null {
  if (!s.settings.items) return 'Items sind aus';
  if (s.phase !== 'zug' || s.pending.length || s.splitter !== null || s.beerPick) return 'Gerade nicht möglich';
  if (s.itemUsed) return 'Nur ein Item pro Zug';
  if (s.forcedGlass !== null) return 'Erst das gerochene Glas nehmen';
  let owner: PlayerIndex;
  try {
    owner = ownerOf(s, from);
  } catch {
    return 'Ungültiger Mitspieler';
  }
  if (!s.players[owner].items.includes(item)) return 'Item nicht vorhanden';
  if (from !== 'selbst' && UNSTEALABLE.includes(item)) return 'Kann nicht geklaut werden';
  const left = remaining(s).length;
  const players = activePlayers(s).length;
  switch (item) {
    case 'schutzengel':
      return `Wird automatisch angeboten, wenn du ${s.settings.mode === 'alkohol' ? 'einen' : 'eine'} ${terms(s.settings.mode).bad} trinken musst`;
    case 'bierpause':
      return left < 2 ? 'Nicht beim letzten Glas' : null;
    case 'doppelter':
      return left < 2 ? 'Braucht mindestens zwei Gläser' : null;
    case 'aussetzer':
      if (opponents(s).every((p) => s.skipNext[p])) {
        return players === 2 ? 'Gegenüber setzt schon aus' : 'Alle anderen setzen schon aus';
      }
      return null;
    case 'teiler':
    case 'muenzteiler':
      if (s.turnNumber !== 0) return 'Nur im ersten Zug der Runde';
      if (left < 2) return 'Braucht mindestens zwei Gläser';
      return left < players ? 'Zu wenige Gläser für alle' : null;
    case 'kehrtwende':
      return players < 3 ? 'Erst ab drei Spielern' : null;
    case 'langfinger':
      return opponents(s).some((p) => stealable(s, p).length) ? null : 'Bei den anderen gibt es nichts Brauchbares';
    default:
      return null;
  }
}

/** Items, die man einem Mitspieler gerade klauen könnte (ohne Angabe: dem einzigen Gegner). */
export function stealable(s: GameState, from?: PlayerIndex): ItemId[] {
  const victims = from === undefined ? opponents(s) : [from];
  const loot = new Set<ItemId>();
  for (const v of victims) {
    if (v === s.current || !isActive(s, v)) continue;
    for (const it of s.players[v].items) if (blockReason(s, it, v) === null) loot.add(it);
  }
  return [...loot];
}

export function useItem(prev: GameState, req: ItemRequest, rng: Rng): Result {
  assertCanAct(prev);
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const me = s.current;
  let effect = req;
  let owner = me;
  if (req.item === 'langfinger') {
    const why = blockReason(s, 'langfinger');
    if (why) throw new RuleError(why);
    owner = resolveTarget(s, req.from ?? 'gegner', false);
    if (UNSTEALABLE.includes(req.steal.item)) throw new RuleError('Kann nicht geklaut werden');
    effect = req.steal;
    take(s, me, 'langfinger');
    events.push({ kind: 'item', player: me, item: 'langfinger', stolen: false });
  }
  const why = blockReason(s, effect.item, owner === me ? 'selbst' : owner);
  if (why) throw new RuleError(why);
  const target =
    effect.item === 'aussetzer'
      ? resolveTarget(s, effect.target ?? 'gegner', false)
      : effect.item === 'doppelter'
        ? resolveTarget(s, effect.target)
        : undefined;
  if (effect.item === 'aussetzer' && s.skipNext[target!]) throw new RuleError('Setzt schon aus');
  take(s, owner, effect.item);
  // Im 2-Spieler-Spiel ist der Gegner eindeutig – dann bleibt das Ereignis wie bisher
  const explicit = opponents(s).length > 1;
  events.push({
    kind: 'item',
    player: me,
    item: effect.item,
    stolen: owner !== me,
    ...(explicit && owner !== me ? { from: owner } : {}),
    ...(explicit && target !== undefined && target !== me ? { target } : {}),
  });
  s.itemUsed = true;
  apply(s, effect as Exclude<ItemRequest, { item: 'langfinger' }>, target, rng, events);
  return { state: s, events };
}

function take(s: GameState, p: PlayerIndex, item: ItemId) {
  const items = s.players[p].items;
  items.splice(items.indexOf(item), 1);
}

function apply(
  s: GameState,
  req: Exclude<ItemRequest, { item: 'langfinger' }>,
  target: PlayerIndex | undefined,
  rng: Rng,
  events: GameEvent[],
) {
  const me = s.current;
  switch (req.item) {
    case 'spuernase': {
      const g = liveGlass(s, req.glass);
      s.forcedGlass = g.id;
      events.push({ kind: 'secret', viewer: me, text: `Glas ${glassNo(g.id)} ist ${contentLabel(g.content, s.settings.mode)}` });
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
      drink(s, glasses, target!, events);
      const risk = target === me && glasses.every((g) => g.content === 'wasser');
      settle(s, risk ? 'mutprobe' : 'zugende', rng, events);
      return;
    }
    case 'aussetzer':
      s.skipNext[target!] = true;
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
      const winner = drawPlayer(s, rng);
      s.splitter = winner;
      events.push({ kind: 'coin', winner, reason: 'teiler' });
      events.push({ kind: 'splitStart', splitter: winner });
      return;
    }
    case 'fluesterpost': {
      const g = pick(rng, remaining(s));
      events.push({ kind: 'secret', viewer: me, text: `Glas ${glassNo(g.id)} ist ${contentLabel(g.content, s.settings.mode)}` });
      return;
    }
    case 'wendehals': {
      const g = liveGlass(s, req.glass);
      g.content = g.content === 'schnaps' ? 'wasser' : 'schnaps';
      if (s.settings.barkeeper) {
        events.push({
          kind: 'secret',
          viewer: 'barkeeper',
          text: `Glas ${glassNo(g.id)} heimlich umfüllen: jetzt ${contentLabel(g.content, s.settings.mode)}`,
        });
      }
      return;
    }
    case 'wuerfelbecher': {
      const value = randInt(rng, 1, 6);
      if (value >= 3) {
        s.players[me].sips += 1;
        events.push({ kind: 'dice', value, player: me });
        events.push({ kind: 'beer', player: me });
        return;
      }
      const opp = opponents(s);
      if (opp.length === 1) {
        s.players[opp[0]].sips += 1;
        events.push({ kind: 'dice', value, player: opp[0] });
        events.push({ kind: 'beer', player: opp[0] });
      } else {
        // Bei 1–2 darf der Werfer aussuchen, wer trinkt
        s.beerPick = true;
        events.push({ kind: 'dice', value, player: null });
      }
      return;
    }
    case 'kehrtwende':
      s.direction = s.direction === 1 ? -1 : 1;
      events.push({ kind: 'direction', direction: s.direction });
      return;
  }
}

/** Nach einer 1–2 beim Würfelbecher: der Werfer bestimmt, wer einen Schluck trinkt. */
export function chooseBeer(prev: GameState, target: PlayerIndex): Result {
  if (!prev.beerPick) throw new RuleError('Gerade nichts zu wählen');
  const s = structuredClone(prev);
  const p = resolveTarget(s, target, false);
  s.beerPick = false;
  s.players[p].sips += 1;
  return { state: s, events: [{ kind: 'beer', player: p }] };
}

/** Gläser, die bei der Teilung jedem aktiven Spieler zustehen. Der Rest bleibt stehen. */
export const splitShare = (s: GameState) => Math.floor(remaining(s).length / activePlayers(s).length);

/**
 * Teiler/Münzteiler: Zuordnung Glas → Spieler. Alle aktiven Spieler bekommen gleich viele.
 * Übrig gebliebene Gläser bleiben stehen, dann ist der nächste Spieler am Zug.
 */
export function split(prev: GameState, assignment: Record<number, PlayerIndex>, rng: Rng): Result {
  if (prev.splitter === null) throw new RuleError('Keine Teilung offen');
  const share = splitShare(prev);
  const players = activePlayers(prev);
  const ids = Object.keys(assignment).map(Number);
  const counts = new Map<PlayerIndex, number>(players.map((p) => [p, 0]));
  for (const id of ids) {
    liveGlass(prev, id);
    const p = assignment[id];
    if (!counts.has(p)) throw new RuleError('Nur aktive Spieler bekommen Gläser');
    counts.set(p, counts.get(p)! + 1);
  }
  if ([...counts.values()].some((c) => c !== share)) {
    throw new RuleError(`Jeder muss genau ${share} ${share === 1 ? 'Glas' : 'Gläser'} bekommen`);
  }
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  s.splitter = null;
  for (const p of players) {
    const mine = ids.filter((id) => assignment[id] === p).map((id) => s.glasses[id]);
    drink(s, mine, p, events);
  }
  settle(s, 'zugende', rng, events);
  return { state: s, events };
}

export { ITEMS };
