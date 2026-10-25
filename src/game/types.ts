export type Content = 'schnaps' | 'wasser';
/** Sitzplatz eines Spielers (0 … Spielerzahl − 1). */
export type PlayerIndex = number;
/** 'gegner' = der einzige andere aktive Spieler (nur im 2-Spieler-Spiel eindeutig). */
export type Target = 'selbst' | 'gegner' | PlayerIndex;
/** Spielrichtung: 1 = im Uhrzeigersinn (Sitzreihenfolge), −1 = andersherum. */
export type Direction = 1 | -1;
/** 'klassisch' = alkoholfrei, 'alkohol' = mit Schnaps & Bier (nur ab 18). */
export type GameMode = 'klassisch' | 'alkohol';

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
  | 'wuerfelbecher'
  | 'kehrtwende';

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
  /** Hat das Shot-Limit erreicht und wird übersprungen. */
  out: boolean;
  /** Als Wievielter ausgeschieden (0 = zuerst) – für die Rangliste. */
  outOrder?: number;
}

export interface Settings {
  mode: GameMode;
  /** 2–6 Namen in Sitzreihenfolge. */
  names: string[];
  /** 2–12 oder 'zufall' (jede Runde neu ausgewürfelt). */
  glassCount: number | 'zufall';
  items: boolean;
  /** Mit echtem Barkeeper: echte Gläser werden nach Anweisung der App befüllt. */
  barkeeper: boolean;
  /** Ab so vielen Shots scheidet man aus. null = aus. */
  shotLimit: number | null;
}

export type Phase = 'rundenstart' | 'zug' | 'rundenende' | 'spielende';

/** Was nach dem Auflösen aller offenen Schnäpse passiert. */
export type Continuation = 'zugende' | 'mutprobe' | 'weiter';

/** Ein Schnaps, der noch getrunken werden muss – wartet ggf. auf die Schutzengel-Entscheidung. */
export interface PendingShot {
  player: PlayerIndex;
  glassId: number;
}

export interface GameState {
  version: 2;
  settings: Settings;
  players: Player[];
  round: number;
  glasses: Glass[];
  /** Zu Rundenbeginn angesagte Mengen. Werden absichtlich nie aktualisiert. */
  announced: { schnaps: number; wasser: number };
  phase: Phase;
  current: PlayerIndex;
  direction: Direction;
  /** Anzahl beendeter Züge in dieser Runde. 0 = erster Zug. */
  turnNumber: number;
  itemUsed: boolean;
  /** skipNext[i]: Spieler i setzt seinen nächsten Zug aus. */
  skipNext: boolean[];
  /** Nach der Spürnase muss genau dieses Glas genommen werden. */
  forcedGlass: number | null;
  /** Wer gerade beim Teiler die Gläser verteilt. */
  splitter: PlayerIndex | null;
  /** Würfelbecher zeigte 1–2: der aktuelle Spieler muss noch wählen, wer Bier trinkt. */
  beerPick: boolean;
  pending: PendingShot[];
  after: Continuation | null;
  barkeeperShots: number;
  /** Gesetzt, sobald nur noch ein Spieler übrig ist. */
  winner: PlayerIndex | null;
}

export type GameEvent =
  /** Zufallsauswahl unter allen aktiven Spielern (bei zwei Spielern ein Münzwurf). */
  | { kind: 'coin'; winner: PlayerIndex; reason: 'start' | 'teiler' }
  | { kind: 'turn'; player: PlayerIndex; again: boolean }
  | { kind: 'reveal'; glasses: { id: number; content: Content }[]; drinker: Drinker }
  | { kind: 'shot'; player: PlayerIndex | 'barkeeper' }
  | { kind: 'mutprobe'; player: PlayerIndex; item: ItemId | null }
  | { kind: 'roundEnd' }
  | { kind: 'dealt'; items: ItemId[][] }
  | { kind: 'secret'; viewer: PlayerIndex | 'barkeeper'; text: string }
  | { kind: 'item'; player: PlayerIndex; item: ItemId; stolen: boolean; from?: PlayerIndex; target?: PlayerIndex }
  | { kind: 'beer'; player: PlayerIndex }
  | { kind: 'skip'; player: PlayerIndex }
  | { kind: 'protected'; player: PlayerIndex }
  /** player = null: der Werfer wählt noch, wer trinkt. */
  | { kind: 'dice'; value: number; player: PlayerIndex | null }
  | { kind: 'splitStart'; splitter: PlayerIndex }
  | { kind: 'direction'; direction: Direction }
  | { kind: 'out'; player: PlayerIndex }
  | { kind: 'gameOver'; winner: PlayerIndex };

export interface Result {
  state: GameState;
  events: GameEvent[];
}

export class RuleError extends Error {}
