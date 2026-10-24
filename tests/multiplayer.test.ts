import { describe, expect, it } from 'vitest';
import {
  createGame,
  defaultGlassCount,
  flipStarter,
  nextActive,
  randomGlassRange,
  resolvePending,
  startRound,
  takeGlass,
} from '../src/game/engine';
import { itemPool, randomItem } from '../src/game/inventory';
import { blockReason, chooseBeer, split, splitShare, stealable, useItem } from '../src/game/items';
import { seededRng } from '../src/game/rng';
import { RuleError, type Content, type GameState, type ItemId, type Settings } from '../src/game/types';
import { baseSettings, fixedRng, table } from './helpers';

const rng = () => seededRng(3);
const NAMES = ['Anna', 'Ben', 'Cem', 'Dana', 'Eli', 'Finn'];

/** Laufender Zug mit n Spielern. */
function tableN(n: number, contents: Content[], opts: { current?: number; items?: ItemId[][]; settings?: Partial<Settings> } = {}): GameState {
  return table(contents, { ...opts, settings: { names: NAMES.slice(0, n), ...opts.settings } });
}

const turnOrder = (s: GameState, steps: number) => {
  const order: number[] = [];
  for (let i = 0; i < steps; i++) {
    const open = s.glasses.find((g) => !g.empty && g.content === 'wasser')!;
    s = takeGlass(s, open.id, (s.current + 1) % s.players.length === s.current ? 'selbst' : nextActive(s, s.current), rng()).state;
    order.push(s.current);
  }
  return order;
};

describe('Spieleranzahl und Setup', () => {
  it('erlaubt 2 bis 6 Spieler', () => {
    expect(() => createGame(baseSettings({ names: ['A'] }))).toThrow(RuleError);
    expect(() => createGame(baseSettings({ names: NAMES.concat('Gabi') }))).toThrow(RuleError);
    expect(createGame(baseSettings({ names: NAMES })).players).toHaveLength(6);
  });

  it('Standard-Glasanzahl ist Spieler × 2, höchstens 12', () => {
    expect([2, 3, 4, 5, 6, 7].map(defaultGlassCount)).toEqual([4, 6, 8, 10, 12, 12]);
  });

  it('Zufallsanzahl bleibt bei 2 Spielern 2–8 und wächst mit der Runde', () => {
    expect(randomGlassRange(2)).toEqual([2, 8]);
    expect(randomGlassRange(4)).toEqual([4, 10]);
    expect(randomGlassRange(6)).toEqual([6, 12]);
  });

  it('bis zu 12 Gläser pro Runde', () => {
    const s = startRound(createGame(baseSettings({ names: NAMES, glassCount: 12 })), rng()).state;
    expect(s.glasses).toHaveLength(12);
  });

  it('Items werden an alle aktiven Spieler gleich verteilt', () => {
    const s = startRound(createGame(baseSettings({ names: NAMES.slice(0, 5), items: true })), rng()).state;
    const counts = s.players.map((p) => p.items.length);
    expect(new Set(counts).size).toBe(1);
  });

  it('Zufallsauswahl zum Rundenstart wählt unter allen Spielern', () => {
    const s = startRound(createGame(baseSettings({ names: NAMES.slice(0, 4) })), rng()).state;
    expect(flipStarter(s, fixedRng(0.0)).state.current).toBe(0);
    expect(flipStarter(s, fixedRng(0.3)).state.current).toBe(1);
    expect(flipStarter(s, fixedRng(0.99)).state.current).toBe(3);
  });
});

describe('Zugreihenfolge', () => {
  it('geht reihum in Sitzreihenfolge', () => {
    let s = tableN(4, ['wasser', 'wasser', 'wasser', 'wasser', 'schnaps']);
    const order = [];
    for (let i = 0; i < 4; i++) {
      s = takeGlass(s, i, nextActive(s, s.current), rng()).state; // Wasser weitergeben → Zug endet
      order.push(s.current);
    }
    expect(order).toEqual([1, 2, 3, 0]);
  });

  it('„gegner“ ist bei mehr als zwei Spielern nicht eindeutig', () => {
    expect(() => takeGlass(tableN(3, ['schnaps', 'wasser']), 0, 'gegner', rng())).toThrow(RuleError);
  });

  it('Jemandem geben: der gewählte Mitspieler trinkt', () => {
    const r = takeGlass(tableN(4, ['schnaps', 'wasser', 'wasser']), 0, 2, rng());
    expect(r.state.players[2].shots).toBe(1);
    expect(r.state.current).toBe(1);
  });

  it('ungültige Ziele werden abgelehnt', () => {
    const s = tableN(3, ['schnaps', 'wasser']);
    expect(() => takeGlass(s, 0, 5, rng())).toThrow(RuleError);
    s.players[2].out = true;
    expect(() => takeGlass(s, 0, 2, rng())).toThrow(RuleError);
  });

  it('Mutprobe gibt auch im Mehrspieler-Spiel einen Extrazug', () => {
    const r = takeGlass(tableN(3, ['wasser', 'schnaps']), 0, 'selbst', rng());
    expect(r.state.current).toBe(0);
  });

  it('hilfsfunktion turnOrder bleibt reihum', () => {
    expect(turnOrder(tableN(3, ['wasser', 'wasser', 'wasser', 'schnaps']), 3)).toEqual([1, 2, 0]);
  });
});

