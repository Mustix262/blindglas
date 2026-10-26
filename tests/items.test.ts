import { describe, expect, it } from 'vitest';
import { createGame, flipStarter, resolvePending, startRound, takeGlass } from '../src/game/engine';
import { ITEM_IDS, MAX_ITEMS } from '../src/game/inventory';
import { blockReason, split, stealable, useItem } from '../src/game/items';
import { seededRng } from '../src/game/rng';
import { RuleError, type ItemId } from '../src/game/types';
import { baseSettings, fixedRng, table } from './helpers';

const rng = () => seededRng(11);
const mine = (...items: ItemId[]): [ItemId[], ItemId[]] => [items, []];

describe('Austeilen', () => {
  it('beide bekommen pro Runde gleich viele (2–4) Items', () => {
    const r = seededRng(5);
    for (let i = 0; i < 100; i++) {
      const s = startRound(createGame(baseSettings({ items: true })), r).state;
      const [a, b] = s.players.map((p) => p.items.length);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(4);
    }
  });

  it('ohne Items wird nichts ausgeteilt', () => {
    const s = startRound(createGame(baseSettings()), seededRng(1)).state;
    expect(s.players[0].items).toEqual([]);
  });

  it('Items sammeln sich über Runden an, aber höchstens 8', () => {
    let s = createGame(baseSettings({ items: true }));
    const r = seededRng(8);
    for (let i = 0; i < 10; i++) s = startRound({ ...s, phase: 'rundenende' }, r).state;
    expect(s.players[0].items.length).toBe(MAX_ITEMS);
  });
});

describe('allgemeine Item-Regeln', () => {
  it('bis zu 3 Items pro Zug, das 4. ist gesperrt', () => {
    let s = table(['schnaps', 'wasser', 'wasser'], {
      items: mine('aussetzer', 'wuerfelbecher', 'wendehals', 'fluesterpost'),
    });
    s = useItem(s, { item: 'aussetzer' }, rng()).state;
    expect(blockReason(s, 'wuerfelbecher')).toBeNull();
    s = useItem(s, { item: 'wuerfelbecher' }, fixedRng(0.9)).state;
    s = useItem(s, { item: 'wendehals', glass: 1 }, rng()).state;
    expect(s.itemsUsed).toBe(3);
    expect(blockReason(s, 'fluesterpost')).toBe('Höchstens 3 Items pro Zug');
    expect(() => useItem(s, { item: 'fluesterpost' }, rng())).toThrow(RuleError);
    expect(s.current).toBe(0); // Zug läuft noch – Glas nehmen geht weiter
    expect(takeGlass(s, 0, 'gegner', rng()).state.players[1].shots).toBe(1);
  });

  it('der Zähler startet im nächsten Zug wieder bei 0', () => {
    let s = table(['schnaps', 'wasser', 'wasser', 'wasser'], {
      items: [['wuerfelbecher', 'wuerfelbecher', 'wuerfelbecher'], ['wuerfelbecher']],
    });
    for (let i = 0; i < 3; i++) s = useItem(s, { item: 'wuerfelbecher' }, fixedRng(0.9)).state;
    s = takeGlass(s, 1, 'gegner', rng()).state;
    expect(s.current).toBe(1);
    expect(s.itemsUsed).toBe(0);
    expect(blockReason(s, 'wuerfelbecher')).toBeNull();
  });

  it('Langfinger zählt als ein Item, auch wenn er ein geklautes gleich einsetzt', () => {
    let s = table(['schnaps', 'wasser', 'wasser'], { items: [['langfinger', 'wuerfelbecher'], ['aussetzer']] });
    s = useItem(s, { item: 'langfinger', steal: { item: 'aussetzer' } }, rng()).state;
    expect(s.itemsUsed).toBe(1);
    expect(blockReason(s, 'wuerfelbecher')).toBeNull();
  });

  it('nach der Spürnase muss trotzdem sofort das Glas genommen werden', () => {
    let s = table(['schnaps', 'wasser', 'wasser'], { items: mine('spuernase', 'wuerfelbecher') });
    s = useItem(s, { item: 'spuernase', glass: 0 }, rng()).state;
    expect(blockReason(s, 'wuerfelbecher')).toBe('Erst das gerochene Glas nehmen');
  });

  it('Items werden verbraucht', () => {
    const s = useItem(table(['schnaps', 'wasser'], { items: mine('aussetzer', 'aussetzer') }), { item: 'aussetzer' }, rng()).state;
    expect(s.players[0].items).toEqual(['aussetzer']);
  });

  it('nach dem Zug ist wieder ein Item erlaubt', () => {
    let s = table(['schnaps', 'wasser', 'wasser'], { items: [['wuerfelbecher'], ['wuerfelbecher']] });
    s = useItem(s, { item: 'wuerfelbecher' }, rng()).state;
    s = takeGlass(s, 0, 'gegner', rng()).state;
    expect(blockReason(s, 'wuerfelbecher')).toBeNull();
  });

  it('Mutprobe mit Items: Extra-Item statt Extrazug', () => {
    const s = table(['wasser', 'schnaps', 'schnaps'], { items: mine() });
    const r = takeGlass(s, 0, 'selbst', fixedRng(0));
    expect(r.state.current).toBe(1);
    expect(r.state.players[0].items).toHaveLength(1);
    expect(r.events).toContainEqual({ kind: 'mutprobe', player: 0, item: r.state.players[0].items[0] });
  });

  it('jedes Item hat Name und Beschreibung', async () => {
    const { ITEMS } = await import('../src/game/inventory');
    for (const id of ITEM_IDS) expect(ITEMS[id].name.length).toBeGreaterThan(2);
  });
});

