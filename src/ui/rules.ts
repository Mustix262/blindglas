import { ITEM_IDS, itemName, itemText } from '../game/inventory';
import { terms } from '../game/terms';
import type { GameMode } from '../game/types';
import { itemIcon } from './icons';
import { LIABILITY } from './pages';

export function rulesHtml(mode: GameMode) {
  const t = terms(mode);
  const items = ITEM_IDS.map(
    (id) => `<li>${itemIcon(id)}<span><b>${itemName(id, mode)}</b> – ${itemText(id, mode)}</span></li>`,
  ).join('');
  return `
  <h2>So läuft „Blindglas“</h2>
  <p class="warn">${LIABILITY}</p>
  <h3>Zwei Modi</h3>
  <ul class="rules-list">
    <li><b>Klassisch</b> (alkoholfrei, für alle): Das „böse“ Glas ist eine <b class="r">Zitrone</b> – ein kleiner Shot Zitronensaft oder etwas anderes Fieses, das ihr vorher festlegt. Statt Bier gibt es einen Schluck Limo.</li>
    <li><b>Alkoholmodus</b> (nur ab 18): Das böse Glas ist ein <b class="r">Schnaps</b>, kleine Strafen sind ein Schluck Bier. Vor dem ersten Spiel bestätigt ihr, dass alle mindestens 18 sind.</li>
  </ul>
  <h3>Ablauf</h3>
  <ol class="rules-list">
    <li>2 bis 6 Leute sitzen um den Tisch. Zu Beginn jeder Runde füllt das Handy virtuelle Gläser (standardmäßig 2 pro Spieler): mindestens eins mit <b class="r">${t.bad}</b>, mindestens eins mit <b class="w">Wasser</b>. Alle erfahren, wie viele es von jeder Sorte sind – aber nicht, welches Glas was ist.</li>
    <li>Bei zwei Spielern entscheidet eine Münze, wer anfängt, ab drei Spielern die Flasche. Danach geht das Handy reihum in Sitzreihenfolge – vor jedem Zug kommt ein Übergabe-Bildschirm.</li>
    <li>Wer dran ist, tippt ein Glas an und entscheidet: <b>selbst trinken</b> oder <b>jemandem geben</b>. Das Glas wird aufgedeckt. Ist es ${t.bad}, wird in echt ein Shot getrunken.</li>
    <li>Sind alle Gläser leer, startet die nächste Runde. Oben seht ihr, wer wie viele Shots und Schlucke ${t.sip} hatte, wer dran ist und in welche Richtung gespielt wird.</li>
    <li><b>Mutprobe:</b> Trinkst du in deinem Zug selbst und es war Wasser, bist du direkt nochmal dran. Mit Items bekommst du stattdessen ein Extra-Item.</li>
    <li><b>Shot-Limit</b> (optional): Wer es erreicht, ist raus und wird ab dann übersprungen. Wer als Letzter übrig bleibt, gewinnt.</li>
  </ol>
  <h3>Items</h3>
  <p>Jede Runde bekommen alle, die noch dabei sind, 2–4 zufällige Items (höchstens 8 auf der Hand). Pro Zug darfst du bis zu 3 Items einsetzen, jedes ist danach weg. Der Schutzengel ist die Ausnahme: Er wird automatisch angeboten, wenn du ${t.bad} trinken müsstest. Bei geheimen Infos zeigt die App vorher einen Übergabe-Bildschirm.</p>
  <ul class="rules-items">${items}</ul>
  <h3>Mit echtem Barkeeper</h3>
  <p>Eine weitere Person füllt echte Gläser nach geheimer Anweisung der App und füllt heimlich um, wenn ein Wendehals gespielt wird. Wird ein Glas abgeräumt, trinkt es der Barkeeper.</p>
  <h3>Gut zu wissen</h3>
  <p>Shots dürfen klein sein, Wasser zwischendurch ist Pflicht, und wer aufhören will, hört auf. Wer ausgeschieden ist, trinkt nur noch Wasser.</p>
  <p class="muted small">Spielstand und Einstellungen bleiben auf diesem Gerät. <a href="#/impressum" data-act="route" data-arg="impressum">Impressum</a> · <a href="#/datenschutz" data-act="route" data-arg="datenschutz">Datenschutz</a></p>`;
}
