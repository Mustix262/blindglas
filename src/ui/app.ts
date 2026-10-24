import { createGame, flipStarter, glassNo, other, remaining, resolvePending, startRound, takeGlass } from '../game/engine';
import { ITEMS } from '../game/inventory';
import { blockReason, split, splitShare, stealable, useItem, type ItemRequest } from '../game/items';
import { defaultRng } from '../game/rng';
import { RuleError, type GameEvent, type GameState, type ItemId, type PlayerIndex, type Result, type Settings, type Target } from '../game/types';
import { buzz, isMuted, setMuted, sfx, unlockAudio } from './fx';
import { beerSvg, dieFace, glassSvg, itemIcon, shotSvg, speakerSvg } from './icons';
import { rulesHtml } from './rules';
import { loadGame, loadPrefs, saveGame, savePrefs, type SavedGame } from './storage';

type GlassItem = 'spuernase' | 'bierpause' | 'abraeumer' | 'wendehals' | 'doppelter';
const GLASS_ITEMS: ItemId[] = ['spuernase', 'bierpause', 'abraeumer', 'wendehals', 'doppelter'];

type Sheet =
  | { kind: 'item'; item: ItemId; owner: PlayerIndex }
  | { kind: 'steal' }
  | { kind: 'menu' }
  | { kind: 'rules' }
  | { kind: 'confirmNew' }
  | { kind: 'barkeeper' };

interface Ui {
  setup: Settings;
  selected: number[];
  mode: { item: GlassItem; steal: boolean } | null;
  split: Record<number, PlayerIndex>;
  sheet: Sheet | null;
  secretOpen: boolean;
  readyAt: number;
  lastGlasses: number[];
  fxFor: GameEvent | null;
  toast: string | null;
}

const prefs = loadPrefs();
setMuted(prefs.muted);
let game: SavedGame | null = loadGame();

const ui: Ui = {
  setup: prefs.lastSettings ?? { names: ['', ''], glassCount: 6, items: true, barkeeper: false },
  selected: [],
  mode: null,
  split: {},
  sheet: null,
  secretOpen: false,
  readyAt: 0,
  lastGlasses: [],
  fxFor: null,
  toast: null,
};

let root: HTMLElement;
let toastTimer = 0;

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nameOf = (s: GameState, p: PlayerIndex | 'barkeeper') => (p === 'barkeeper' ? 'Barkeeper' : esc(s.players[p].name));

export function mount(el: HTMLElement) {
  root = el;
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  render();
}

// ---------------------------------------------------------------- Ablauf

function persist() {
  saveGame(game);
}

function resetSelection() {
  ui.selected = [];
  ui.mode = null;
  ui.split = {};
}

/** Wendet einen Spielzug an und reiht die anzuzeigenden Ereignisse ein. */
function act(fn: (s: GameState) => Result) {
  if (!game) return;
  try {
    const r = fn(game.state);
    game.state = r.state;
    game.queue.push(...visible(r.events));
    resetSelection();
    ui.sheet = null;
    persist();
  } catch (e) {
    if (e instanceof RuleError) toast(e.message);
    else throw e;
  }
  render();
}

/** Filtert Ereignisse, die keinen eigenen Bildschirm brauchen. */
function visible(events: GameEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  events.forEach((e, i) => {
    const prev = events[i - 1];
    if (e.kind === 'shot' || e.kind === 'dealt' || e.kind === 'roundEnd' || e.kind === 'beer' || e.kind === 'splitStart') return;
    if (e.kind === 'turn' && (e.again || (prev?.kind === 'coin' && prev.reason === 'start'))) return;
    if (e.kind === 'item' && e.item === 'langfinger') return;
    if (e.kind === 'reveal' && e.glasses.length === 0) return;
    out.push(e);
  });
  return out;
}

function toast(msg: string) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast = null;
    render();
  }, 2400);
}

function newGame() {
  const settings: Settings = {
    ...ui.setup,
    names: [ui.setup.names[0].trim() || 'Spieler 1', ui.setup.names[1].trim() || 'Spieler 2'],
  };
  prefs.lastSettings = { ...settings, names: [...settings.names] };
  savePrefs(prefs);
  const r = startRound(createGame(settings), defaultRng);
  game = { state: r.state, queue: [], barkeeperDone: false };
  resetSelection();
  persist();
  render();
}

