export type Content = 'schnaps' | 'wasser';
export type PlayerIndex = 0 | 1;
export type Target = 'selbst' | 'gegner';

export type ItemId =
  | 'spuernase'
  | 'langfinger'
  | 'bierpause'
  | 'doppelter'
  | 'aussetzer'
  | 'abraeumer'
  | 'teiler'
  | 'muenzteiler'
  | 'schutzengel'
  | 'fluesterpost'
  | 'wendehals'
  | 'wuerfelbecher';

/** Wer ein Glas geleert hat. 'niemand' = weggekippt, 'barkeeper' = vom Barkeeper getrunken. */
export type Drinker = PlayerIndex | 'niemand' | 'barkeeper';

export interface Glass {
  id: number;
  content: Content;
  empty: boolean;
  drunkBy?: Drinker;
}

export interface Player {
  name: string;
  shots: number;
  sips: number;
  items: ItemId[];
}

export interface Settings {
  names: [string, string];
  /** 2–8 oder 'zufall' (jede Runde neu ausgewürfelt). */
  glassCount: number | 'zufall';
  items: boolean;
  /** Mit echtem Barkeeper: echte Gläser werden nach Anweisung der App befüllt. */
  barkeeper: boolean;
}

export type Phase = 'rundenstart' | 'zug' | 'rundenende';

/** Was nach dem Auflösen aller offenen Schnäpse passiert. */
export type Continuation = 'zugende' | 'mutprobe' | 'weiter';

/** Ein Schnaps, der noch getrunken werden muss – wartet ggf. auf die Schutzengel-Entscheidung. */
export interface PendingShot {
  player: PlayerIndex;
  glassId: number;
}

export interface GameState {
  version: 1;
  settings: Settings;
  players: [Player, Player];
  round: number;
  glasses: Glass[];
  /** Zu Rundenbeginn angesagte Mengen. Werden absichtlich nie aktualisiert. */
  announced: { schnaps: number; wasser: number };
  phase: Phase;
  current: PlayerIndex;
  /** Anzahl beendeter Züge in dieser Runde. 0 = erster Zug. */
  turnNumber: number;
  itemUsed: boolean;
  /** skipNext[i]: Spieler i setzt seinen nächsten Zug aus. */
  skipNext: [boolean, boolean];
  /** Nach der Spürnase muss genau dieses Glas genommen werden. */
  forcedGlass: number | null;
  /** Wer gerade beim Teiler die Gläser verteilt. */
  splitter: PlayerIndex | null;
  pending: PendingShot[];
  after: Continuation | null;
  barkeeperShots: number;
}

export type GameEvent =
  | { kind: 'coin'; winner: PlayerIndex; reason: 'start' | 'teiler' }
  | { kind: 'turn'; player: PlayerIndex; again: boolean }
  | { kind: 'reveal'; glasses: { id: number; content: Content }[]; drinker: Drinker }
  | { kind: 'shot'; player: PlayerIndex | 'barkeeper' }
  | { kind: 'mutprobe'; player: PlayerIndex; item: ItemId | null }
  | { kind: 'roundEnd' }
  | { kind: 'dealt'; items: [ItemId[], ItemId[]] }
  | { kind: 'secret'; viewer: PlayerIndex | 'barkeeper'; text: string }
  | { kind: 'item'; player: PlayerIndex; item: ItemId; stolen: boolean }
  | { kind: 'beer'; player: PlayerIndex }
  | { kind: 'skip'; player: PlayerIndex }
  | { kind: 'protected'; player: PlayerIndex }
  | { kind: 'dice'; value: number; player: PlayerIndex }
  | { kind: 'splitStart'; splitter: PlayerIndex };

export interface Result {
  state: GameState;
  events: GameEvent[];
}

export class RuleError extends Error {}
