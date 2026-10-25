import {
  MAX_GLASSES,
  MAX_PLAYERS,
  MIN_GLASSES,
  MIN_PLAYERS,
  activePlayers,
  createGame,
  defaultGlassCount,
  flipStarter,
  glassNo,
  nextActive,
  opponents,
  remaining,
  resolvePending,
  startRound,
  takeGlass,
} from '../game/engine';
import { itemName, itemText } from '../game/inventory';
import { blockReason, chooseBeer, split, splitShare, stealable, useItem, type ItemRequest } from '../game/items';
import { defaultRng } from '../game/rng';
import { terms } from '../game/terms';
import { RuleError, type GameEvent, type GameMode, type GameState, type ItemId, type PlayerIndex, type Result, type Settings } from '../game/types';
import { LEGAL } from '../config/legal';
import { browserStore, confirmAge, ageConfirmed, needsAgeCheck, needsStatsQuestion, resetAge, setStatsChoice, statsChoice, type StatsChoice } from '../legal/consent';
import { emptyContact, sendContact, validateContact } from '../legal/contact';
import { browserDoNotTrack, statsConfigured, trackPageview } from '../legal/stats';
import { isMuted, setMuted, sfx, unlockAudio } from './fx';
import { arrowSvg, beerSvg, bottleSvg, dieFace, glassSvg, itemIcon, shotSvg, speakerSvg } from './icons';
import { datenschutzHtml, impressumHtml, kontaktHtml, routeFromHash, type ContactUi, type Route } from './pages';
import { rulesHtml } from './rules';
import { loadGame, loadPrefs, saveGame, savePrefs, type SavedGame } from './storage';

type GlassItem = 'spuernase' | 'bierpause' | 'abraeumer' | 'wendehals' | 'doppelter';
const GLASS_ITEMS: ItemId[] = ['spuernase', 'bierpause', 'abraeumer', 'wendehals', 'doppelter'];

/** Wofür gerade ein Mitspieler ausgewählt wird. */
type PickPurpose = 'take' | 'doppelter' | 'aussetzer' | 'langfinger' | 'beer';

type Sheet =
  | { kind: 'item'; item: ItemId; owner: PlayerIndex }
  | { kind: 'steal'; from: PlayerIndex }
  | { kind: 'pick'; purpose: PickPurpose; steal: boolean }
  | { kind: 'menu' }
  | { kind: 'rules' }
  | { kind: 'confirmNew' }
  | { kind: 'barkeeper' };

interface Ui {
  setup: Settings;
  /** Glasanzahl folgt automatisch der Spielerzahl, bis sie von Hand gewählt wird. */
  glassAuto: boolean;
  selected: number[];
  mode: { item: GlassItem; steal: boolean } | null;
  stealFrom: PlayerIndex | null;
  split: Record<number, PlayerIndex>;
  brush: PlayerIndex | null;
  sheet: Sheet | null;
  secretOpen: boolean;
  readyAt: number;
  lastGlasses: number[];
  fxFor: GameEvent | null;
  toast: string | null;
  /** Geöffnete Rechtsseite (Impressum, Datenschutz, Kontakt) oder null fürs Spiel. */
  route: Route | null;
  /** Seite wurde aus der App heraus geöffnet → „Zurück“ geht in der Browser-History zurück. */
  routeFromApp: boolean;
  contact: ContactUi;
  /** Offene Altersabfrage; after = was nach „Bestätigen“ passiert. */
  ageDialog: null | { after: 'mode' | 'start' | 'rematch' };
}

const prefs = loadPrefs();
setMuted(prefs.muted);
let game: SavedGame | null = loadGame();

const store = browserStore();

const DEFAULT_SETUP: Settings = {
  names: ['', ''],
  glassCount: defaultGlassCount(2),
  items: true,
  barkeeper: false,
  shotLimit: null,
  mode: 'klassisch',
};
const initialSetup: Settings = { ...DEFAULT_SETUP, ...prefs.lastSettings };
// Ohne (noch gültige) Altersbestätigung startet das Setup immer alkoholfrei
if (needsAgeCheck(initialSetup.mode, store)) initialSetup.mode = 'klassisch';

const ui: Ui = {
  setup: { ...initialSetup, names: [...initialSetup.names] },
  glassAuto: initialSetup.glassCount === defaultGlassCount(initialSetup.names.length),
  selected: [],
  mode: null,
  stealFrom: null,
  split: {},
  brush: null,
  sheet: null,
  secretOpen: false,
  readyAt: 0,
  lastGlasses: [],
  fxFor: null,
  toast: null,
  route: null,
  routeFromApp: false,
  contact: { fields: emptyContact(), errors: {}, status: 'idle', message: '' },
  ageDialog: null,
};

let root: HTMLElement;
let toastTimer = 0;

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nameOf = (s: GameState, p: PlayerIndex | 'barkeeper') => (p === 'barkeeper' ? 'Barkeeper' : esc(s.players[p].name));
/** Bei genau einem Mitspieler ist das Ziel klar – dann wird nicht gefragt (wie im 2-Spieler-Spiel). */
const soleOpponent = (s: GameState): PlayerIndex | null => {
  const opp = opponents(s);
  return opp.length === 1 ? opp[0] : null;
};

// Wörter hängen vom Spielmodus ab (Klassisch = alkoholfrei, Alkoholmodus = Schnaps & Bier)
const currentMode = (): GameMode => game?.state.settings.mode ?? ui.setup.mode;
const T = () => terms(currentMode());
const BAD = () => T().bad.toUpperCase();
const iName = (id: ItemId) => itemName(id, currentMode());
const iText = (id: ItemId) => itemText(id, currentMode());

/** Seitenaufruf an die Statistik melden – passiert nur mit Einwilligung (siehe legal/stats.ts). */
function track(path: string) {
  trackPageview(
    {
      store,
      fetch: (url, init) => fetch(url, init),
      doNotTrack: browserDoNotTrack(),
      online: navigator.onLine,
      screenWidth: window.screen?.width ?? 0,
    },
    path,
  );
}

