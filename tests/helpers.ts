import { createGame } from '../src/game/engine';
import type { Content, GameState, ItemId, PlayerIndex, Settings } from '../src/game/types';

export const baseSettings = (over: Partial<Settings> = {}): Settings => ({
  names: ['Anna', 'Ben'],
  glassCount: 4,
  items: false,
  barkeeper: false,
  ...over,
});

/** Baut einen laufenden Zug mit festgelegten Gläsern – ideal für gezielte Tests. */
export function table(
  contents: Content[],
  opts: { current?: PlayerIndex; items?: [ItemId[], ItemId[]]; settings?: Partial<Settings> } = {},
): GameState {
  const s = createGame(baseSettings({ items: !!opts.items, ...opts.settings }));
  s.round = 1;
  s.phase = 'zug';
  s.current = opts.current ?? 0;
  s.glasses = contents.map((content, id) => ({ id, content, empty: false }));
  s.announced = {
    schnaps: contents.filter((c) => c === 'schnaps').length,
    wasser: contents.filter((c) => c === 'wasser').length,
  };
  if (opts.items) {
    s.players[0].items = [...opts.items[0]];
    s.players[1].items = [...opts.items[1]];
  }
  return s;
}

/** Rng, die eine feste Folge zurückgibt (danach 0). */
export const fixedRng = (...values: number[]) => () => values.shift() ?? 0;