describe('Richtungswechsel (Kehrtwende)', () => {
  it('dreht die Reihenfolge um', () => {
    let s = tableN(4, ['wasser', 'wasser', 'wasser', 'schnaps'], { items: [['kehrtwende']] });
    const r = useItem(s, { item: 'kehrtwende' }, rng());
    expect(r.state.direction).toBe(-1);
    expect(r.events).toContainEqual({ kind: 'direction', direction: -1 });
    s = takeGlass(r.state, 0, 3, rng()).state;
    expect(s.current).toBe(3);
    s = takeGlass(s, 1, 2, rng()).state;
    expect(s.current).toBe(2);
  });

  it('zweimal umdrehen ergibt wieder die alte Richtung', () => {
    let s = tableN(3, ['wasser', 'wasser', 'schnaps'], { items: [['kehrtwende'], [], ['kehrtwende']] });
    s = useItem(s, { item: 'kehrtwende' }, rng()).state;
    s = takeGlass(s, 0, 2, rng()).state; // rückwärts: 0 → 2
    expect(s.current).toBe(2);
    s = useItem(s, { item: 'kehrtwende' }, rng()).state;
    expect(s.direction).toBe(1);
    s = takeGlass(s, 1, 1, rng()).state;
    expect(s.current).toBe(0);
  });

  it('nur ab drei aktiven Spielern nutzbar und im Pool', () => {
    expect(blockReason(table(['wasser', 'schnaps'], { items: [['kehrtwende'], []] }), 'kehrtwende')).toBe('Erst ab drei Spielern');
    expect(itemPool(2)).not.toContain('kehrtwende');
    expect(itemPool(3)).toContain('kehrtwende');
    const r = seededRng(1);
    for (let i = 0; i < 500; i++) expect(randomItem(r, 2)).not.toBe('kehrtwende');
  });

  it('wird gesperrt, wenn nur noch zwei übrig sind', () => {
    const s = tableN(3, ['wasser', 'schnaps'], { items: [['kehrtwende']] });
    s.players[2].out = true;
    expect(blockReason(s, 'kehrtwende')).not.toBeNull();
  });
});

describe('Aussetzen (Aussetzer)', () => {
  it('der gewählte Spieler wird übersprungen', () => {
    let s = tableN(4, ['wasser', 'wasser', 'schnaps', 'schnaps', 'wasser'], { items: [['aussetzer']] });
    const r = useItem(s, { item: 'aussetzer', target: 1 }, rng());
    expect(r.events).toContainEqual({ kind: 'item', player: 0, item: 'aussetzer', stolen: false, target: 1 });
    s = takeGlass(r.state, 0, 3, rng()).state;
    expect(s.current).toBe(2);
    s = takeGlass(s, 1, 3, rng()).state;
    expect(s.current).toBe(3);
    s = takeGlass(s, 2, 0, rng()).state;
    expect(s.current).toBe(0);
    s = takeGlass(s, 3, 2, rng()).state;
    expect(s.current).toBe(1); // nur einmal ausgesetzt
  });

  it('ohne Ziel bei mehreren Mitspielern: Fehler', () => {
    const s = tableN(3, ['wasser', 'schnaps'], { items: [['aussetzer']] });
    expect(() => useItem(s, { item: 'aussetzer' }, rng())).toThrow(RuleError);
  });

  it('nicht sich selbst und nicht doppelt', () => {
    const s = tableN(3, ['wasser', 'schnaps'], { items: [['aussetzer']] });
    expect(() => useItem(s, { item: 'aussetzer', target: 0 }, rng())).toThrow(RuleError);
    s.skipNext[2] = true;
    expect(() => useItem(s, { item: 'aussetzer', target: 2 }, rng())).toThrow(RuleError);
    expect(blockReason(s, 'aussetzer')).toBeNull();
    s.skipNext[1] = true;
    expect(blockReason(s, 'aussetzer')).toBe('Alle anderen setzen schon aus');
  });

  it('mehrere Aussetzer hintereinander werden alle übersprungen', () => {
    const s = tableN(4, ['wasser', 'wasser', 'schnaps']);
    s.skipNext[1] = true;
    s.skipNext[2] = true;
    const r = takeGlass(s, 0, 3, rng());
    expect(r.state.current).toBe(3);
    expect(r.events.filter((e) => e.kind === 'skip')).toHaveLength(2);
  });
});