function onRoute() {
  ui.route = routeFromHash(location.hash);
  if (!ui.route) ui.routeFromApp = false;
  ui.sheet = null;
  window.scrollTo(0, 0);
  render();
  if (ui.route) track(`/${ui.route}`);
}

function openRoute(route: Route) {
  ui.routeFromApp = true;
  location.hash = `#/${route}`;
}

function closeRoute() {
  if (ui.routeFromApp) {
    history.back();
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  onRoute();
}

async function submitContact() {
  const c = ui.contact;
  if (c.status === 'sending') return;
  c.errors = validateContact(c.fields);
  if (Object.keys(c.errors).length) {
    c.status = 'idle';
    render();
    (root.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
    return;
  }
  c.status = 'sending';
  render();
  const r = await sendContact(c.fields, { fetch: (url, init) => fetch(url, init), online: navigator.onLine });
  if (r.status === 'ok') {
    c.fields = emptyContact();
    c.status = 'ok';
  } else if (r.status === 'invalid') {
    c.errors = r.errors;
    c.status = 'idle';
  } else {
    c.status = r.status;
    c.message = r.status === 'error' ? r.message : '';
  }
  render();
}

export function mount(el: HTMLElement) {
  root = el;
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('pointerdown', onDragStart);
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    if ((e.target as HTMLFormElement).dataset.form === 'contact') void submitContact();
  });
  window.addEventListener('hashchange', onRoute);
  // Wieder online: Offline-Hinweis im Kontaktformular verschwindet, die Nachricht bleibt stehen
  window.addEventListener('online', () => {
    if (ui.contact.status === 'offline') {
      ui.contact.status = 'idle';
      render();
    }
  });
  ui.route = routeFromHash(location.hash);
  render();
  track(ui.route ? `/${ui.route}` : '/');
}

// ---------------------------------------------------------------- Ablauf

function persist() {
  saveGame(game);
}

function resetSelection() {
  ui.selected = [];
  ui.mode = null;
  ui.stealFrom = null;
  ui.split = {};
  ui.brush = null;
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
    if (['shot', 'dealt', 'roundEnd', 'beer', 'splitStart', 'direction'].includes(e.kind)) return;
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

function startGame(settings: Settings) {
  prefs.lastSettings = { ...settings, names: [...settings.names] };
  savePrefs(prefs);
  const r = startRound(createGame(settings), defaultRng);
  game = { state: r.state, queue: [], barkeeperDone: false };
  resetSelection();
  persist();
  render();
}

function newGame() {
  startGame({
    ...ui.setup,
    names: ui.setup.names.map((n, i) => n.trim() || `Spieler ${i + 1}`),
  });
}

function nextRound() {
  if (!game) return;
  game.barkeeperDone = false;
  act((s) => startRound(s, defaultRng));
}

const wrap = (req: ItemRequest, steal: boolean): ItemRequest =>
  steal ? { item: 'langfinger', from: ui.stealFrom ?? undefined, steal: req } : req;

function startItem(item: ItemId, steal: boolean) {
  const s = game!.state;
  ui.sheet = null;
  if (GLASS_ITEMS.includes(item)) {
    ui.mode = { item: item as GlassItem, steal };
    ui.selected = [];
    render();
    return;
  }
  if (item === 'aussetzer') {
    const free = opponents(s).filter((p) => !s.skipNext[p]);
    if (free.length > 1) {
      ui.sheet = { kind: 'pick', purpose: 'aussetzer', steal };
      render();
      return;
    }
    ui.lastGlasses = [];
    act((st) => useItem(st, wrap({ item: 'aussetzer', target: free[0] }, steal), defaultRng));
    return;
  }
  ui.lastGlasses = [];
  act((st) => useItem(st, wrap({ item } as ItemRequest, steal), defaultRng));
}

function pickPlayer(purpose: PickPurpose, steal: boolean, p: PlayerIndex) {
  switch (purpose) {
    case 'take':
      return act((st) => takeGlass(st, st.forcedGlass ?? ui.selected[0], p, defaultRng));
    case 'doppelter': {
      const [a, b] = ui.selected;
      ui.lastGlasses = [a, b];
      return act((st) => useItem(st, wrap({ item: 'doppelter', glasses: [a, b], target: p }, steal), defaultRng));
    }
    case 'aussetzer':
      return act((st) => useItem(st, wrap({ item: 'aussetzer', target: p }, steal), defaultRng));
    case 'langfinger':
      ui.stealFrom = p;
      ui.sheet = { kind: 'steal', from: p };
      return render();
    case 'beer':
      return act((st) => chooseBeer(st, p));
  }
}

// ---------------------------------------------------------------- Setup

function setPlayerCount(names: string[]) {
  ui.setup.names = names;
  if (ui.glassAuto) ui.setup.glassCount = defaultGlassCount(names.length);
}

// Drag & Drop der Sitzreihenfolge (Touch und Maus über Pointer Events)
function onDragStart(e: PointerEvent) {
  const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
  if (!handle) return;
  e.preventDefault();
  const row = handle.closest<HTMLElement>('.player-row')!;
  const list = row.parentElement!;
  row.classList.add('dragging');
  // Auf dem ganzen Dokument lauschen: Beim Umsortieren verliert der Griff sonst den Pointer-Capture
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const rows = [...list.querySelectorAll<HTMLElement>('.player-row')].filter((r) => r !== row);
    const before = rows.find((r) => {
      const box = r.getBoundingClientRect();
      return ev.clientY < box.top + box.height / 2;
    });
    if (before) list.insertBefore(row, before);
    else list.appendChild(row);
  };
  const up = (ev: PointerEvent) => {
    // Auch die Loslass-Position zählt (schnelle Wischer liefern sonst evtl. keine letzte Bewegung)
    if (ev.pointerId !== e.pointerId) return;
    if (ev.type === 'pointerup') move(ev);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    row.classList.remove('dragging');
    const order = [...list.querySelectorAll<HTMLElement>('.player-row')].map((r) => Number(r.dataset.idx));
    ui.setup.names = order.map((i) => ui.setup.names[i]);
    sfx.tap();
    render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- Eingaben

function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  if (t.form?.dataset.form === 'contact') {
    const f = ui.contact.fields;
    if (t.name === 'consent') f.consent = t.checked;
    else if (t.name === 'name' || t.name === 'email' || t.name === 'message' || t.name === 'website') f[t.name] = t.value;
    const key = t.name;
    if (ui.contact.status === 'ok') ui.contact.status = 'idle';
    if (key === 'message') {
      const counter = root.querySelector('[data-count]');
      if (counter) counter.textContent = String(t.value.length);
    }
    return;
  }
  const m = /^name(\d)$/.exec(t.name);
  if (m) ui.setup.names[Number(m[1])] = t.value;
}

function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  if (el.tagName === 'A') e.preventDefault();
  unlockAudio();
  handle(el.dataset.act!, el.dataset.arg ?? '');
}