describe('Spürnase', () => {
  it('zeigt privat den Inhalt und erzwingt dieses Glas', () => {
    const r = useItem(table(['wasser', 'schnaps', 'wasser'], { items: mine('spuernase') }), { item: 'spuernase', glass: 1 }, rng());
    expect(r.events).toContainEqual({ kind: 'secret', viewer: 0, text: 'Glas 2 ist Schnaps' });
    expect(r.state.forcedGlass).toBe(1);
    expect(() => takeGlass(r.state, 0, 'selbst', rng())).toThrow(RuleError);
    const after = takeGlass(r.state, 1, 'gegner', rng()).state;
    expect(after.players[1].shots).toBe(1);
    expect(after.forcedGlass).toBeNull();
  });
});

describe('Langfinger', () => {
  it('klaut ein Item und setzt es sofort ein', () => {
    const s = table(['schnaps', 'wasser'], { items: [['langfinger'], ['aussetzer', 'wuerfelbecher']] });
    const r = useItem(s, { item: 'langfinger', steal: { item: 'aussetzer' } }, rng());
    expect(r.state.players[0].items).toEqual([]);
    expect(r.state.players[1].items).toEqual(['wuerfelbecher']);
    expect(r.state.skipNext[1]).toBe(true);
    expect(r.events).toContainEqual({ kind: 'item', player: 0, item: 'aussetzer', stolen: true });
  });

  it('kein Diebstahl von Langfinger oder Schutzengel, nur nutzbare Items', () => {
    const s = table(['schnaps', 'wasser', 'wasser'], { items: [['langfinger'], ['langfinger', 'schutzengel', 'aussetzer']] });
    expect(stealable(s)).toEqual(['aussetzer']);
    expect(() => useItem(s, { item: 'langfinger', steal: { item: 'schutzengel' } as never }, rng())).toThrow(RuleError);
  });

  it('nicht nutzbar, wenn es nichts zu holen gibt', () => {
    const s = table(['schnaps', 'wasser'], { items: [['langfinger'], ['schutzengel']] });
    expect(blockReason(s, 'langfinger')).not.toBeNull();
  });

  it('gestohlenes Item muss selbst gerade erlaubt sein', () => {
    const s = table(['schnaps', 'wasser'], { items: [['langfinger'], ['teiler']] });
    s.turnNumber = 2;
    expect(stealable(s)).toEqual([]);
  });
});