describe('Ausscheiden (Shot-Limit)', () => {
  it('wer das Limit erreicht, scheidet aus und wird übersprungen', () => {
    let s = tableN(3, ['schnaps', 'wasser', 'wasser', 'schnaps'], { settings: { shotLimit: 2 } });
    s.players[1].shots = 1;
    const r = takeGlass(s, 0, 1, rng());
    expect(r.state.players[1].out).toBe(true);
    expect(r.events).toContainEqual({ kind: 'out', player: 1 });
    expect(r.state.current).toBe(2); // Ben übersprungen
    s = takeGlass(r.state, 1, 0, rng()).state;
    expect(s.current).toBe(0);
  });

  it('merkt sich die Reihenfolge des Ausscheidens', () => {
    let s = tableN(4, ['schnaps', 'schnaps', 'wasser', 'wasser'], { settings: { shotLimit: 1 } });
    s = takeGlass(s, 0, 2, rng()).state;
    s = takeGlass(s, 1, 3, rng()).state;
    expect(s.players[2].outOrder).toBe(0);
    expect(s.players[3].outOrder).toBe(1);
    expect(s.players[0].outOrder).toBeUndefined();
  });

  it('ausgeschiedene Spieler sind kein Ziel mehr', () => {
    const s = tableN(3, ['schnaps', 'wasser'], { items: [['aussetzer', 'langfinger'], ['aussetzer'], []] });
    s.players[1].out = true;
    expect(() => takeGlass(s, 0, 1, rng())).toThrow(RuleError);
    expect(() => useItem(s, { item: 'aussetzer', target: 1 }, rng())).toThrow(RuleError);
    expect(stealable(s, 1)).toEqual([]);
  });

  it('wenn nur einer übrig ist, gewinnt er und das Spiel endet', () => {
    const s = tableN(2, ['schnaps', 'wasser', 'wasser'], { settings: { shotLimit: 3 } });
    s.players[1].shots = 2;
    const r = takeGlass(s, 0, 'gegner', rng());
    expect(r.state.phase).toBe('spielende');
    expect(r.state.winner).toBe(0);
    expect(r.events.at(-1)).toEqual({ kind: 'gameOver', winner: 0 });
    expect(() => takeGlass(r.state, 1, 'selbst', rng())).toThrow(RuleError);
  });

  it('beim Teiler gewinnt, wer nach Sitzreihenfolge zuletzt übrig bleibt', () => {
    let s = tableN(2, ['schnaps', 'schnaps'], { items: [['teiler'], []], settings: { shotLimit: 1 } });
    s = useItem(s, { item: 'teiler' }, rng()).state;
    const r = split(s, { 0: 0, 1: 1 }, rng());
    expect(r.state.winner).toBe(1);
    expect(r.state.players[0].out).toBe(true);
    expect(r.state.players[1].out).toBe(false);
  });

  it('Schutzengel kann das Ausscheiden verhindern', () => {
    const s = tableN(3, ['schnaps', 'wasser'], { items: [[], ['schutzengel'], []], settings: { shotLimit: 1 } });
    const r = takeGlass(s, 0, 1, rng());
    const saved = resolvePending(r.state, true, rng());
    expect(saved.state.players[1].out).toBe(false);
  });

  it('Ausgeschiedene bekommen keine Items mehr', () => {
    const s = createGame(baseSettings({ names: NAMES.slice(0, 3), items: true }));
    s.players[1].out = true;
    const r = startRound(s, rng());
    expect(r.state.players[1].items).toEqual([]);
    expect(r.state.players[0].items.length).toBeGreaterThan(0);
  });

  it('ohne Limit scheidet niemand aus', () => {
    const s = tableN(3, ['schnaps', 'wasser']);
    s.players[1].shots = 99;
    expect(takeGlass(s, 0, 1, rng()).state.players[1].out).toBe(false);
  });
});

