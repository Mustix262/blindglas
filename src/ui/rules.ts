import { ITEM_IDS, ITEMS } from '../game/inventory';
import { itemIcon } from './icons';

export function rulesHtml() {
  const items = ITEM_IDS.map(
    (id) => `<li>${itemIcon(id)}<span><b>${ITEMS[id].name}</b> – ${ITEMS[id].short}</span></li>`,
  ).join('');
  return `
  <h2>So läuft „Last Call“</h2>
  <p class="warn">Trinkt verantwortungsvoll. Nur für Erwachsene.</p>
  <ol class="rules-list">
    <li>2 bis 6 Leute sitzen um den Tisch. Zu Beginn jeder Runde füllt das Handy virtuelle Gläser (standardmäßig 2 pro Spieler): mindestens eins mit <b class="r">Schnaps</b>, mindestens eins mit <b class="w">Wasser</b>. Alle erfahren, wie viele es von jeder Sorte sind – aber nicht, welches Glas was ist.</li>
    <li>Bei zwei Spielern entscheidet eine Münze, wer anfängt, ab drei Spielern die Flasche. Danach geht das Handy reihum in Sitzreihenfolge – vor jedem Zug kommt ein Übergabe-Bildschirm.</li>
    <li>Wer dran ist, tippt ein Glas an und entscheidet: <b>selbst trinken</b> oder <b>jemandem geben</b>. Das Glas wird aufgedeckt. Ist es Schnaps, wird in echt ein Shot getrunken.</li>
    <li>Sind alle Gläser leer, startet die nächste Runde. Oben seht ihr, wer wie viele Shots und Schlucke Bier hatte, wer dran ist und in welche Richtung gespielt wird.</li>
    <li><b>Mutprobe:</b> Trinkst du in deinem Zug selbst und es war Wasser, bist du direkt nochmal dran. Mit Items bekommst du stattdessen ein Extra-Item.</li>
    <li><b>Shot-Limit</b> (optional): Wer es erreicht, ist raus und wird ab dann übersprungen. Wer als Letzter übrig bleibt, gewinnt.</li>
  </ol>
  <h3>Items</h3>
  <p>Jede Runde bekommen alle, die noch dabei sind, 2–4 zufällige Items (höchstens 8 auf der Hand). Pro Zug darf nur ein Item eingesetzt werden, danach ist es weg. Der Schutzengel ist die Ausnahme: Er wird automatisch angeboten, wenn du einen Schnaps trinken müsstest. Bei geheimen Infos zeigt die App vorher einen Übergabe-Bildschirm.</p>
  <ul class="rules-items">${items}</ul>
  <h3>Mit echtem Barkeeper</h3>
  <p>Eine weitere Person füllt echte Gläser nach geheimer Anweisung der App und füllt heimlich um, wenn ein Wendehals gespielt wird. Wird ein Glas abgeräumt, trinkt es der Barkeeper.</p>
  <h3>Gut zu wissen</h3>
  <p>Echte Shots dürfen auch klein sein, Wasser zwischendurch ist Pflicht, und wer aufhören will, hört auf. Wer ausgeschieden ist, trinkt nur noch Wasser. Nie trinken und fahren.</p>
  <p class="muted small">Der Spielstand wird auf diesem Gerät gespeichert. Die App sammelt keine Daten.</p>`;
}