describe('Bierpause', () => {
  it('Schluck Bier, Glas weggekippt, Zug geht weiter', () => {
    const r = useItem(table(['schnaps', 'wasser', 'wasser'], { items: mine('bierpause') }), { item: 'bierpause', glass: 0 }, rng());
    expect(r.state.players[0].sips).toBe(1);
    expect(r.state.glasses[0]).toMatchObject({ empty: true, drunkBy: 'niemand' });
    expect(r.state.players[0].shots).toBe(0);
    expect(r.state.current).toBe(0);
    expect(r.state.phase).toBe('zug');
  });

  it('nicht beim letzten Glas', () => {
    const s = table(['schnaps', 'wasser'], { items: mine('bierpause') });
    s.glasses[1].empty = true;
    expect(blockReason(s, 'bierpause')).toBe('Nicht beim letzten Glas');
  });
});

describe('Doppelter', () => {
  it('beide Gläser gehen an den Gegner', () => {
    const r = useItem(
      table(['schnaps', 'schnaps', 'wasser'], { items: mine('doppelter') }),
      { item: 'doppelter', glasses: [0, 1], target: 'gegner' },
      rng(),
    );
    expect(r.state.players[1].shots).toBe(2);
    expect(r.state.current).toBe(1);
  });

  it('beide selbst und beide Wasser = Mutprobe', () => {
    const s = table(['wasser', 'wasser', 'schnaps'], { items: mine('doppelter'), settings: { items: true } });
    const r = useItem(s, { item: 'doppelter', glasses: [0, 1], target: 'selbst' }, fixedRng(0));
    expect(r.events.some((e) => e.kind === 'mutprobe')).toBe(true);
  });

  it('braucht zwei verschiedene Gläser', () => {
    const s = table(['wasser', 'schnaps'], { items: mine('doppelter') });
    expect(() => useItem(s, { item: 'doppelter', glasses: [0, 0], target: 'selbst' }, rng())).toThrow(RuleError);
  });
});

describe('Aussetzer', () => {
  it('Gegner setzt aus, Spieler hat zwei Züge', () => {
    let s = table(['wasser', 'schnaps', 'wasser', 'schnaps'], { items: mine('aussetzer') });
    s = useItem(s, { item: 'aussetzer' }, rng()).state;
    const r = takeGlass(s, 1, 'gegner', rng());
    expect(r.state.current).toBe(0);
    expect(r.events).toContainEqual({ kind: 'skip', player: 1 });
    const r2 = takeGlass(r.state, 3, 'gegner', rng());
    expect(r2.state.current).toBe(1);
  });

  it('nicht stapelbar', () => {
    const s = table(['wasser', 'schnaps'], { items: mine('aussetzer') });
    s.skipNext[1] = true;
    expect(blockReason(s, 'aussetzer')).not.toBeNull();
  });
});

describe('Abräumer', () => {
  it('räumt ein Glas ab und beendet den Zug', () => {
    const r = useItem(table(['schnaps', 'wasser', 'wasser'], { items: mine('abraeumer') }), { item: 'abraeumer', glass: 0 }, rng());
    expect(r.state.glasses[0]).toMatchObject({ empty: true, drunkBy: 'niemand' });
    expect(r.state.players[0].shots + r.state.players[1].shots).toBe(0);
    expect(r.state.current).toBe(1);
  });

  it('mit Barkeeper trinkt der Barkeeper', () => {
    const s = table(['schnaps', 'wasser', 'wasser'], { items: mine('abraeumer'), settings: { barkeeper: true } });
    const r = useItem(s, { item: 'abraeumer', glass: 0 }, rng());
    expect(r.state.barkeeperShots).toBe(1);
  });

  it('beendet die Runde, wenn es das letzte Glas war', () => {
    const s = table(['schnaps', 'wasser'], { items: mine('abraeumer') });
    s.glasses[1].empty = true;
    expect(useItem(s, { item: 'abraeumer', glass: 0 }, rng()).state.phase).toBe('rundenende');
  });
});

