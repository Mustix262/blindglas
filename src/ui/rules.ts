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
    <li>Zu Beginn jeder Runde füllt das Handy 2–8 virtuelle Gläser: mindestens eins mit <b class="r">Schnaps</b>, mindestens eins mit <b class="w">Wasser</b>. Alle erfahren, wie viele es von jeder Sorte sind – aber nicht, welches Glas was ist.</li>
    <li>Eine Münze entscheidet, wer anfängt. Danach wird das Handy hin- und hergereicht.</li>
    <li>Wer dran ist, tippt ein Glas an und entscheidet: <b>selbst trinken</b> oder <b>dem Gegenüber geben</b>. Das Glas wird aufgedeckt. Ist es Schnaps, wird in echt ein Shot getrunken.</li>
    <li>Dann ist der andere dran. Sind alle Gläser leer, startet die nächste Runde. Die Zähler oben zeigen, wer wie viele Shots und Schlucke Bier hatte.</li>
    <li><b>Mutprobe:</b> Trinkst du in deinem Zug selbst und es war Wasser, bist du direkt nochmal dran. Mit Items bekommst du stattdessen ein Extra-Item.</li>
  </ol>
  <h3>Items</h3>
  <p>Jede Runde bekommt ihr beide 2–4 zufällige Items (höchstens 8 auf der Hand). Pro Zug darf nur ein Item eingesetzt werden, danach ist es weg. Der Schutzengel ist die Ausnahme: Er wird automatisch angeboten, wenn du einen Schnaps trinken müsstest. Bei geheimen Infos zeigt die App vorher einen Übergabe-Bildschirm.</p>
  <ul class="rules-items">${items}</ul>
  <h3>Mit echtem Barkeeper</h3>
  <p>Eine dritte Person füllt echte Gläser nach geheimer Anweisung der App und füllt heimlich um, wenn ein Wendehals gespielt wird. Wird ein Glas abgeräumt, trinkt es der Barkeeper.</p>
  <h3>Gut zu wissen</h3>
  <p>Echte Shots dürfen auch klein sein, Wasser zwischendurch ist Pflicht, und wer aufhören will, hört auf. Nie trinken und fahren.</p>
  <p class="muted small">Der Spielstand wird auf diesem Gerät gespeichert. Die App sammelt keine Daten.</p>`;
}
