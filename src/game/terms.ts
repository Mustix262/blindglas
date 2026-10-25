import type { Content, GameMode } from './types';

/**
 * Wörter, die vom Spielmodus abhängen. Die Spielmechanik ist in beiden Modi gleich –
 * nur was getrunken wird, ändert sich.
 */
export interface Terms {
  /** Inhalt des „bösen“ Glases. */
  bad: string;
  /** Genitiv/Dativ-Form, z. B. „statt des Schnapses“. */
  badGen: string;
  /** Das Getränk für einzelne Schlucke (Würfelbecher, Bierpause). */
  sip: string;
  /** Name des Items, bei dem man einen Schluck nimmt. */
  sipItem: string;
  modeName: string;
}

export const TERMS: Record<GameMode, Terms> = {
  alkohol: { bad: 'Schnaps', badGen: 'Schnapses', sip: 'Bier', sipItem: 'Bierpause', modeName: 'Alkoholmodus' },
  klassisch: { bad: 'Zitrone', badGen: 'Zitronen-Shots', sip: 'Limo', sipItem: 'Limopause', modeName: 'Klassisch' },
};

export const terms = (mode: GameMode) => TERMS[mode];

export function contentLabel(c: Content, mode: GameMode): string {
  return c === 'schnaps' ? TERMS[mode].bad : 'Wasser';
}

/** Ersetzt {Schnaps}, {Schnapses}, {Bier} und {Bierpause} in Texten. */
export function wording(text: string, mode: GameMode): string {
  const t = TERMS[mode];
  return text
    .replace(/\{Schnapses\}/g, t.badGen)
    .replace(/\{Schnaps\}/g, t.bad)
    .replace(/\{Bierpause\}/g, t.sipItem)
    .replace(/\{Bier\}/g, t.sip);
}