function nextRound() {
  if (!game) return;
  game.barkeeperDone = false;
  act((s) => startRound(s, defaultRng));
}

const wrap = (req: ItemRequest, steal: boolean): ItemRequest =>
  steal ? { item: 'langfinger', steal: req } : req;

function startItem(item: ItemId, steal: boolean) {
  ui.sheet = null;
  if (GLASS_ITEMS.includes(item)) {
    ui.mode = { item: item as GlassItem, steal };
    ui.selected = [];
    render();
    return;
  }
  ui.lastGlasses = [];
  act((s) => useItem(s, wrap({ item } as ItemRequest, steal), defaultRng));
}

// ---------------------------------------------------------------- Eingaben

function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  if (t.name === 'name0') ui.setup.names[0] = t.value;
  if (t.name === 'name1') ui.setup.names[1] = t.value;
}

function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  unlockAudio();
  const act = el.dataset.act!;
  const arg = el.dataset.arg ?? '';
  handle(act, arg);
}

function handle(action: string, arg: string) {
  const s = game?.state;
  switch (action) {
    // Setup
    case 'count':
      ui.setup.glassCount = arg === 'zufall' ? 'zufall' : Number(arg);
      sfx.tap();
      return render();
    case 'toggle': {
      const key = arg as 'items' | 'barkeeper';
      ui.setup[key] = !ui.setup[key];
      sfx.tap();
      return render();
    }
    case 'start':
      sfx.turn();
      return newGame();

    // Allgemein
    case 'sound':
      setMuted(!isMuted());
      prefs.muted = isMuted();
      savePrefs(prefs);
      unlockAudio();
      sfx.tap();
      return render();
    case 'sheet':
      ui.sheet = { kind: arg } as Sheet;
      ui.secretOpen = false;
      sfx.tap();
      return render();
    case 'close':
      ui.sheet = null;
      return render();
    case 'newGame':
      game = null;
      persist();
      ui.sheet = null;
      resetSelection();
      return render();

    // Overlays
    case 'next':
      if (!game || Date.now() < ui.readyAt) return;
      game.queue.shift();
      ui.secretOpen = false;
      persist();
      sfx.tap();
      return render();
    case 'peek':
      ui.secretOpen = true;
      sfx.secret();
      buzz('light');
      return render();
    case 'angel':
      return act((st) => resolvePending(st, arg === 'ja', defaultRng));

    // Rundenstart
    case 'barkeeperDone':
      if (game) game.barkeeperDone = true;
      ui.sheet = null;
      persist();
      return render();
    case 'coin':
      return act((st) => flipStarter(st, defaultRng));
    case 'nextRound':
      return nextRound();

    // Brett
    case 'glass':
      return tapGlass(Number(arg));
    case 'take': {
      const target = arg as Target;
      if (ui.mode?.item === 'doppelter') {
        const [a, b] = ui.selected;
        const steal = ui.mode.steal;
        ui.lastGlasses = [a, b];
        return act((st) => useItem(st, wrap({ item: 'doppelter', glasses: [a, b], target }, steal), defaultRng));
      }
      const id = s?.forcedGlass ?? ui.selected[0];
      return act((st) => takeGlass(st, id, target, defaultRng));
    }
    case 'cancel':
      resetSelection();
      sfx.tap();
      return render();
    case 'item': {
      const [owner, item] = arg.split(':');
      ui.sheet = { kind: 'item', item: item as ItemId, owner: Number(owner) as PlayerIndex };
      sfx.tap();
      return render();
    }
    case 'useItem':
      if (arg === 'langfinger') {
        ui.sheet = { kind: 'steal' };
        return render();
      }
      return startItem(arg as ItemId, false);
    case 'steal':
      return startItem(arg as ItemId, true);
    case 'split':
      return act((st) => split(st, ui.split, defaultRng));
  }
}

