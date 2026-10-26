// Prüft den Build-Output (dist/) auf nicht erlaubte externe URLs.
// Aufruf: node scripts/check-build.ts  (läuft automatisch nach `npm run build`)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { siteHost } from '../src/config/site.ts';
import { scanMarkup, scanText, type Finding } from './external-urls.ts';

const DIST = 'dist';
const TEXT_FILES = /\.(html|css|js|mjs|json|webmanifest|txt|svg)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const findings: Finding[] = [];
for (const file of walk(DIST).filter((f) => TEXT_FILES.test(f))) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(DIST, file);
  findings.push(...scanText(rel, text, [siteHost()]));
  if (/\.(html|css)$/.test(file)) findings.push(...scanMarkup(rel, text, [siteHost()]));
}

const bad = findings.filter((f) => !f.allowed);
if (bad.length) {
  console.error('\n✗ Nicht erlaubte externe URLs im Build gefunden:');
  for (const f of bad) console.error(`  ${f.file}: ${f.url}`);
  process.exit(1);
}
const hosts = [...new Set(findings.map((f) => f.host))].sort();
console.log(`✓ Keine unerlaubten externen URLs im Build (gefundene, erlaubte Hosts: ${hosts.join(', ') || 'keine'})`);
