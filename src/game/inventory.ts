import { randInt, type Rng } from './rng';
import { wording } from './terms';
import type { GameEvent, GameMode, GameState, ItemId, PlayerIndex } from './types';

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
  /** Kommt erst ab so vielen aktiven Spielern in den Item-Pool. */
  minPlayers?: number;
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
    short: 'Schnapp dir ein Item von einem Mitspieler deiner Wahl und setz es sofort ein.',
    weight: 1,
  },
  bierpause: {
    name: '{Bierpause}',
    short: 'Nimm einen echten Schluck {Bier}. Dafür wird ein Glas deiner Wahl aufgedeckt und weggekippt. Du bleibst am Zug.',
    weight: 1,
  },
  doppelter: {
    name: 'Doppelter',
    short: 'Nimm zwei Gläser auf einmal: beide selbst trinken oder beide einem Mitspieler geben.',
    weight: 1,
  },
  aussetzer: {
    name: 'Aussetzer',
    short: 'Ein Mitspieler deiner Wahl muss seinen nächsten Zug aussetzen. Zu zweit bist du dann zweimal hintereinander dran.',
    weight: 1,
  },
  abraeumer: {
    name: 'Abräumer',
    short: 'Ein Glas deiner Wahl wird aufgedeckt und abgeräumt. Mit Barkeeper trinkt er es. Dein Zug endet.',
    weight: 1,
  },
  teiler: {
    name: 'Teiler',
    short: 'Nur im ersten Zug einer Runde: Du verteilst die Gläser gleichmäßig auf alle, die noch dabei sind – jeder trinkt seine. Was übrig bleibt, bleibt stehen.',
    weight: 0.5,
  },
  muenzteiler: {
    name: 'Münzteiler',
    short: 'Wie der Teiler – aber der Zufall (Münze oder Flasche) entscheidet, wer verteilen darf.',
    weight: 0.5,
  },
  schutzengel: {
    name: 'Schutzengel',
    short: 'Rettet dich einmal: Musst du {Schnaps} trinken, darfst du stattdessen einen Schluck Wasser nehmen. Wird automatisch angeboten.',
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
    short: 'Ein Glas deiner Wahl kippt um: {Schnaps} wird Wasser, Wasser wird {Schnaps}. Keiner erfährt das Ergebnis.',
    weight: 1,
  },
  wuerfelbecher: {
    name: 'Würfelbecher',
    short: 'Würfeln! Bei 3–6 nimmst du einen Schluck {Bier}. Bei 1–2 trinkt ein anderer – zu zweit dein Gegenüber, sonst suchst du aus, wer.',
    weight: 1,
  },
  kehrtwende: {
    name: 'Kehrtwende',
    short: 'Die Spielrichtung dreht sich um. Erst ab drei Spielern im Spiel.',
    weight: 1,
    minPlayers: 3,
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Name und Beschreibung passend zum Spielmodus. */
export const itemName = (id: ItemId, mode: GameMode) => wording(ITEMS[id].name, mode);
export const itemText = (id: ItemId, mode: GameMode) => wording(ITEMS[id].short, mode);

/** Items, die bei dieser Spielerzahl ausgeteilt werden können. */
export const itemPool = (players: number) => ITEM_IDS.filter((id) => (ITEMS[id].minPlayers ?? 0) <= players);

export function randomItem(rng: Rng, players = 2): ItemId {
  const pool = itemPool(players);
  const total = pool.reduce((sum, id) => sum + ITEMS[id].weight, 0);
  let r = rng() * total;
  for (const id of pool) {
    r -= ITEMS[id].weight;
    if (r < 0) return id;
  }
  return pool[pool.length - 1];
}

const activeCount = (s: GameState) => s.players.filter((p) => !p.out).length;

/** Gibt ein Item, solange Platz ist. Liefert das Item oder null. */
export function grant(s: GameState, player: PlayerIndex, rng: Rng): ItemId | null {
  const items = s.players[player].items;
  if (items.length >= MAX_ITEMS) return null;
  const item = randomItem(rng, activeCount(s));
  items.push(item);
  return item;
}

/** Zu Rundenbeginn: alle aktiven Spieler bekommen gleich viele (2–4) zufällige Items. */
export function dealRound(s: GameState, rng: Rng, events: GameEvent[]) {
  if (!s.settings.items) return;
  const n = randInt(rng, 2, 4);
  const dealt: ItemId[][] = s.players.map(() => []);
  s.players.forEach((pl, p) => {
    if (pl.out) return;
    for (let i = 0; i < n; i++) {
      const item = grant(s, p, rng);
      if (item) dealt[p].push(item);
    }
  });
  events.push({ kind: 'dealt', items: dealt });
}

export const hasItem = (s: GameState, p: PlayerIndex, item: ItemId) =>
  s.settings.items && s.players[p].items.includes(item);