describe('Teiler', () => {
  it('nur im ersten Zug', () => {
    const s = table(['schnaps', 'wasser'], { items: mine('teiler') });
    expect(blockReason(s, 'teiler')).toBeNull();
    s.turnNumber = 1;
    expect(blockReason(s, 'teiler')).toBe('Nur im ersten Zug der Runde');
  });

  it('teilt gerecht auf, beide trinken, Runde endet', () => {
    let s = table(['schnaps', 'schnaps', 'wasser', 'wasser'], { items: mine('teiler') });
    s = useItem(s, { item: 'teiler' }, rng()).state;
    expect(s.splitter).toBe(0);
    expect(() => takeGlass(s, 0, 'selbst', rng())).toThrow(RuleError);
    expect(() => split(s, { 0: 1, 1: 1, 2: 1, 3: 0 }, rng())).toThrow(RuleError);
    const r = split(s, { 0: 1, 1: 1, 2: 0, 3: 0 }, rng());
    expect(r.state.players[1].shots).toBe(2);
    expect(r.state.players[0].shots).toBe(0);
    expect(r.state.phase).toBe('rundenende');
  });

  it('bei ungerader Zahl bleibt ein Glas stehen und der Gegner ist dran', () => {
    let s = table(['schnaps', 'wasser', 'wasser'], { items: mine('teiler') });
    s = useItem(s, { item: 'teiler' }, rng()).state;
    const r = split(s, { 0: 0, 1: 1 }, rng());
    expect(r.state.phase).toBe('zug');
    expect(r.state.current).toBe(1);
    expect(r.state.glasses[2].empty).toBe(false);
  });
});

describe('Münzteiler', () => {
  it('die Münze bestimmt, wer aufteilt', () => {
    const s = table(['schnaps', 'wasser'], { items: mine('muenzteiler', 'muenzteiler') });
    expect(useItem(s, { item: 'muenzteiler' }, fixedRng(0.9)).state.splitter).toBe(1);
    const r = useItem(s, { item: 'muenzteiler' }, fixedRng(0.1));
    expect(r.state.splitter).toBe(0);
    expect(r.events).toContainEqual({ kind: 'coin', winner: 0, reason: 'teiler' });
  });
});

describe('Schutzengel', () => {
  it('wird beim nächsten Schnaps angeboten und ersetzt ihn', () => {
    const s = table(['schnaps', 'wasser', 'wasser'], { items: mine('schutzengel') });
    const r = takeGlass(s, 0, 'selbst', rng());
    expect(r.state.pending).toEqual([{ player: 0, glassId: 0 }]);
    expect(r.state.current).toBe(0); // Zug erst nach der Entscheidung vorbei
    const used = resolvePending(r.state, true, rng());
    expect(used.state.players[0].shots).toBe(0);
    expect(used.state.players[0].items).toEqual([]);
    expect(used.state.current).toBe(1);
    const declined = resolvePending(r.state, false, rng());
    expect(declined.state.players[0].shots).toBe(1);
    expect(declined.state.players[0].items).toEqual(['schutzengel']);
  });

  it('schützt auch den Gegner, dem ein Schnaps gegeben wird', () => {
    const s = table(['schnaps', 'wasser'], { items: [[], ['schutzengel']] });
    const r = takeGlass(s, 0, 'gegner', rng());
    expect(r.state.pending[0].player).toBe(1);
  });

  it('bei Wasser wird nichts angeboten', () => {
    const s = table(['wasser', 'schnaps'], { items: mine('schutzengel') });
    expect(takeGlass(s, 0, 'gegner', rng()).state.pending).toEqual([]);
  });

  it('ist passiv und nicht aktiv nutzbar', () => {
    expect(blockReason(table(['wasser', 'schnaps'], { items: mine('schutzengel') }), 'schutzengel')).not.toBeNull();
  });

  it('Doppelter mit zwei Schnäpsen: ein Engel rettet nur einen', () => {
    const s = table(['schnaps', 'schnaps', 'wasser'], { items: [['doppelter'], ['schutzengel']] });
    let r = useItem(s, { item: 'doppelter', glasses: [0, 1], target: 'gegner' }, rng());
    r = resolvePending(r.state, true, rng());
    expect(r.state.pending).toEqual([]);
    expect(r.state.players[1].shots).toBe(1);
  });
});