function tapGlass(id: number) {
  const s = game?.state;
  if (!s || s.phase !== 'zug' || s.glasses[id]?.empty) return;
  sfx.tap();
  if (s.splitter !== null) {
    const cur = ui.split[id];
    const share = splitShare(s);
    const count = (p: PlayerIndex) => Object.values(ui.split).filter((v) => v === p).length;
    delete ui.split[id];
    // Reihum: frei → Spieler 1 → Spieler 2 → frei (volle Seiten werden übersprungen)
    const order: (PlayerIndex | undefined)[] = [0, 1, undefined];
    let i = order.indexOf(cur);
    for (let n = 0; n < 3; n++) {
      i = (i + 1) % 3;
      const p = order[i];
      if (p === undefined || count(p) < share) {
        if (p !== undefined) ui.split[id] = p;
        break;
      }
    }
    return render();
  }
  if (s.forcedGlass !== null || s.pending.length) return;
  if (ui.mode) {
    if (ui.mode.item === 'doppelter') {
      ui.selected = ui.selected.includes(id) ? ui.selected.filter((g) => g !== id) : [...ui.selected, id].slice(-2);
      return render();
    }
    const { item, steal } = ui.mode;
    ui.lastGlasses = [id];
    return act((st) => useItem(st, wrap({ item, glass: id } as ItemRequest, steal), defaultRng));
  }
  ui.selected = ui.selected[0] === id ? [] : [id];
  render();
}

// ---------------------------------------------------------------- Darstellung

function render() {
  const s = game?.state;
  let html: string;
  if (!s) html = setupScreen();
  else if (s.phase === 'rundenstart') html = introScreen(s);
  else if (s.phase === 'rundenende') html = endScreen(s);
  else html = boardScreen(s);
  html += overlay();
  html += sheet();
  if (ui.toast) html += `<div class="toast" role="status">${esc(ui.toast)}</div>`;
  root.innerHTML = html;
  runOverlayFx();
}

function topbar(s?: GameState) {
  const title = s ? `RUNDE ${s.round}` : 'LAST CALL';
  return `<header class="topbar">
    <span class="topbar-title">${title}</span>
    <span class="topbar-btns">
      <button class="icon-btn" data-act="sound" aria-label="Ton ${isMuted() ? 'einschalten' : 'ausschalten'}">${speakerSvg(isMuted())}</button>
      <button class="icon-btn" data-act="sheet" data-arg="rules" aria-label="Regeln">?</button>
      ${s ? `<button class="icon-btn" data-act="sheet" data-arg="menu" aria-label="Menü">≡</button>` : ''}
    </span>
  </header>`;
}

function setupScreen() {
  const st = ui.setup;
  const counts = [2, 3, 4, 5, 6, 7, 8]
    .map((n) => `<button class="chip ${st.glassCount === n ? 'on' : ''}" data-act="count" data-arg="${n}">${n}</button>`)
    .join('');
  const toggle = (key: 'items' | 'barkeeper', label: string, hint: string) => `
    <button class="toggle ${st[key] ? 'on' : ''}" data-act="toggle" data-arg="${key}" role="switch" aria-checked="${st[key]}">
      <span><b>${label}</b><small>${hint}</small></span><span class="knob">${st[key] ? 'AN' : 'AUS'}</span>
    </button>`;
  return `${topbar()}
  <main class="screen setup">
    <div class="logo"><span>LAST</span><span>CALL</span></div>
    <p class="tagline">Schnaps oder Wasser? Nur das Handy weiß es.</p>
    <section class="panel">
      <label class="field"><span>Spieler 1</span><input name="name0" maxlength="14" autocomplete="off" placeholder="Name" value="${esc(st.names[0])}"></label>
      <label class="field"><span>Spieler 2</span><input name="name1" maxlength="14" autocomplete="off" placeholder="Name" value="${esc(st.names[1])}"></label>
    </section>
    <section class="panel">
      <h3>Gläser pro Runde</h3>
      <div class="chips">${counts}<button class="chip wide ${st.glassCount === 'zufall' ? 'on' : ''}" data-act="count" data-arg="zufall">ZUFALL</button></div>
    </section>
    <section class="panel">
      ${toggle('items', 'Items', '2–4 Spezialkarten pro Runde')}
      ${toggle('barkeeper', 'Mit echtem Barkeeper', 'Eine dritte Person befüllt echte Gläser nach geheimer Anweisung')}
    </section>
    <button class="btn primary big" data-act="start">SPIEL STARTEN</button>
    <p class="fineprint">Trinkt verantwortungsvoll. Nur für Erwachsene.</p>
  </main>`;
}

