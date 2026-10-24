import { randInt, type Rng } from './rng';
import type { GameEvent, GameState, ItemId, PlayerIndex } from './types';

export const MAX_ITEMS = 8;

export interface ItemInfo {
  name: string;
  short: string;
  /** Relative Häufigkeit beim Austeilen. */
  weight: number;
  /** Zeigt jemandem privat etwas → Übergabe-Bildschirm. */
  secret?: boolean;
  /** Wird nicht aktiv benutzt, sondern automatisch angeboten. */
  passive?: boolean;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  spuernase: {
    name: 'Spürnase',
    short: 'Riech heimlich an einem Glas. Danach musst du genau dieses Glas nehmen – selbst trinken oder weitergeben.',
    weight: 1,
    secret: true,
  },
  langfinger: {
    name: 'Langfinger',
    short: 'Schnapp dir ein Item vom Gegenüber und setz es sofort ein.',
    weight: 1,
  },
  bierpause: {
    name: 'Bierpause',
    short: 'Nimm einen echten Schluck Bier. Dafür wird ein Glas deiner Wahl aufgedeckt und weggekippt. Du bleibst am Zug.',
    weight: 1,
  },
  doppelter: {
    name: 'Doppelter',
    short: 'Nimm zwei Gläser auf einmal: beide selbst trinken oder beide weitergeben.',
    weight: 1,
  },
  aussetzer: {
    name: 'Aussetzer',
    short: 'Dein Gegenüber muss den nächsten Zug aussetzen – du bist zweimal hintereinander dran.',
    weight: 1,
  },
  abraeumer: {
    name: 'Abräumer',
    short: 'Ein Glas deiner Wahl wird aufgedeckt und abgeräumt. Mit Barkeeper trinkt er es. Dein Zug endet.',
    weight: 1,
  },
  teiler: {
    name: 'Teiler',
    short: 'Nur im ersten Zug einer Runde: Du teilst alle Gläser gerecht zwischen euch auf, jeder trinkt seine.',
    weight: 0.5,
  },
  muenzteiler: {
    name: 'Münzteiler',
    short: 'Wie der Teiler – aber eine Münze entscheidet, wer aufteilen darf.',
    weight: 0.5,
  },
  schutzengel: {
    name: 'Schutzengel',
    short: 'Rettet dich einmal: Musst du einen Schnaps trinken, darfst du stattdessen einen Schluck Wasser nehmen. Wird automatisch angeboten.',
    weight: 1,
    passive: true,
  },
  fluesterpost: {
    name: 'Flüsterpost',
    short: 'Dir wird heimlich verraten, was in einem zufälligen Glas ist.',
    weight: 1,
    secret: true,
  },
  wendehals: {
    name: 'Wendehals',
    short: 'Ein Glas deiner Wahl kippt um: Schnaps wird Wasser, Wasser wird Schnaps. Keiner erfährt das Ergebnis.',
    weight: 1,
  },
  wuerfelbecher: {
    name: 'Würfelbecher',
    short: 'Würfeln! Bei 1–2 nimmt dein Gegenüber einen Schluck Bier, bei 3–6 du selbst.',
    weight: 1,
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function randomItem(rng: Rng): ItemId {
  const total = ITEM_IDS.reduce((sum, id) => sum + ITEMS[id].weight, 0);
  let r = rng() * total;
  for (const id of ITEM_IDS) {
    r -= ITEMS[id].weight;
    if (r < 0) return id;
  }
  return ITEM_IDS[ITEM_IDS.length - 1];
}

/** Gibt ein Item, solange Platz ist. Liefert das Item oder null. */
export function grant(s: GameState, player: PlayerIndex, rng: Rng): ItemId | null {
  const items = s.players[player].items;
  if (items.length >= MAX_ITEMS) return null;
  const item = randomItem(rng);
  items.push(item);
  return item;
}

/** Zu Rundenbeginn: beide bekommen gleich viele (2–4) zufällige Items. */
export function dealRound(s: GameState, rng: Rng, events: GameEvent[]) {
  if (!s.settings.items) return;
  const n = randInt(rng, 2, 4);
  const dealt: [ItemId[], ItemId[]] = [[], []];
  for (const p of [0, 1] as const) {
    for (let i = 0; i < n; i++) {
      const item = grant(s, p, rng);
      if (item) dealt[p].push(item);
    }
  }
  events.push({ kind: 'dealt', items: dealt });
}

export const hasItem = (s: GameState, p: PlayerIndex, item: ItemId) =>
  s.settings.items && s.players[p].items.includes(item);
