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

writeFileSync('public/apple-touch-icon.png', png(180, 1));
writeFileSync('public/icon-192.png', png(192, 1));
writeFileSync('public/icon-512.png', png(512, 1));
writeFileSync('public/icon-maskable-512.png', png(512, 4));
console.log('Icons erstellt.');