function scoreboard(s: GameState) {
  const card = (p: PlayerIndex) => {
    const pl = s.players[p];
    const active = s.phase === 'zug' && s.current === p && s.splitter === null;
    return `<div class="score ${active ? 'active' : ''}">
      <div class="score-name">${esc(pl.name)}${s.skipNext[p] ? '<em class="badge">SETZT AUS</em>' : ''}</div>
      <div class="score-nums"><span title="Schnäpse"><b>${pl.shots}</b>${shotSvg()}</span><span title="Schlucke Bier"><b>${pl.sips}</b>${beerSvg()}</span></div>
    </div>`;
  };
  const bk = s.settings.barkeeper && s.barkeeperShots ? `<div class="barkeeper-score">Barkeeper: ${s.barkeeperShots} ${shotSvg()}</div>` : '';
  return `<div class="scores">${card(0)}${card(1)}</div>${bk}`;
}

function announce(s: GameState) {
  return `<div class="announce">
    <span class="a-schnaps">${s.announced.schnaps}× SCHNAPS</span>
    <span class="a-sep">·</span>
    <span class="a-wasser">${s.announced.wasser}× WASSER</span>
  </div>`;
}

function introScreen(s: GameState) {
  const items = (p: PlayerIndex) =>
    s.settings.items
      ? `<div class="intro-items"><h4>${esc(s.players[p].name)}</h4><div class="item-row">${
          s.players[p].items.map((it) => itemChip(p, it, true)).join('') || '<small>keine</small>'
        }</div></div>`
      : '';
  const needBk = s.settings.barkeeper && !game!.barkeeperDone;
  return `${topbar(s)}
  <main class="screen intro">
    ${scoreboard(s)}
    <h1 class="big-title">RUNDE ${s.round}</h1>
    <p class="muted">Auf dem Tisch stehen</p>
    ${announce(s)}
    <div class="intro-glasses">${s.glasses.map(() => `<span class="mini-glass">${glassSvg(true)}</span>`).join('')}</div>
    <p class="muted small">Welches Glas was enthält, weiß niemand.</p>
    ${items(0)}${items(1)}
    ${
      needBk
        ? `<button class="btn primary big" data-act="sheet" data-arg="barkeeper">BARKEEPER: GLÄSER BEFÜLLEN</button>`
        : `<button class="btn primary big" data-act="coin">MÜNZE WERFEN</button>`
    }
  </main>`;
}

function endScreen(s: GameState) {
  const revealed = s.glasses
    .map((g) => {
      const who = g.drunkBy === undefined || g.drunkBy === 'niemand' ? 'weg' : nameOf(s, g.drunkBy);
      return `<div class="end-glass ${g.content}">${glassSvg(false)}<small>${glassNo(g.id)}</small><small>${who}</small></div>`;
    })
    .join('');
  return `${topbar(s)}
  <main class="screen end">
    <h1 class="big-title">RUNDE ${s.round} VORBEI</h1>
    ${scoreboard(s)}
    <div class="end-glasses">${revealed}</div>
    <button class="btn primary big" data-act="nextRound">NÄCHSTE RUNDE</button>
  </main>`;
}

function itemChip(owner: PlayerIndex, item: ItemId, small = false) {
  return `<button class="item-chip ${small ? 'small' : ''}" data-act="item" data-arg="${owner}:${item}">
    ${itemIcon(item)}<span>${ITEMS[item].name}</span></button>`;
}

