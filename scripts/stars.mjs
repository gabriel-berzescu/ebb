#!/usr/bin/env node
/**
 * Packs the Yale Bright Star Catalogue (5th revised edition: every star visible to the naked eye) into
 * src/world/starsData.ts.
 *
 *   node scripts/stars.mjs path/to/bsc5.dat.gz
 *
 * The catalogue is not kept in this repository. It can be had from http://tdc-www.harvard.edu/catalogs/bsc5.html
 * (the file bsc5.dat.gz), or from the CDS as catalogue V/50. It is a fixed-width text file, one star to a line; the
 * columns used here are the J2000 position (characters 76-90), the visual magnitude (103-107) and the B-V colour
 * (110-114).
 *
 * Each star is packed into six bytes, brightest first: right ascension (16 bits, a full turn), declination (16 bits,
 * signed, a quarter turn each way), magnitude and colour (8 bits each). That keeps positions to a hundredth of a
 * degree, far finer than a pixel.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/stars.mjs path/to/bsc5.dat.gz');
  process.exit(2);
}
const raw = readFileSync(source);
const text = (source.endsWith('.gz') ? gunzipSync(raw) : raw).toString('latin1');

/** Faintest magnitude kept: about what a good eye sees on a dark night. */
const LIMIT = 6.5;
const stars = [];
for (const line of text.split('\n')) {
  const num = (from, to) => Number(line.slice(from - 1, to));
  if (line.length < 107 || line.slice(75, 83).trim() === '') continue; // the catalogue lists a few objects that are not stars
  const ra = ((num(76, 77) + num(78, 79) / 60 + num(80, 83) / 3600) / 24) * 2 * Math.PI;
  const sign = line[83] === '-' ? -1 : 1;
  const dec = (sign * (num(85, 86) + num(87, 88) / 60 + num(89, 90) / 3600) * Math.PI) / 180;
  const mag = num(103, 107);
  const bvText = line.slice(109, 114).trim();
  const bv = bvText === '' ? 0.3 : Number(bvText);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag) || mag > LIMIT) continue;
  stars.push({ ra, dec, mag, bv: Number.isFinite(bv) ? bv : 0.3 });
}
stars.sort((a, b) => a.mag - b.mag);

const bytes = Buffer.alloc(stars.length * 6);
stars.forEach((s, i) => {
  bytes.writeUInt16LE(Math.min(65535, Math.round((s.ra / (2 * Math.PI)) * 65536) % 65536), i * 6);
  bytes.writeInt16LE(Math.round((s.dec / (Math.PI / 2)) * 32767), i * 6 + 2);
  bytes.writeUInt8(Math.max(0, Math.min(255, Math.round((s.mag + 1.5) * 30))), i * 6 + 4);
  bytes.writeUInt8(Math.max(0, Math.min(255, Math.round((s.bv + 0.4) * 100))), i * 6 + 5);
});

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'world', 'starsData.ts');
const b64 = bytes.toString('base64');
const lines = b64.match(/.{1,160}/g).map((l) => `  '${l}',`);
writeFileSync(
  out,
  `/**
 * The ${stars.length} stars of the Yale Bright Star Catalogue (5th revised edition) down to magnitude ${LIMIT}, brightest first,
 * six bytes each. Made by scripts/stars.mjs: do not edit by hand. See src/world/stars.ts for how it is read.
 */
export const STAR_COUNT = ${stars.length};
export const STAR_BYTES = [
${lines.join('\n')}
].join('');
`,
);
console.log(`${stars.length} stars to magnitude ${LIMIT}; brightest ${stars[0].mag}, faintest ${stars[stars.length - 1].mag}; ${bytes.length} bytes -> ${out}`);