describe('Zielauswahl bei Items', () => {
  it('Langfinger: klaut beim gewählten Mitspieler', () => {
    const s = tableN(3, ['schnaps', 'wasser', 'wasser'], { items: [['langfinger'], ['wuerfelbecher'], ['aussetzer']] });
    expect(stealable(s, 1)).toEqual(['wuerfelbecher']);
    expect(stealable(s, 2)).toEqual(['aussetzer']);
    const r = useItem(s, { item: 'langfinger', from: 2, steal: { item: 'aussetzer', target: 1 } }, rng());
    expect(r.state.players[2].items).toEqual([]);
    expect(r.state.players[1].items).toEqual(['wuerfelbecher']);
    expect(r.state.skipNext[1]).toBe(true);
    expect(r.events).toContainEqual({ kind: 'item', player: 0, item: 'aussetzer', stolen: true, from: 2, target: 1 });
  });

  it('Langfinger: das Item muss beim Gewählten liegen', () => {
    const s = tableN(3, ['schnaps', 'wasser'], { items: [['langfinger'], ['wuerfelbecher'], []] });
    expect(() => useItem(s, { item: 'langfinger', from: 2, steal: { item: 'wuerfelbecher' } }, rng())).toThrow(RuleError);
  });

  it('Doppelter: beide Gläser an einen gewählten Mitspieler', () => {
    const s = tableN(4, ['schnaps', 'schnaps', 'wasser'], { items: [['doppelter']] });
    const r = useItem(s, { item: 'doppelter', glasses: [0, 1], target: 3 }, rng());
    expect(r.state.players[3].shots).toBe(2);
    expect(r.state.current).toBe(1);
  });

  it('Würfelbecher 1–2: Werfer wählt, wer trinkt', () => {
    const s = tableN(3, ['schnaps', 'wasser'], { items: [['wuerfelbecher']] });
    const r = useItem(s, { item: 'wuerfelbecher' }, fixedRng(0));
    expect(r.events).toContainEqual({ kind: 'dice', value: 1, player: null });
    expect(r.state.beerPick).toBe(true);
    expect(() => takeGlass(r.state, 0, 'selbst', rng())).toThrow(RuleError);
    expect(() => chooseBeer(r.state, 0)).toThrow(RuleError);
    const c = chooseBeer(r.state, 2);
    expect(c.state.players[2].sips).toBe(1);
    expect(c.state.beerPick).toBe(false);
    expect(c.state.current).toBe(0);
  });

  it('Würfelbecher 3–6: Werfer trinkt selbst, keine Wahl', () => {
    const r = useItem(tableN(3, ['schnaps', 'wasser'], { items: [['wuerfelbecher']] }), { item: 'wuerfelbecher' }, fixedRng(0.9));
    expect(r.state.beerPick).toBe(false);
    expect(r.state.players[0].sips).toBe(1);
  });

  it('Münzteiler: Zufallsauswahl unter allen aktiven Spielern', () => {
    const s = tableN(4, ['schnaps', 'wasser', 'wasser', 'wasser'], { items: [['muenzteiler']] });
    s.players[1].out = true;
    // aktive: 0, 2, 3 → 0.5 trifft Index 1 = Spieler 2
    const r = useItem(s, { item: 'muenzteiler' }, fixedRng(0.5));
    expect(r.state.splitter).toBe(2);
  });
});