function boardScreen(s: GameState) {
  const me = s.current;
  const splitting = s.splitter !== null;
  let banner: string;
  if (splitting) {
    const share = splitShare(s);
    const c = (p: PlayerIndex) => Object.values(ui.split).filter((v) => v === p).length;
    const ok = c(0) === share && c(1) === share;
    banner = `<div class="banner split">
      <b>${nameOf(s, s.splitter!)} teilt auf</b>
      <small>Tippe Gläser an: je ${share} für ${nameOf(s, 0)} (${c(0)}/${share}) und ${nameOf(s, 1)} (${c(1)}/${share}).${
        remaining(s).length % 2 ? ' Ein Glas bleibt stehen.' : ''
      }</small>
      <button class="btn primary" data-act="split" ${ok ? '' : 'disabled'}>AUSTRINKEN!</button>
    </div>`;
  } else if (ui.mode) {
    const what =
      ui.mode.item === 'doppelter' ? 'Wähle zwei Gläser' : `Wähle ein Glas für ${ITEMS[ui.mode.item].name}`;
    banner = `<div class="banner mode"><b>${what}</b><button class="btn ghost" data-act="cancel">ABBRECHEN</button></div>`;
  } else if (s.forcedGlass !== null) {
    banner = `<div class="banner"><b>Glas ${glassNo(s.forcedGlass)} muss genommen werden</b></div>`;
  } else {
    banner = `<div class="turn-label"><span class="blink">▶</span> ${nameOf(s, me)} IST DRAN</div>`;
  }

  const glasses = s.glasses
    .map((g) => {
      const sel = ui.selected.includes(g.id) || s.forcedGlass === g.id;
      const owner = ui.split[g.id];
      const tag =
        splitting && owner !== undefined ? `<span class="owner o${owner}">${esc(s.players[owner].name)}</span>` : '';
      const who = g.empty
        ? `<span class="who">${g.drunkBy === 'niemand' ? 'weg' : nameOf(s, g.drunkBy as PlayerIndex | 'barkeeper')}</span>`
        : '';
      return `<button class="glass ${g.empty ? `empty ${g.content}` : 'full'} ${sel ? 'sel' : ''} ${
        owner !== undefined ? `own${owner}` : ''
      }" data-act="glass" data-arg="${g.id}" ${g.empty ? 'disabled' : ''} aria-label="Glas ${glassNo(g.id)}">
        ${glassSvg(!g.empty)}<span class="num">${glassNo(g.id)}</span>${tag}${who}</button>`;
    })
    .join('');

  const myItems = s.settings.items
    ? `<section class="tray">
        <h4>Deine Items</h4>
        <div class="item-row">${s.players[me].items.map((it) => itemChip(me, it)).join('') || '<small class="muted">keine</small>'}</div>
        <h4 class="opp">${nameOf(s, other(me))}</h4>
        <div class="item-row">${s.players[other(me)].items.map((it) => itemChip(other(me), it, true)).join('') || '<small class="muted">keine</small>'}</div>
      </section>`
    : '';

  return `${topbar(s)}
  <main class="screen board">
    ${scoreboard(s)}
    ${announce(s)}
    ${banner}
    <div class="table count-${s.glasses.length}">${glasses}</div>
    ${myItems}
  </main>
  ${decisionSheet(s)}`;
}

function decisionSheet(s: GameState) {
  if (game!.queue.length || s.pending.length || s.splitter !== null) return '';
  const forced = s.forcedGlass !== null;
  const double = ui.mode?.item === 'doppelter';
  if (double ? ui.selected.length !== 2 : !forced && (ui.mode || ui.selected.length !== 1)) return '';
  const opp = nameOf(s, other(s.current));
  const title = double
    ? `Gläser ${ui.selected.map(glassNo).join(' + ')}`
    : `Glas ${glassNo(forced ? s.forcedGlass! : ui.selected[0])}`;
  const plural = double ? 'Beide ' : '';
  const hint = s.settings.items ? 'Wasser = Mutprobe: Extra-Item' : 'Wasser = Mutprobe: nochmal dran';
  return `<div class="sheet decision">
    <h3>${title}</h3>
    <button class="btn primary big" data-act="take" data-arg="selbst">${plural}SELBST TRINKEN<small>${hint}</small></button>
    <button class="btn danger big" data-act="take" data-arg="gegner">${plural}${opp.toUpperCase()} GEBEN</button>
    ${forced ? '' : `<button class="btn ghost" data-act="cancel">ZURÜCK</button>`}
  </div>`;
}

// ---------------------------------------------------------------- Overlays

