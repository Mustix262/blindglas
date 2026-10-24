import { describe, expect, it } from 'vitest';
import { createGame, distribute, flipStarter, startRound, takeGlass } from '../src/game/engine';
import { seededRng } from '../src/game/rng';
import { RuleError } from '../src/game/types';
import { baseSettings, fixedRng, table } from './helpers';

describe('Verteilung', () => {
  it('enthält bei jeder Glasanzahl mindestens einen Schnaps und ein Wasser', () => {
    const rng = seededRng(42);
    for (let count = 2; count <= 8; count++) {
      for (let i = 0; i < 500; i++) {
        const c = distribute(rng, count);
        expect(c).toHaveLength(count);
        expect(c).toContain('schnaps');
        expect(c).toContain('wasser');
      }
    }
  });

  it('erzeugt über viele Runden alle möglichen Mischungen', () => {
    const rng = seededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(distribute(rng, 6).filter((c) => c === 'schnaps').length);
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('lehnt ungültige Glasanzahlen ab', () => {
    expect(() => distribute(seededRng(1), 1)).toThrow(RuleError);
    expect(() => distribute(seededRng(1), 9)).toThrow(RuleError);
  });

  it('würfelt bei "zufall" eine Anzahl von 2 bis 8 aus', () => {
    const rng = seededRng(3);
    const counts = new Set<number>();
    let s = createGame(baseSettings({ glassCount: 'zufall' }));
    for (let i = 0; i < 300; i++) {
      s = startRound({ ...s, phase: 'rundenende' }, rng).state;
      counts.add(s.glasses.length);
    }
    expect([...counts].sort()).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('Rundenstart', () => {
  it('sagt die Mengen an und setzt den Rundenzähler', () => {
    const { state } = startRound(createGame(baseSettings({ glassCount: 5 })), seededRng(9));
    expect(state.round).toBe(1);
    expect(state.glasses).toHaveLength(5);
    expect(state.announced.schnaps + state.announced.wasser).toBe(5);
    expect(state.phase).toBe('rundenstart');
  });

  it('Münzwurf bestimmt den Startspieler', () => {
    const s = startRound(createGame(baseSettings()), seededRng(1)).state;
    expect(flipStarter(s, fixedRng(0.1)).state.current).toBe(0);
    const r = flipStarter(s, fixedRng(0.9));
    expect(r.state.current).toBe(1);
    expect(r.state.phase).toBe('zug');
    expect(r.events[0]).toEqual({ kind: 'coin', winner: 1, reason: 'start' });
  });

  it('verändert den Ausgangszustand nicht', () => {
    const s = createGame(baseSettings());
    const copy = structuredClone(s);
    startRound(s, seededRng(1));
    expect(s).toEqual(copy);
  });
});

describe('Zug', () => {
  it('Schnaps selbst trinken: Zähler steigt, Gegner ist dran', () => {
    const { state, events } = takeGlass(table(['schnaps', 'wasser', 'wasser']), 0, 'selbst', seededRng(1));
    expect(state.players[0].shots).toBe(1);
    expect(state.glasses[0].empty).toBe(true);
    expect(state.current).toBe(1);
    expect(events).toContainEqual({ kind: 'reveal', glasses: [{ id: 0, content: 'schnaps' }], drinker: 0 });
  });

  it('Schnaps dem Gegner geben: Gegner bekommt den Shot', () => {
    const { state } = takeGlass(table(['schnaps', 'wasser']), 0, 'gegner', seededRng(1));
    expect(state.players[1].shots).toBe(1);
    expect(state.players[0].shots).toBe(0);
    expect(state.current).toBe(1);
  });

  it('Wasser an den Gegner: kein Shot, Zug wechselt', () => {
    const { state } = takeGlass(table(['wasser', 'schnaps']), 0, 'gegner', seededRng(1));
    expect(state.players[1].shots).toBe(0);
    expect(state.current).toBe(1);
  });

  it('Mutprobe ohne Items: Wasser selbst getrunken = Extrazug', () => {
    const { state, events } = takeGlass(table(['wasser', 'schnaps', 'wasser']), 0, 'selbst', seededRng(1));
    expect(state.current).toBe(0);
    expect(state.turnNumber).toBe(1);
    expect(events).toContainEqual({ kind: 'mutprobe', player: 0, item: null });
    expect(events).toContainEqual({ kind: 'turn', player: 0, again: true });
  });

  it('ein leeres Glas kann nicht genommen werden', () => {
    const s = takeGlass(table(['schnaps', 'wasser', 'wasser']), 0, 'gegner', seededRng(1)).state;
    expect(() => takeGlass(s, 0, 'selbst', seededRng(1))).toThrow(RuleError);
  });
});

describe('Rundenende', () => {
  it('endet, wenn das letzte Glas leer ist', () => {
    let s = table(['schnaps', 'wasser']);
    s = takeGlass(s, 0, 'gegner', seededRng(1)).state;
    const r = takeGlass(s, 1, 'gegner', seededRng(1));
    expect(r.state.phase).toBe('rundenende');
    expect(r.events.at(-1)).toEqual({ kind: 'roundEnd' });
  });

  it('endet auch, wenn das letzte Glas per Mutprobe getrunken wird', () => {
    let s = table(['schnaps', 'wasser']);
    s = takeGlass(s, 0, 'gegner', seededRng(1)).state; // Ben ist dran
    const r = takeGlass(s, 1, 'selbst', seededRng(1));
    expect(r.state.phase).toBe('rundenende');
  });

  it('Zähler bleiben über Runden erhalten, neue Runde füllt neu auf', () => {
    let s = table(['schnaps', 'wasser']);
    s = takeGlass(s, 0, 'selbst', seededRng(1)).state;
    s = takeGlass(s, 1, 'gegner', seededRng(1)).state;
    const next = startRound(s, seededRng(5)).state;
    expect(next.round).toBe(2);
    expect(next.players[0].shots).toBe(1);
    expect(next.glasses.every((g) => !g.empty)).toBe(true);
  });

  it('komplette Zufallsspiele enden immer und zählen alle Schnäpse', () => {
    const rng = seededRng(2024);
    for (let game = 0; game < 200; game++) {
      let s = createGame(baseSettings({ glassCount: 'zufall' }));
      s = startRound(s, rng).state;
      const total = s.announced.schnaps;
      s = flipStarter(s, rng).state;
      let guard = 0;
      while (s.phase === 'zug' && guard++ < 20) {
        const open = s.glasses.filter((g) => !g.empty);
        const g = open[Math.floor(rng() * open.length)];
        s = takeGlass(s, g.id, rng() < 0.5 ? 'selbst' : 'gegner', rng).state;
      }
      expect(s.phase).toBe('rundenende');
      expect(s.players[0].shots + s.players[1].shots).toBe(total);
    }
  });
});
