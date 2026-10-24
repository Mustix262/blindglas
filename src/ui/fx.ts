/** Sound (Web Audio, komplett synthetisch) und Haptik. */

let ctx: AudioContext | null = null;
let muted = false;

export const setMuted = (m: boolean) => (muted = m);
export const isMuted = () => muted;

/** Muss aus einer Nutzergeste heraus aufgerufen werden (iOS). */
export function unlockAudio() {
  if (muted) return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  g.gain.setValueAtTime(opts.gain ?? 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number } = {}) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = opts.freq ?? 1200;
  const g = ctx.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  tap: () => tone(660, 0.04, { gain: 0.04 }),
  schnaps: () => {
    noise(0.35, { gain: 0.5, freq: 900 });
    tone(220, 0.5, { type: 'sawtooth', gain: 0.1, slide: 55 });
  },
  wasser: () => {
    tone(880, 0.12, { type: 'sine', gain: 0.12, slide: 1320 });
    tone(1320, 0.18, { type: 'sine', gain: 0.08, delay: 0.08, slide: 990 });
  },
  coin: () => [0, 0.12, 0.24, 0.36, 0.5, 0.66, 0.84, 1.05].forEach((d, i) => tone(1800 - i * 60, 0.05, { type: 'triangle', gain: 0.06, delay: d })),
  land: () => tone(1500, 0.3, { type: 'triangle', gain: 0.1 }),
  dice: () => [0, 0.09, 0.2, 0.33, 0.5, 0.7].forEach((d) => noise(0.05, { gain: 0.35, freq: 2500, delay: d })),
  turn: () => {
    tone(392, 0.09, { gain: 0.05 });
    tone(523, 0.12, { gain: 0.05, delay: 0.09 });
  },
  item: () => {
    tone(523, 0.07, { gain: 0.05 });
    tone(659, 0.07, { gain: 0.05, delay: 0.07 });
    tone(784, 0.12, { gain: 0.05, delay: 0.14 });
  },
  secret: () => tone(300, 0.25, { type: 'sine', gain: 0.08, slide: 600 }),
  angel: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, { type: 'sine', gain: 0.06, delay: i * 0.08 })),
  beer: () => {
    noise(0.25, { gain: 0.2, freq: 500 });
    tone(140, 0.2, { type: 'sine', gain: 0.1, delay: 0.05 });
  },
};

// ---------- Haptik ----------
// Safari auf dem iPhone kennt navigator.vibrate nicht. Ab iOS 18 löst das
// Umschalten eines <input switch> aber ein kurzes Haptik-Feedback aus.
let switchLabel: HTMLLabelElement | null = null;

function iosTick() {
  if (!switchLabel) {
    switchLabel = document.createElement('label');
    switchLabel.setAttribute('aria-hidden', 'true');
    switchLabel.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    switchLabel.appendChild(input);
    document.body.appendChild(switchLabel);
  }
  switchLabel.click();
}

export function buzz(pattern: 'light' | 'strong') {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern === 'strong' ? [90, 60, 220] : 15);
    return;
  }
  iosTick();
  if (pattern === 'strong') {
    setTimeout(iosTick, 120);
    setTimeout(iosTick, 240);
  }
}