function overlay(): string {
  const s = game?.state;
  if (!s) return '';
  const e = game!.queue[0];
  if (!e) {
    if (s.pending.length) {
      const p = s.pending[0].player;
      return layer(`
        <div class="ov-icon">${itemIcon('schutzengel')}</div>
        <h2>${nameOf(s, p)}, SCHUTZENGEL?</h2>
        <p>Glas ${glassNo(s.pending[0].glassId)} ist Schnaps. Du darfst stattdessen einen Schluck Wasser trinken.</p>
        <button class="btn primary big" data-act="angel" data-arg="ja">SCHUTZENGEL NUTZEN</button>
        <button class="btn danger big" data-act="angel" data-arg="nein">ICH TRINKE DEN SCHNAPS</button>`, 'angel');
    }
    return '';
  }
  const cont = (label = 'WEITER') => `<button class="btn primary big" data-act="next">${label}</button>`;
  switch (e.kind) {
    case 'coin':
      return layer(
        `<div class="coin-stage"><div class="coin flip${e.winner}">
          <div class="face f0">${esc(s.players[0].name.slice(0, 1).toUpperCase())}</div>
          <div class="face f1">${esc(s.players[1].name.slice(0, 1).toUpperCase())}</div>
        </div></div>
        <div class="after-anim">
          <h2>${nameOf(s, e.winner)} ${e.reason === 'start' ? 'FÄNGT AN' : 'DARF AUFTEILEN'}</h2>
          ${cont(e.reason === 'start' ? `HANDY AN ${nameOf(s, e.winner).toUpperCase()}` : 'WEITER')}
        </div>`,
        'coin-ov',
      );
    case 'turn':
      return layer(
        `<p class="muted">Handy übergeben an</p><h1 class="big-title">${nameOf(s, e.player)}</h1>
        ${cont('ICH BIN BEREIT')}`,
        'turn-ov',
      );
    case 'reveal': {
      const schnaps = e.glasses.filter((g) => g.content === 'schnaps').length;
      const single = e.glasses.length === 1;
      const head = single ? (schnaps ? 'SCHNAPS!' : 'WASSER') : `${schnaps}× SCHNAPS · ${e.glasses.length - schnaps}× WASSER`;
      const who =
        e.drinker === 'niemand'
          ? 'Wird weggekippt.'
          : e.drinker === 'barkeeper'
            ? 'Der Barkeeper muss es trinken.'
            : `${nameOf(s, e.drinker)} trinkt${schnaps ? (schnaps > 1 ? ` ${schnaps} Shots!` : ' einen Shot!') : '. Glück gehabt.'}`;
      const real = s.settings.barkeeper
        ? `<p class="muted small">Echte${single ? 's Glas' : ' Gläser'} ${e.glasses.map((g) => glassNo(g.id)).join(' + ')} ${e.drinker === 'niemand' ? 'wegkippen' : 'leeren'}.</p>`
        : '';
      return layer(
        `<div class="reveal-glasses">${e.glasses
          .map((g) => `<div class="reveal-glass ${g.content}">${glassSvg(true)}<span>${glassNo(g.id)}</span></div>`)
          .join('')}</div>
        <h1 class="reveal-title ${schnaps ? 'schnaps' : 'wasser'}">${head}</h1>
        <p>${who}</p>${real}
        ${cont()}`,
        `reveal-ov ${schnaps ? 'is-schnaps' : 'is-wasser'}`,
      );
    }
    case 'mutprobe':
      return layer(
        `<h1 class="big-title green">MUTPROBE!</h1>
        <p>${nameOf(s, e.player)} hat selbst getrunken – und es war Wasser.</p>
        ${
          e.item
            ? `<div class="ov-icon">${itemIcon(e.item)}</div><p>Extra-Item: <b>${ITEMS[e.item].name}</b></p>`
            : s.settings.items
              ? '<p class="muted">Kein Platz mehr für ein Extra-Item.</p>'
              : `<p><b>${nameOf(s, e.player)} ist nochmal dran.</b></p>`
        }
        ${cont()}`,
      );
    case 'skip':
      return layer(
        `<div class="ov-icon">${itemIcon('aussetzer')}</div>
        <h2>${nameOf(s, e.player)} SETZT AUS</h2>
        <p>${nameOf(s, other(e.player))} ist nochmal dran.</p>${cont()}`,
      );
    case 'protected':
      return layer(
        `<div class="ov-icon">${itemIcon('schutzengel')}</div>
        <h2>SCHUTZENGEL</h2><p>${nameOf(s, e.player)} trinkt statt des Schnapses einen Schluck Wasser.</p>${cont()}`,
        'angel',
      );
    case 'secret': {
      const who = e.viewer === 'barkeeper' ? 'der Barkeeper' : nameOf(s, e.viewer);
      if (!ui.secretOpen) {
        return layer(
          `<div class="eye">◉</div><h2>NUR ${who.toUpperCase()} DARF SCHAUEN</h2>
          <p class="muted">Alle anderen: wegschauen!</p>
          <button class="btn primary big" data-act="peek">TIPPEN ZUM AUFDECKEN</button>`,
          'secret-ov',
        );
      }
      return layer(
        `<p class="muted">Psst …</p><h1 class="secret-text">${esc(e.text)}</h1>
        <button class="btn primary big" data-act="next">VERDECKEN</button>`,
        'secret-ov open',
      );
    }
    case 'item': {
      const me = nameOf(s, e.player);
      const opp = nameOf(s, other(e.player));
      const g = ui.lastGlasses.map(glassNo).join(' + ');
      const effect: Record<ItemId, string> = {
        spuernase: `${me} riecht heimlich an Glas ${g}.`,
        langfinger: '',
        bierpause: `${me}: einen echten Schluck Bier trinken! Danach wird Glas ${g} aufgedeckt und weggekippt.`,
        doppelter: `Zwei Gläser auf einmal: ${g}.`,
        aussetzer: `${opp} setzt den nächsten Zug aus.`,
        abraeumer: `Glas ${g} wird abgeräumt.`,
        teiler: `${me} teilt die Gläser auf.`,
        muenzteiler: 'Die Münze entscheidet, wer die Gläser aufteilt.',
        schutzengel: '',
        fluesterpost: `${me} bekommt gleich einen geheimen Tipp.`,
        wendehals: `Glas ${g} wurde umgedreht. Was jetzt drin ist, weiß keiner.`,
        wuerfelbecher: 'Würfel fallen …',
      };
      const head = e.stolen ? `${me} KLAUT ${opp}: ${ITEMS[e.item].name}` : `${me}: ${ITEMS[e.item].name}`;
      return layer(
        `<div class="ov-icon">${itemIcon(e.item)}</div><h2>${head.toUpperCase()}</h2>
        <p>${effect[e.item]}</p>${cont()}`,
        'item-ov',
      );
    }
    case 'dice':
      return layer(
        `<div class="dice-slot">${dieFace(1)}</div>
        <div class="after-anim">
          <h1 class="big-title">${e.value}</h1>
          <p><b>${nameOf(s, e.player)}</b> trinkt einen Schluck Bier!</p>
          ${cont()}
        </div>`,
        'dice-ov',
      );
    default:
      return '';
  }
}