describe('Flüsterpost', () => {
  it('verrät privat ein zufälliges volles Glas', () => {
    const s = table(['schnaps', 'wasser', 'wasser'], { items: mine('fluesterpost') });
    s.glasses[0].empty = true;
    const r = useItem(s, { item: 'fluesterpost' }, fixedRng(0));
    expect(r.events).toContainEqual({ kind: 'secret', viewer: 0, text: 'Glas 2 ist Wasser' });
    expect(r.state.current).toBe(0);
  });
});

describe('Wendehals', () => {
  it('dreht den Inhalt um, die Ansage bleibt gleich', () => {
    const s = table(['schnaps', 'wasser'], { items: mine('wendehals') });
    const r = useItem(s, { item: 'wendehals', glass: 1 }, rng());
    expect(r.state.glasses[1].content).toBe('schnaps');
    expect(r.state.announced).toEqual({ schnaps: 1, wasser: 1 });
    expect(r.events.some((e) => e.kind === 'secret')).toBe(false);
  });

  it('mit Barkeeper bekommt nur der Barkeeper die Umfüll-Anweisung', () => {
    const s = table(['schnaps', 'wasser'], { items: mine('wendehals'), settings: { barkeeper: true } });
    const r = useItem(s, { item: 'wendehals', glass: 0 }, rng());
    expect(r.events).toContainEqual({ kind: 'secret', viewer: 'barkeeper', text: 'Glas 1 heimlich umfüllen: jetzt Wasser' });
  });
});

describe('Würfelbecher', () => {
  it.each([
    [0.0, 1, 1],
    [0.3, 2, 1],
    [0.4, 3, 0],
    [0.99, 6, 0],
  ])('rng %f → Wurf %i → Spieler %i trinkt Bier', (r, value, player) => {
    const res = useItem(table(['schnaps', 'wasser'], { items: mine('wuerfelbecher') }), { item: 'wuerfelbecher' }, fixedRng(r));
    expect(res.events).toContainEqual({ kind: 'dice', value, player });
    expect(res.state.players[player as 0 | 1].sips).toBe(1);
    expect(res.state.current).toBe(0);
  });
});

describe('Zufallsspiele mit Items', () => {
  it('enden immer sauber', () => {
    const r = seededRng(99);
    for (let game = 0; game < 300; game++) {
      let s = createGame(baseSettings({ items: true, glassCount: 'zufall' }));
      s = flipStarter(startRound(s, r).state, r).state;
      for (let step = 0; step < 60 && s.phase === 'zug'; step++) {
        if (s.pending.length) {
          s = resolvePending(s, r() < 0.5, r).state;
          continue;
        }
        const open = s.glasses.filter((g) => !g.empty).map((g) => g.id);
        if (s.splitter !== null) {
          const n = Math.floor(open.length / 2);
          const a: Record<number, 0 | 1> = {};
          open.slice(0, 2 * n).forEach((id, i) => (a[id] = (i % 2) as 0 | 1));
          s = split(s, a, r).state;
          continue;
        }
        const usable = s.players[s.current].items.filter((it) => blockReason(s, it) === null && it !== 'langfinger');
        if (usable.length && r() < 0.5) {
          const item = usable[0];
          const req =
            item === 'doppelter'
              ? { item, glasses: [open[0], open[1]] as [number, number], target: 'gegner' as const }
              : ['spuernase', 'bierpause', 'abraeumer', 'wendehals'].includes(item)
                ? { item, glass: open[0] }
                : { item };
          s = useItem(s, req as never, r).state;
          continue;
        }
        const glass = s.forcedGlass ?? open[0];
        s = takeGlass(s, glass, r() < 0.5 ? 'selbst' : 'gegner', r).state;
      }
      expect(s.phase).toBe('rundenende');
      expect(s.glasses.every((g) => g.empty)).toBe(true);
    }
  });
});