describe('Gleichmäßige Verteilung (Teiler)', () => {
  it.each([
    [3, 7, 2, 1],
    [4, 6, 1, 2],
    [5, 12, 2, 2],
    [6, 6, 1, 0],
    [3, 3, 1, 0],
  ])('%i Spieler, %i Gläser → je %i, %i bleiben stehen', (players, glasses, share, rest) => {
    const contents = Array.from({ length: glasses }, (_, i): Content => (i === 0 ? 'schnaps' : 'wasser'));
    let s = tableN(players, contents, { items: [['teiler']] });
    expect(splitShare(s)).toBe(share);
    s = useItem(s, { item: 'teiler' }, rng()).state;
    const a: Record<number, number> = {};
    for (let p = 0; p < players; p++) for (let k = 0; k < share; k++) a[p * share + k] = p;
    const r = split(s, a, rng());
    expect(r.state.glasses.filter((g) => !g.empty)).toHaveLength(rest);
    for (let p = 0; p < players; p++) expect(r.state.glasses.filter((g) => g.drunkBy === p)).toHaveLength(share);
    expect(r.state.phase).toBe(rest ? 'zug' : 'rundenende');
  });

  it('ungleiche Zuteilung wird abgelehnt', () => {
    let s = tableN(3, ['schnaps', 'wasser', 'wasser', 'wasser', 'wasser', 'wasser'], { items: [['teiler']] });
    s = useItem(s, { item: 'teiler' }, rng()).state;
    expect(() => split(s, { 0: 0, 1: 0, 2: 1, 3: 1, 4: 1, 5: 2 }, rng())).toThrow(RuleError);
  });

  it('ausgeschiedene Spieler bekommen nichts', () => {
    let s = tableN(3, ['schnaps', 'wasser', 'wasser', 'wasser'], { items: [['teiler']] });
    s.players[2].out = true;
    s = useItem(s, { item: 'teiler' }, rng()).state;
    expect(splitShare(s)).toBe(2);
    expect(() => split(s, { 0: 0, 1: 1, 2: 2, 3: 0 }, rng())).toThrow(RuleError);
    expect(split(s, { 0: 0, 1: 0, 2: 1, 3: 1 }, rng()).state.phase).toBe('rundenende');
  });

  it('gesperrt, wenn weniger Gläser als Spieler übrig sind', () => {
    const s = tableN(4, ['schnaps', 'wasser', 'wasser'], { items: [['teiler']] });
    expect(blockReason(s, 'teiler')).toBe('Zu wenige Gläser für alle');
  });
});

describe('Zufallsspiele mit 2–6 Spielern', () => {
  it('enden immer sauber, mit und ohne Shot-Limit', () => {
    const r = seededRng(777);
    for (let game = 0; game < 400; game++) {
      const n = 2 + (game % 5);
      let s = createGame(
        baseSettings({ names: NAMES.slice(0, n), items: true, glassCount: 'zufall', shotLimit: game % 2 ? 3 : null }),
      );
      for (let round = 0; round < 30 && s.phase !== 'spielende'; round++) {
        s = flipStarter(startRound(s, r).state, r).state;
        for (let step = 0; step < 100 && s.phase === 'zug'; step++) {
          if (s.pending.length) {
            s = resolvePending(s, r() < 0.5, r).state;
            continue;
          }
          if (s.beerPick) {
            s = chooseBeer(s, nextActive(s, s.current)).state;
            continue;
          }
          // Sobald nichts mehr offen ist, ist nie ein Ausgeschiedener am Zug
          expect(s.players[s.current].out).toBe(false);
          const open = s.glasses.filter((g) => !g.empty).map((g) => g.id);
          const active = s.players.map((_, i) => i).filter((i) => !s.players[i].out);
          if (s.splitter !== null) {
            const share = splitShare(s);
            const a: Record<number, number> = {};
            active.forEach((p, k) => open.slice(k * share, (k + 1) * share).forEach((id) => (a[id] = p)));
            s = split(s, a, r).state;
            continue;
          }
          const other = nextActive(s, s.current);
          const usable = s.players[s.current].items.filter((it) => blockReason(s, it) === null);
          if (usable.length && r() < 0.5) {
            const item = usable[0];
            const req =
              item === 'doppelter'
                ? { item, glasses: [open[0], open[1]], target: other }
                : item === 'aussetzer'
                  ? { item, target: active.find((p) => p !== s.current && !s.skipNext[p]) }
                  : item === 'langfinger'
                    ? (() => {
                        const from = active.find((p) => p !== s.current && stealable(s, p).includes('wuerfelbecher'));
                        return from === undefined ? null : { item, from, steal: { item: 'wuerfelbecher' } };
                      })()
                    : ['spuernase', 'bierpause', 'abraeumer', 'wendehals'].includes(item)
                      ? { item, glass: open[0] }
                      : { item };
            if (req) {
              s = useItem(s, req as never, r).state;
              continue;
            }
          }
          const glass = s.forcedGlass ?? open[0];
          s = takeGlass(s, glass, r() < 0.5 ? 'selbst' : other, r).state;
        }
        if (s.phase === 'spielende') break;
        expect(s.phase).toBe('rundenende');
      }
      if (s.phase === 'spielende') {
        expect(s.players.filter((p) => !p.out)).toHaveLength(1);
        expect(s.players[s.winner!].out).toBe(false);
      }
    }
  });
});