const layer = (inner: string, cls = '') => `<div class="overlay ${cls}" role="dialog" aria-modal="true"><div class="ov-box">${inner}</div></div>`;

/** Sound, Vibration und Animationen nur einmal pro Ereignis auslösen. */
function runOverlayFx() {
  const e = game?.queue[0] ?? null;
  if (!e || e === ui.fxFor) return;
  ui.fxFor = e;
  ui.readyAt = Date.now() + 350;
  switch (e.kind) {
    case 'coin':
      ui.readyAt = Date.now() + 1900;
      sfx.coin();
      setTimeout(() => {
        sfx.land();
        buzz('light');
      }, 1750);
      break;
    case 'reveal':
      ui.readyAt = Date.now() + 700;
      if (e.glasses.some((g) => g.content === 'schnaps')) {
        sfx.schnaps();
        buzz('strong');
      } else {
        sfx.wasser();
        buzz('light');
      }
      break;
    case 'dice': {
      ui.readyAt = Date.now() + 1300;
      sfx.dice();
      const slot = root.querySelector('.dice-slot');
      let n = 0;
      const timer = setInterval(() => {
        n++;
        if (!slot?.isConnected) return clearInterval(timer);
        slot.innerHTML = dieFace(n >= 10 ? e.value : 1 + Math.floor(Math.random() * 6));
        if (n >= 10) {
          clearInterval(timer);
          buzz('light');
        }
      }, 110);
      break;
    }
    case 'turn':
      sfx.turn();
      break;
    case 'protected':
      sfx.angel();
      break;
    case 'item':
    case 'mutprobe':
    case 'skip':
      sfx.item();
      buzz('light');
      if (e.kind === 'item' && e.item === 'bierpause') sfx.beer();
      break;
  }
}