function handle(action: string, arg: string) {
  const s = game?.state;
  switch (action) {
    // Setup
    case 'addPlayer':
      if (ui.setup.names.length < MAX_PLAYERS) setPlayerCount([...ui.setup.names, '']);
      sfx.tap();
      render();
      (root.querySelector(`input[name="name${ui.setup.names.length - 1}"]`) as HTMLInputElement | null)?.focus();
      return;
    case 'removePlayer':
      if (ui.setup.names.length > MIN_PLAYERS) setPlayerCount(ui.setup.names.filter((_, i) => i !== Number(arg)));
      sfx.tap();
      return render();
    case 'count':
      ui.setup.glassCount = arg === 'zufall' ? 'zufall' : Number(arg);
      ui.glassAuto = arg !== 'zufall' && Number(arg) === defaultGlassCount(ui.setup.names.length);
      sfx.tap();
      return render();
    case 'limit':
      ui.setup.shotLimit = arg === 'aus' ? null : Number(arg);
      sfx.tap();
      return render();
    case 'toggle': {
      const key = arg as 'items' | 'barkeeper';
      ui.setup[key] = !ui.setup[key];
      sfx.tap();
      return render();
    }
    case 'start':
      if (needsAgeCheck(ui.setup.mode, store)) {
        ui.ageDialog = { after: 'start' };
        return render();
      }
      sfx.turn();
      return newGame();
    case 'rematch':
      if (needsAgeCheck(s!.settings.mode, store)) {
        ui.ageDialog = { after: 'rematch' };
        return render();
      }
      sfx.turn();
      return startGame({ ...s!.settings });
    case 'setMode':
      sfx.tap();
      if (arg === 'alkohol' && needsAgeCheck('alkohol', store)) {
        ui.ageDialog = { after: 'mode' };
        return render();
      }
      ui.setup.mode = arg as GameMode;
      return render();
    case 'ageOk': {
      const after = ui.ageDialog?.after;
      confirmAge(store);
      ui.ageDialog = null;
      if (after === 'rematch') return startGame({ ...s!.settings });
      ui.setup.mode = 'alkohol';
      if (after === 'start') return newGame();
      return render();
    }
    case 'ageBack':
      ui.ageDialog = null;
      ui.setup.mode = 'klassisch';
      if (s?.phase === 'spielende') {
        game = null;
        persist();
      }
      return render();
    case 'ageReset':
      resetAge(store);
      if (ui.setup.mode === 'alkohol') ui.setup.mode = 'klassisch';
      ui.sheet = null;
      toast('Altersbestätigung zurückgesetzt.');
      return render();
    case 'stats': {
      const before = statsChoice(store);
      setStatsChoice(store, arg as StatsChoice);
      if (before !== null) toast(arg === 'ja' ? 'Statistik eingeschaltet. Danke!' : 'Statistik ausgeschaltet.');
      render();
      if (arg === 'ja') track(ui.route ? `/${ui.route}` : '/');
      return;
    }
    case 'route':
      ui.sheet = null;
      return openRoute(arg as Route);
    case 'back':
      return closeRoute();
    case 'mail':
      location.href = `mailto:${LEGAL.email.user}@${LEGAL.email.domain}`;
      return;
    case 'toSetup':
      game = null;
      persist();
      resetSelection();
      return render();

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
      ui.stealFrom = null;
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
      if (!s) return;
      const double = ui.mode?.item === 'doppelter';
      if (arg === 'selbst') {
        if (double) return pickPlayer('doppelter', ui.mode!.steal, s.current);
        return act((st) => takeGlass(st, st.forcedGlass ?? ui.selected[0], 'selbst', defaultRng));
      }
      const sole = soleOpponent(s);
      if (sole !== null) return pickPlayer(double ? 'doppelter' : 'take', ui.mode?.steal ?? false, sole);
      ui.sheet = { kind: 'pick', purpose: double ? 'doppelter' : 'take', steal: ui.mode?.steal ?? false };
      sfx.tap();
      return render();
    }
    case 'pick': {
      const sh = ui.sheet;
      if (sh?.kind === 'pick') return pickPlayer(sh.purpose, sh.steal, Number(arg));
      if (s?.beerPick) return pickPlayer('beer', false, Number(arg));
      return;
    }
    case 'brush':
      ui.brush = Number(arg);
      sfx.tap();
      return render();
    case 'cancel':
      resetSelection();
      ui.sheet = null;
      sfx.tap();
      return render();
    case 'item': {
      const [owner, item] = arg.split(':');
      ui.sheet = { kind: 'item', item: item as ItemId, owner: Number(owner) };
      sfx.tap();
      return render();
    }
    case 'useItem':
      if (arg === 'langfinger') {
        const victims = opponents(s!).filter((p) => stealable(s!, p).length);
        if (victims.length === 1) {
          ui.stealFrom = victims[0];
          ui.sheet = { kind: 'steal', from: victims[0] };
        } else {
          ui.sheet = { kind: 'pick', purpose: 'langfinger', steal: false };
        }
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
  if (s.splitter !== null) return assignSplit(s, id);
  if (s.forcedGlass !== null || s.pending.length || s.beerPick) return;
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

/** Teiler: Glas dem gewählten Spieler zuordnen. Ist dessen Anteil voll, geht es beim nächsten weiter. */
function assignSplit(s: GameState, id: number) {
  const share = splitShare(s);
  const players = activePlayers(s);
  const count = (p: PlayerIndex) => Object.values(ui.split).filter((v) => v === p).length;
  const brush = ui.brush ?? players.find((p) => count(p) < share) ?? players[0];
  if (ui.split[id] === brush) {
    delete ui.split[id];
    ui.brush = brush;
    return render();
  }
  if (count(brush) >= share) {
    toast(`${s.players[brush].name} hat schon ${share}`);
    return render();
  }
  ui.split[id] = brush;
  ui.brush = count(brush) >= share ? (players.find((p) => count(p) < share) ?? brush) : brush;
  render();
}

// ---------------------------------------------------------------- Darstellung

function render() {
  const s = game?.state;
  let html: string;
  root.className = `mode-${currentMode()}`;
  if (ui.route) html = pageScreen(ui.route);
  else if (!s) html = setupScreen();
  else if (s.phase === 'rundenstart') html = introScreen(s);
  else if (s.phase === 'rundenende') html = endScreen(s);
  else if (s.phase === 'spielende') html = winnerScreen(s);
  else html = boardScreen(s);
  // Spiel-Einblendungen nur im Spiel, nicht über Impressum & Co.
  if (!ui.route) html += overlay();
  html += sheet();
  html += legalDialogs();
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
      <button class="icon-btn" data-act="sheet" data-arg="menu" aria-label="Menü">≡</button>
    </span>
  </header>`;
}

function setupScreen() {
  const st = ui.setup;
  const n = st.names.length;
  const rows = st.names
    .map(
      (name, i) => `<div class="player-row" data-idx="${i}">
        <span class="drag" data-drag="${i}" aria-label="Verschieben">${'<i></i>'.repeat(3)}</span>
        <span class="seat">${i + 1}</span>
        <input name="name${i}" maxlength="14" autocomplete="off" placeholder="Spieler ${i + 1}" value="${esc(name)}" aria-label="Name Spieler ${i + 1}">
        ${n > MIN_PLAYERS ? `<button class="remove" data-act="removePlayer" data-arg="${i}" aria-label="Spieler entfernen">×</button>` : ''}
      </div>`,
    )
    .join('');
  const counts = Array.from({ length: MAX_GLASSES - MIN_GLASSES + 1 }, (_, k) => k + MIN_GLASSES)
    .map((c) => `<button class="chip ${st.glassCount === c ? 'on' : ''}" data-act="count" data-arg="${c}">${c}</button>`)
    .join('');
  const limits = ['aus', 3, 4, 5, 6, 7, 8, 9, 10]
    .map(
      (l) =>
        `<button class="chip ${l === 'aus' ? 'wide2' : ''} ${(st.shotLimit ?? 'aus') === l ? 'on' : ''}" data-act="limit" data-arg="${l}">${l === 'aus' ? 'AUS' : l}</button>`,
    )
    .join('');
  const toggle = (key: 'items' | 'barkeeper', label: string, hint: string) => `
    <button class="toggle ${st[key] ? 'on' : ''}" data-act="toggle" data-arg="${key}" role="switch" aria-checked="${st[key]}">
      <span><b>${label}</b><small>${hint}</small></span><span class="knob">${st[key] ? 'AN' : 'AUS'}</span>
    </button>`;
  return `${topbar()}
  <main class="screen setup">
    <div class="logo"><span>LAST</span><span>CALL</span></div>
    <p class="tagline">${T().bad} oder Wasser? Nur das Handy weiß es.</p>
    <section class="panel">
      <h3>Modus</h3>
      <div class="modes">
        <button class="mode-btn ${st.mode === 'klassisch' ? 'on' : ''}" data-act="setMode" data-arg="klassisch" aria-pressed="${st.mode === 'klassisch'}">
          <b>KLASSISCH</b><small>Alkoholfrei: Zitrone &amp; Limo</small></button>
        <button class="mode-btn ${st.mode === 'alkohol' ? 'on' : ''}" data-act="setMode" data-arg="alkohol" aria-pressed="${st.mode === 'alkohol'}">
          <b>ALKOHOLMODUS</b><small>Schnaps &amp; Bier · ab 18</small></button>
      </div>
    </section>
    <section class="panel">
      <h3>Spieler (${n}/${MAX_PLAYERS})</h3>
      <p class="hint">Empfohlen: 3–4 Spieler. Reihenfolge = Sitzordnung am Tisch – zum Ändern an ≡ ziehen.</p>
      <div class="player-list">${rows}</div>
      ${n < MAX_PLAYERS ? `<button class="btn add" data-act="addPlayer">+ SPIELER</button>` : ''}
    </section>
    <section class="panel">
      <h3>Gläser pro Runde</h3>
      <p class="hint">${ui.glassAuto ? `Automatisch: Spieler × 2 = ${defaultGlassCount(n)}` : 'Von Hand gewählt'}</p>
      <div class="chips">${counts}<button class="chip wide ${st.glassCount === 'zufall' ? 'on' : ''}" data-act="count" data-arg="zufall">ZUFALL</button></div>
    </section>
    <section class="panel">
      <h3>Shot-Limit</h3>
      <p class="hint">Wer so viele Shots hatte, scheidet aus. Der Letzte gewinnt.</p>
      <div class="chips limits">${limits}</div>
    </section>
    <section class="panel">
      ${toggle('items', 'Items', '2–4 Spezialkarten pro Runde')}
      ${toggle('barkeeper', 'Mit echtem Barkeeper', 'Eine weitere Person befüllt echte Gläser nach geheimer Anweisung')}
    </section>
    <button class="btn primary big" data-act="start">SPIEL STARTEN</button>
    <p class="fineprint">${st.mode === 'alkohol' ? 'Trinkt verantwortungsvoll. Nur für Erwachsene.' : 'Niemand muss mitmachen – spielt fair.'}</p>
    ${footerLinks()}
  </main>`;
}

function footerLinks() {
  return `<nav class="legal-links" aria-label="Rechtliches">
    <a href="#/impressum" data-act="route" data-arg="impressum">Impressum</a>
    <a href="#/datenschutz" data-act="route" data-arg="datenschutz">Datenschutz</a>
    <a href="#/kontakt" data-act="route" data-arg="kontakt">Kontakt</a>
  </nav>`;
}

function pageScreen(route: Route) {
  const body = route === 'impressum' ? impressumHtml() : route === 'datenschutz' ? datenschutzHtml() : kontaktHtml(ui.contact);
  return `${topbar(game?.state)}
  <main class="screen page">
    <button class="btn ghost back" data-act="back">← ZURÜCK</button>
    <article class="legal">${body}</article>
    ${footerLinks()}
  </main>`;
}

/** Statistik-Frage (erster Start) und Altersabfrage (Alkoholmodus). */
function legalDialogs() {
  if (ui.ageDialog) {
    return layer(
      `<h2>NUR AB 18</h2>
      <p>Dieser Modus enthält Alkohol. Bitte bestätigt, dass alle Mitspieler mindestens 18 Jahre alt sind.</p>
      <button class="btn primary big" data-act="ageOk">Bestätigen</button>
      <button class="btn big" data-act="ageBack">Zurück zum alkoholfreien Modus</button>`,
      'legal-ov',
    );
  }
  // Auf Datenschutz/Impressum/Kontakt erst lesen lassen, danach wieder fragen
  if (statsConfigured() && needsStatsQuestion(store) && !ui.route) {
    return layer(
      `<h2>STATISTIK</h2>
      <p>Darf die App anonyme Nutzungsstatistiken erfassen? Keine Cookies, keine persönlichen Daten.</p>
      <div class="choice-row">
        <button class="btn choice" data-act="stats" data-arg="ja">Ja</button>
        <button class="btn choice" data-act="stats" data-arg="nein">Nein</button>
      </div>
      <p class="small"><a href="#/datenschutz" data-act="route" data-arg="datenschutz">Mehr in der Datenschutzerklärung</a></p>`,
      'legal-ov',
    );
  }
  return '';
}

function scoreboard(s: GameState) {
  const limit = s.settings.shotLimit;
  const shots = (p: PlayerIndex) => `<b>${s.players[p].shots}</b>${limit ? `<small>/${limit}</small>` : ''}`;
  const bk = s.settings.barkeeper && s.barkeeperShots ? `<div class="barkeeper-score">Barkeeper: ${s.barkeeperShots} ${shotSvg()}</div>` : '';
  const isTurn = (p: PlayerIndex) => s.phase === 'zug' && s.current === p && s.splitter === null;

  if (s.players.length === 2) {
    const card = (p: PlayerIndex) => {
      const pl = s.players[p];
      return `<div class="score ${isTurn(p) ? 'active' : ''} ${pl.out ? 'out' : ''}">
        <div class="score-name">${esc(pl.name)}${s.skipNext[p] ? '<em class="badge">SETZT AUS</em>' : ''}</div>
        <div class="score-nums"><span title="${T().bad}">${shots(p)}${shotSvg()}</span><span title="Schlucke Bier"><b>${pl.sips}</b>${beerSvg()}</span></div>
      </div>`;
    };
    return `<div class="scores">${card(0)}${card(1)}</div>${bk}`;
  }

  // Wer wirklich als Nächstes dran ist – Aussetzende werden übersprungen
  let next: PlayerIndex | null = null;
  if (s.phase === 'zug') {
    next = nextActive(s, s.current);
    const seen = new Set<PlayerIndex>();
    while (s.skipNext[next] && next !== s.current && !seen.has(next)) {
      seen.add(next);
      next = nextActive(s, next);
    }
  }
  const chips = s.players
    .map((pl, p) => {
      const tag = pl.out
        ? '<em class="tag out">RAUS</em>'
        : s.skipNext[p]
          ? '<em class="tag skip">SETZT AUS</em>'
          : isTurn(p)
            ? '<em class="tag now">AM ZUG</em>'
            : next === p
              ? '<em class="tag next">ALS NÄCHSTES</em>'
              : '';
      return `<div class="pchip ${isTurn(p) ? 'active' : ''} ${pl.out ? 'out' : ''}">
        <div class="pchip-name"><span class="seatno">${p + 1}</span>${esc(pl.name)}</div>
        <div class="pchip-nums">${shots(p)}${shotSvg()}<b>${pl.sips}</b>${beerSvg()}</div>
        ${tag}
      </div>`;
    })
    .join('');
  return `<div class="dirbar"><span>SPIELRICHTUNG</span>${arrowSvg(s.direction)}<span class="muted">${
    s.direction === 1 ? '1 → 2 → 3 …' : '… 3 → 2 → 1'
  }</span></div>
  <div class="pgrid n${s.players.length}">${chips}</div>${bk}`;
}

function announce(s: GameState) {
  return `<div class="announce">
    <span class="a-schnaps">${s.announced.schnaps}× ${BAD()}</span>
    <span class="a-sep">·</span>
    <span class="a-wasser">${s.announced.wasser}× WASSER</span>
  </div>`;
}

function introScreen(s: GameState) {
  const items = (p: PlayerIndex) =>
    s.settings.items && !s.players[p].out
      ? `<div class="intro-items"><h4>${esc(s.players[p].name)}</h4><div class="item-row">${
          s.players[p].items.map((it) => itemChip(p, it, true)).join('') || '<small>keine</small>'
        }</div></div>`
      : '';
  const needBk = s.settings.barkeeper && !game!.barkeeperDone;
  const many = activePlayers(s).length > 2;
  return `${topbar(s)}
  <main class="screen intro">
    ${scoreboard(s)}
    <h1 class="big-title">RUNDE ${s.round}</h1>
    <p class="muted">Auf dem Tisch stehen</p>
    ${announce(s)}
    <div class="intro-glasses">${s.glasses.map(() => `<span class="mini-glass">${glassSvg(true)}</span>`).join('')}</div>
    <p class="muted small">Welches Glas was enthält, weiß niemand.</p>
    ${s.players.map((_, p) => items(p)).join('')}
    ${
      needBk
        ? `<button class="btn primary big" data-act="sheet" data-arg="barkeeper">BARKEEPER: GLÄSER BEFÜLLEN</button>`
        : `<button class="btn primary big" data-act="coin">${many ? 'FLASCHE DREHEN' : 'MÜNZE WERFEN'}</button>`
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

function winnerScreen(s: GameState) {
  const ranking = s.players
    .map((pl, p) => ({ pl, p }))
    // Sieger zuerst, dann wer später ausgeschieden ist
    .sort((a, b) => Number(a.pl.out) - Number(b.pl.out) || (b.pl.outOrder ?? 0) - (a.pl.outOrder ?? 0))
    .map(
      ({ pl, p }, rank) =>
        `<li class="${p === s.winner ? 'win' : ''}"><span>${rank + 1}. ${esc(pl.name)}</span><span>${pl.shots}${shotSvg()} ${pl.sips}${beerSvg()}</span></li>`,
    )
    .join('');
  return `${topbar(s)}
  <main class="screen end">
    <p class="muted">Letzte Runde ist vorbei – es bleibt nur</p>
    <h1 class="big-title winner-name">${nameOf(s, s.winner!)}</h1>
    <h2 class="green">GEWINNT!</h2>
    <ol class="ranking">${ranking}</ol>
    <button class="btn primary big" data-act="rematch">NOCHMAL MIT DENSELBEN</button>
    <button class="btn" data-act="toSetup">ZUM SETUP</button>
  </main>`;
}

function itemChip(owner: PlayerIndex, item: ItemId, small = false, iconOnly = false) {
  return `<button class="item-chip ${small ? 'small' : ''} ${iconOnly ? 'icon-only' : ''}" data-act="item" data-arg="${owner}:${item}" aria-label="${iName(item)}">
    ${itemIcon(item)}${iconOnly ? '' : `<span>${iName(item)}</span>`}</button>`;
}

function splitBanner(s: GameState) {
  const share = splitShare(s);
  const players = activePlayers(s);
  const count = (p: PlayerIndex) => Object.values(ui.split).filter((v) => v === p).length;
  const ok = players.every((p) => count(p) === share);
  const brush = ui.brush ?? players.find((p) => count(p) < share) ?? players[0];
  const rest = remaining(s).length - share * players.length;
  const chips = players
    .map(
      (p) => `<button class="brush ${p === brush ? 'on' : ''} ${count(p) === share ? 'full' : ''} c${players.indexOf(p) % 6}" data-act="brush" data-arg="${p}">
        ${esc(s.players[p].name)} <b>${count(p)}/${share}</b></button>`,
    )
    .join('');
  return `<div class="banner split">
    <b>${nameOf(s, s.splitter!)} teilt auf</b>
    <small>Spieler wählen, dann Gläser antippen – jeder bekommt ${share}.${rest ? ` ${rest === 1 ? 'Ein Glas bleibt' : `${rest} Gläser bleiben`} stehen.` : ''}</small>
    <div class="brushes">${chips}</div>
    <button class="btn primary" data-act="split" ${ok ? '' : 'disabled'}>AUSTRINKEN!</button>
  </div>`;
}

function boardScreen(s: GameState) {
  const me = s.current;
  const splitting = s.splitter !== null;
  const players = activePlayers(s);
  let banner: string;
  if (splitting) {
    banner = splitBanner(s);
  } else if (ui.mode) {
    const what =
      ui.mode.item === 'doppelter' ? 'Wähle zwei Gläser' : `Wähle ein Glas für ${iName(ui.mode.item)}`;
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
      const colour = owner !== undefined ? players.indexOf(owner) % 6 : -1;
      const tag = splitting && owner !== undefined ? `<span class="owner">${esc(s.players[owner].name)}</span>` : '';
      const who = g.empty
        ? `<span class="who">${g.drunkBy === 'niemand' ? 'weg' : nameOf(s, g.drunkBy as PlayerIndex | 'barkeeper')}</span>`
        : '';
      return `<button class="glass ${g.empty ? `empty ${g.content}` : 'full'} ${sel ? 'sel' : ''} ${
        colour >= 0 ? `own c${colour}` : ''
      }" data-act="glass" data-arg="${g.id}" ${g.empty ? 'disabled' : ''} aria-label="Glas ${glassNo(g.id)}">
        ${glassSvg(!g.empty)}<span class="num">${glassNo(g.id)}</span>${tag}${who}</button>`;
    })
    .join('');

  const others = s.players.map((_, p) => p).filter((p) => p !== me && !s.players[p].out);
  const compact = others.length > 1;
  const otherItems = others
    .map(
      (p) => `<div class="opp-items">
        <h4 class="opp">${nameOf(s, p)}</h4>
        <div class="item-row">${s.players[p].items.map((it) => itemChip(p, it, true, compact)).join('') || '<small class="muted">keine</small>'}</div>
      </div>`,
    )
    .join('');
  const tray = s.settings.items
    ? `<section class="tray ${compact ? 'compact' : ''}">
        <h4>Deine Items</h4>
        <div class="item-row">${s.players[me].items.map((it) => itemChip(me, it)).join('') || '<small class="muted">keine</small>'}</div>
        ${otherItems}
      </section>`
    : '';

  return `${topbar(s)}
  <main class="screen board">
    ${scoreboard(s)}
    ${announce(s)}
    ${banner}
    <div class="table count-${s.glasses.length} ${s.glasses.length > 8 ? 'dense' : ''}">${glasses}</div>
    ${tray}
  </main>
  ${decisionSheet(s)}`;
}

function decisionSheet(s: GameState) {
  if (game!.queue.length || s.pending.length || s.splitter !== null || s.beerPick || ui.sheet) return '';
  const forced = s.forcedGlass !== null;
  const double = ui.mode?.item === 'doppelter';
  if (double ? ui.selected.length !== 2 : !forced && (ui.mode || ui.selected.length !== 1)) return '';
  const sole = soleOpponent(s);
  const title = double
    ? `Gläser ${ui.selected.map(glassNo).join(' + ')}`
    : `Glas ${glassNo(forced ? s.forcedGlass! : ui.selected[0])}`;
  const plural = double ? 'BEIDE ' : '';
  const give = sole !== null ? `${plural}${nameOf(s, sole).toUpperCase()} GEBEN` : `${plural}JEMANDEM GEBEN`;
  const hint = s.settings.items ? 'Wasser = Mutprobe: Extra-Item' : 'Wasser = Mutprobe: nochmal dran';
  return `<div class="sheet decision">
    <h3>${title}</h3>
    <button class="btn primary big" data-act="take" data-arg="selbst">${plural}SELBST TRINKEN<small>${hint}</small></button>
    <button class="btn danger big" data-act="take" data-arg="gegner">${give}</button>
    ${forced ? '' : `<button class="btn ghost" data-act="cancel">ZURÜCK</button>`}
  </div>`;
}

/** Spielerauswahl als große Buttons. */
function playerButtons(s: GameState, list: PlayerIndex[]) {
  return `<div class="pick-list n${list.length}">${list
    .map((p) => `<button class="btn danger pick-btn" data-act="pick" data-arg="${p}"><span class="seatno">${p + 1}</span>${nameOf(s, p)}</button>`)
    .join('')}</div>`;
}

// ---------------------------------------------------------------- Overlays

function spinner(s: GameState, winner: PlayerIndex) {
  const cands = activePlayers(s);
  const step = 360 / cands.length;
  const names = cands
    .map((p, i) => {
      const a = (i * step * Math.PI) / 180;
      const x = 50 + 42 * Math.sin(a);
      const y = 50 - 42 * Math.cos(a);
      return `<span class="spin-name ${p === winner ? 'win' : ''}" style="left:${x}%;top:${y}%">${nameOf(s, p)}</span>`;
    })
    .join('');
  const end = 360 * 5 + cands.indexOf(winner) * step;
  return `<div class="spin-stage">${names}<div class="bottle" style="--end:${end}deg">${bottleSvg()}</div></div>`;
}

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
        <p>Glas ${glassNo(s.pending[0].glassId)} ist ${T().bad}. Du darfst stattdessen einen Schluck Wasser trinken.</p>
        <button class="btn primary big" data-act="angel" data-arg="ja">SCHUTZENGEL NUTZEN</button>
        <button class="btn danger big" data-act="angel" data-arg="nein">ICH TRINKE ${currentMode() === 'alkohol' ? 'DEN' : 'DIE'} ${BAD()}</button>`, 'angel');
    }
    if (s.beerPick) {
      return layer(`
        <div class="ov-icon">${itemIcon('wuerfelbecher')}</div>
        <h2>${nameOf(s, s.current)}, WER TRINKT?</h2>
        <p>Wähle, wer einen Schluck ${T().sip} nehmen muss.</p>
        ${playerButtons(s, opponents(s))}`);
    }
    return '';
  }
  const cont = (label = 'WEITER') => `<button class="btn primary big" data-act="next">${label}</button>`;
  switch (e.kind) {
    case 'coin': {
      const many = activePlayers(s).length > 2;
      const anim = many
        ? spinner(s, e.winner)
        : `<div class="coin-stage"><div class="coin flip${activePlayers(s).indexOf(e.winner)}">
            <div class="face f0">${esc(s.players[activePlayers(s)[0]].name.slice(0, 1).toUpperCase())}</div>
            <div class="face f1">${esc(s.players[activePlayers(s)[1]].name.slice(0, 1).toUpperCase())}</div>
          </div></div>`;
      return layer(
        `${anim}
        <div class="after-anim">
          <h2>${nameOf(s, e.winner)} ${e.reason === 'start' ? 'FÄNGT AN' : 'DARF AUFTEILEN'}</h2>
          ${cont(e.reason === 'start' ? `HANDY AN ${nameOf(s, e.winner).toUpperCase()}` : 'WEITER')}
        </div>`,
        `coin-ov ${many ? 'spin-ov' : ''}`,
      );
    }
    case 'turn':
      return layer(
        `<p class="muted">Gib das Handy an</p><h1 class="big-title">${nameOf(s, e.player)}</h1>
        <p class="muted small">Alle anderen: nicht aufs Display schauen.</p>
        ${cont('ICH BIN BEREIT')}`,
        'turn-ov',
      );
    case 'reveal': {
      const schnaps = e.glasses.filter((g) => g.content === 'schnaps').length;
      const single = e.glasses.length === 1;
      const head = single ? (schnaps ? `${BAD()}!` : 'WASSER') : `${schnaps}× ${BAD()} · ${e.glasses.length - schnaps}× WASSER`;
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
            ? `<div class="ov-icon">${itemIcon(e.item)}</div><p>Extra-Item: <b>${iName(e.item)}</b></p>`
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
        <p>Der Zug geht an ${nameOf(s, s.current)}.</p>${cont()}`,
      );
    case 'protected':
      return layer(
        `<div class="ov-icon">${itemIcon('schutzengel')}</div>
        <h2>SCHUTZENGEL</h2><p>${nameOf(s, e.player)} trinkt statt des ${T().badGen} einen Schluck Wasser.</p>${cont()}`,
        'angel',
      );
    case 'out':
      return layer(
        `<h1 class="big-title out-title">${nameOf(s, e.player)}<br>IST RAUS</h1>
        <p>${s.settings.shotLimit} Shots erreicht – ab jetzt wird ${nameOf(s, e.player)} übersprungen.</p>
        <p class="muted small">Wasser trinken und zuschauen!</p>${cont()}`,
        'reveal-ov is-schnaps',
      );
    case 'gameOver':
      return layer(
        `<p class="muted">Nur noch einer übrig</p><h1 class="big-title green">${nameOf(s, e.winner)}<br>GEWINNT!</h1>${cont()}`,
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
      const sole = opponents(s, e.player).length === 1 ? opponents(s, e.player)[0] : null;
      const victim = e.from ?? sole;
      const target = e.target ?? sole;
      const tName = target !== null && target !== undefined ? nameOf(s, target) : 'Jemand';
      const g = ui.lastGlasses.map(glassNo).join(' + ');
      const effect: Record<ItemId, string> = {
        spuernase: `${me} riecht heimlich an Glas ${g}.`,
        langfinger: '',
        bierpause: `${me}: einen echten Schluck ${T().sip} trinken! Danach wird Glas ${g} aufgedeckt und weggekippt.`,
        doppelter: `Zwei Gläser auf einmal: ${g}.`,
        aussetzer: `${tName} setzt den nächsten Zug aus.`,
        abraeumer: `Glas ${g} wird abgeräumt.`,
        teiler: `${me} teilt die Gläser auf.`,
        muenzteiler: activePlayers(s).length > 2 ? 'Die Flasche entscheidet, wer die Gläser aufteilt.' : 'Die Münze entscheidet, wer die Gläser aufteilt.',
        schutzengel: '',
        fluesterpost: `${me} bekommt gleich einen geheimen Tipp.`,
        wendehals: `Glas ${g} wurde umgedreht. Was jetzt drin ist, weiß keiner.`,
        wuerfelbecher: 'Würfel fallen …',
        kehrtwende: `Die Spielrichtung dreht sich um! ${arrowSvg(s.direction)}`,
      };
      const head =
        e.stolen && victim !== null && victim !== undefined
          ? `${me} KLAUT ${nameOf(s, victim)}: ${iName(e.item)}`
          : `${me}: ${iName(e.item)}`;
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
          <p>${
            e.player === null
              ? `<b>${nameOf(s, s.current)}</b> darf wählen, wer einen Schluck ${T().sip} trinkt!`
              : `<b>${nameOf(s, e.player)}</b> trinkt einen Schluck ${T().sip}!`
          }</p>
          ${cont()}
        </div>`,
        'dice-ov',
      );
    default:
      return '';
  }
}

const layer = (inner: string, cls = '') => `<div class="overlay ${cls}" role="dialog" aria-modal="true"><div class="ov-box">${inner}</div></div>`;

/** Sound und Animationen nur einmal pro Ereignis auslösen. */
function runOverlayFx() {
  const e = game?.queue[0] ?? null;
  if (!e || e === ui.fxFor) return;
  ui.fxFor = e;
  ui.readyAt = Date.now() + 350;
  switch (e.kind) {
    case 'coin': {
      const many = activePlayers(game!.state).length > 2;
      const dur = many ? 2400 : 1750;
      ui.readyAt = Date.now() + dur + 150;
      sfx.coin();
      setTimeout(() => sfx.land(), dur);
      break;
    }
    case 'reveal':
      ui.readyAt = Date.now() + 700;
      if (e.glasses.some((g) => g.content === 'schnaps')) sfx.schnaps();
      else sfx.wasser();
      break;
    case 'out':
      ui.readyAt = Date.now() + 700;
      sfx.schnaps();
      break;
    case 'gameOver':
      sfx.angel();
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
        if (n >= 10) clearInterval(timer);
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
      return wrapSheet(`${rulesHtml(currentMode())}<button class="btn primary" data-act="close">VERSTANDEN</button>`, 'tall rules');
    case 'menu':
      return wrapSheet(`<h3>Menü</h3>
        <button class="btn" data-act="sheet" data-arg="rules">REGELN</button>
        <button class="btn" data-act="sound">TON: ${isMuted() ? 'AUS' : 'AN'}</button>
        ${statsConfigured() ? `<button class="btn" data-act="stats" data-arg="${statsChoice(store) === 'ja' ? 'nein' : 'ja'}">STATISTIK: ${statsChoice(store) === 'ja' ? 'AN' : 'AUS'}</button>` : ''}
        ${ageConfirmed(store) ? '<button class="btn" data-act="ageReset">ALTERSBESTÄTIGUNG ZURÜCKSETZEN</button>' : ''}
        <div class="menu-links">
          <a href="#/impressum" data-act="route" data-arg="impressum">Impressum</a>
          <a href="#/datenschutz" data-act="route" data-arg="datenschutz">Datenschutz</a>
          <a href="#/kontakt" data-act="route" data-arg="kontakt">Kontakt</a>
        </div>
        ${s && !ui.route ? '<button class="btn danger" data-act="sheet" data-arg="confirmNew">NEUES SPIEL</button>' : ''}
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
        <ol class="fill-list">${s.glasses.map((g) => `<li class="${g.content}"><b>Glas ${glassNo(g.id)}</b> ${g.content === 'schnaps' ? BAD() : 'WASSER'}</li>`).join('')}</ol>
        <button class="btn primary big" data-act="barkeeperDone">FERTIG – VERDECKEN</button>`, 'secret-ov open');
    }
    case 'pick': {
      if (!s) return '';
      const titles: Record<PickPurpose, string> = {
        take: `Wer muss Glas ${glassNo(s.forcedGlass ?? ui.selected[0])} trinken?`,
        doppelter: `Wer bekommt beide Gläser?`,
        aussetzer: 'Wer setzt den nächsten Zug aus?',
        langfinger: 'Wem klaust du ein Item?',
        beer: `Wer trinkt den Schluck ${T().sip}?`,
      };
      let list = opponents(s);
      if (sh.purpose === 'aussetzer') list = list.filter((p) => !s.skipNext[p]);
      if (sh.purpose === 'langfinger') list = list.filter((p) => stealable(s, p).length);
      return wrapSheet(`<h3>${titles[sh.purpose]}</h3>${playerButtons(s, list)}
        <button class="btn ghost" data-act="close">ZURÜCK</button>`);
    }
    case 'steal': {
      if (!s) return '';
      const loot = stealable(s, sh.from);
      return wrapSheet(`<h3>Was klaust du ${nameOf(s, sh.from)}?</h3>
        <div class="steal-list">${loot
          .map((it) => `<button class="btn item-btn" data-act="steal" data-arg="${it}">${itemIcon(it)}<span><b>${iName(it)}</b><small>${iText(it)}</small></span></button>`)
          .join('')}</div>
        <button class="btn ghost" data-act="close">ABBRECHEN</button>`);
    }
    case 'item': {
      if (!s) return '';
      const mine = sh.owner === s.current && s.phase === 'zug';
      const why = mine ? blockReason(s, sh.item) : null;
      return wrapSheet(`<div class="ov-icon">${itemIcon(sh.item)}</div>
        <h3>${iName(sh.item)}</h3><p>${iText(sh.item)}</p>
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
