// Erzeugt die App-Icons als PNG aus einer eigenen Pixel-Grafik (ohne Abhängigkeiten).
// Aufruf: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ART = [
  '................',
  '................',
  '...##########...',
  '...#........#...',
  '...#rrrrrrrr#...',
  '...#rRrrrrrr#...',
  '....#rRrrrr#....',
  '....#rrrrrr#....',
  '....#rrrrrr#....',
  '.....#rrrr#.....',
  '.....#rrrr#.....',
  '.....######.....',
  '.....######.....',
  '................',
  '..gggggggggggg..',
  '................',
];
const COLORS = {
  '.': [7, 5, 6],
  '#': [228, 239, 231],
  r: [255, 45, 75],
  R: [255, 170, 180],
  g: [77, 255, 154],
};

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** size = Kantenlänge in px, pad = Rand in Grafik-Pixeln (für maskable-Icons). */
function png(size, pad) {
  const grid = ART.length + pad * 2;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x / size) * grid) - pad;
      const gy = Math.floor((y / size) * grid) - pad;
      const ch = ART[gy]?.[gx] ?? '.';
      let [r, g, b] = COLORS[ch];
      // sanfter roter Schein in der Mitte
      if (ch === '.') {
        const d = Math.hypot(x / size - 0.5, y / size - 0.42);
        const glow = Math.max(0, 0.35 - d) * 1.6;
        r = Math.min(255, r + 190 * glow);
        g += 10 * glow;
        b += 30 * glow;
      }
      raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PNG aus einer Pixelfunktion (x, y) → [r, g, b]. */
function encode(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Eigene 5×7-Pixelschrift, nur die Buchstaben für „LAST CALL“
const FONT = {
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
};

/** Vorschaubild für geteilte Links (Open Graph, 1200×630). */
function ogImage() {
  const W = 1200;
  const H = 630;
  const glass = { x: 120, y: 139, s: 22 };
  const text = { x: 560, s: 20, gap: 20 };
  const words = [
    { word: 'LAST', y: 150, color: COLORS['#'] },
    { word: 'CALL', y: 340, color: COLORS.r },
  ];
  return encode(W, H, (x, y) => {
    // Glas
    const gx = Math.floor((x - glass.x) / glass.s);
    const gy = Math.floor((y - glass.y) / glass.s);
    const ch = ART[gy]?.[gx];
    if (ch && ch !== '.' && x >= glass.x && y >= glass.y) return COLORS[ch];
    // Schriftzug
    for (const { word, y: wy, color } of words) {
      const ly = Math.floor((y - wy) / text.s);
      if (y < wy || ly > 6) continue;
      const step = 5 * text.s + text.gap;
      const li = Math.floor((x - text.x) / step);
      const lx = Math.floor(((x - text.x) % step) / text.s);
      if (x >= text.x && li < word.length && lx < 5 && FONT[word[li]][ly][lx] === '#') return color;
    }
    // dunkler Hintergrund mit rotem Schein links und grünem unten
    const d = Math.hypot((x - 300) / W, (y - 315) / H);
    const red = Math.max(0, 0.45 - d) * 1.4;
    const green = Math.max(0, 0.5 - Math.hypot((x - 600) / W, (y - 700) / H)) * 0.5;
    return [Math.min(255, 7 + 190 * red), Math.min(255, 5 + 10 * red + 120 * green), Math.min(255, 6 + 30 * red + 60 * green)];
  });
}

writeFileSync('public/og-image.png', ogImage());
writeFileSync('public/apple-touch-icon.png', png(180, 1));
writeFileSync('public/icon-192.png', png(192, 1));
writeFileSync('public/icon-512.png', png(512, 1));
writeFileSync('public/icon-maskable-512.png', png(512, 4));
console.log('Icons erstellt.');