// ---------------------------------------------------------------- Sheets

function sheet(): string {
  const sh = ui.sheet;
  const s = game?.state;
  if (!sh) return '';
  const wrapSheet = (inner: string, cls = '') =>
    `<div class="scrim" data-act="close"></div><div class="sheet ${cls}" role="dialog" aria-modal="true">${inner}</div>`;
  switch (sh.kind) {
    case 'rules':
      return wrapSheet(`${rulesHtml()}<button class="btn primary" data-act="close">VERSTANDEN</button>`, 'tall rules');
    case 'menu':
      return wrapSheet(`<h3>Menü</h3>
        <button class="btn" data-act="sheet" data-arg="rules">REGELN</button>
        <button class="btn" data-act="sound">TON: ${isMuted() ? 'AUS' : 'AN'}</button>
        <button class="btn danger" data-act="sheet" data-arg="confirmNew">NEUES SPIEL</button>
        <button class="btn ghost" data-act="close">ZURÜCK</button>`);
    case 'confirmNew':
      return wrapSheet(`<h3>Wirklich neu starten?</h3><p>Der aktuelle Spielstand geht verloren.</p>
        <button class="btn danger big" data-act="newGame">JA, NEUES SPIEL</button>
        <button class="btn ghost" data-act="close">ABBRECHEN</button>`);
    case 'barkeeper': {
      if (!s) return '';
      if (!ui.secretOpen) {
        return layer(`<div class="eye">◉</div><h2>NUR DER BARKEEPER DARF SCHAUEN</h2>
          <p class="muted">Spieler: wegschauen! Barkeeper: stell ${s.glasses.length} Gläser nebeneinander und nummeriere sie von links nach rechts.</p>
          <button class="btn primary big" data-act="peek">TIPPEN ZUM AUFDECKEN</button>
          <button class="btn ghost" data-act="close">ZURÜCK</button>`, 'secret-ov');
      }
      return layer(`<h2>SO BEFÜLLEN</h2>
        <ol class="fill-list">${s.glasses.map((g) => `<li class="${g.content}"><b>Glas ${glassNo(g.id)}</b> ${g.content === 'schnaps' ? 'SCHNAPS' : 'WASSER'}</li>`).join('')}</ol>
        <button class="btn primary big" data-act="barkeeperDone">FERTIG – VERDECKEN</button>`, 'secret-ov open');
    }
    case 'steal': {
      if (!s) return '';
      const loot = stealable(s);
      return wrapSheet(`<h3>Was klaust du ${nameOf(s, other(s.current))}?</h3>
        <div class="steal-list">${loot
          .map((it) => `<button class="btn item-btn" data-act="steal" data-arg="${it}">${itemIcon(it)}<span><b>${ITEMS[it].name}</b><small>${ITEMS[it].short}</small></span></button>`)
          .join('')}</div>
        <button class="btn ghost" data-act="close">ABBRECHEN</button>`);
    }
    case 'item': {
      if (!s) return '';
      const info = ITEMS[sh.item];
      const mine = sh.owner === s.current && s.phase === 'zug';
      const why = mine ? blockReason(s, sh.item) : null;
      return wrapSheet(`<div class="ov-icon">${itemIcon(sh.item)}</div>
        <h3>${info.name}</h3><p>${info.short}</p>
        ${
          mine
            ? `<button class="btn primary big" data-act="useItem" data-arg="${sh.item}" ${why ? 'disabled' : ''}>EINSETZEN</button>${why ? `<p class="muted small">${why}</p>` : ''}`
            : sh.owner !== s.current && s.phase === 'zug'
              ? `<p class="muted small">Gehört ${nameOf(s, sh.owner)}.</p>`
              : ''
        }
        <button class="btn ghost" data-act="close">ZURÜCK</button>`);
    }
  }
}
