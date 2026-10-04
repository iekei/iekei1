#!/usr/bin/env node
/** Rebuild research mappings from uploaded PNGs. No network requests or image renaming. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpriteMap } from './hoi4-tech-converter.mjs';
import Catalog from '../assets/research-icon-catalog.js';

const game = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mappings = ['technology', 'equipment'].map(folder => {
  const id = `${folder}_icons`;
  const previous = JSON.parse(readFileSync(resolve(game, `assets/mappings/${id}.json`), 'utf8'));
  const metadata = new Map(previous.images.map(image => [Catalog.key(image.name), image]));
  const images = readdirSync(resolve(game, `assets/${folder}`)).filter(name => name.endsWith('.png')).sort().map(name => ({
    ...metadata.get(Catalog.key(name)), name, key: Catalog.key(name), local: `assets/${folder}/${name}`
  }));
  return { id, label: previous.label, mode: 'local', local_base: `assets/${folder}/`, count: images.length, count_names: images.length, images };
});
const catalog = Catalog.create(mappings);
const aliases = {};
const sprites = buildSpriteMap(resolve(game, 'tools/hoi4-source/Technologies.txt'));
for (const [sprite, texture] of sprites) {
  const image = catalog.resolve([texture]);
  if (!image) continue;
  aliases[Catalog.key(sprite)] = image.key;
  const tech = sprite.replace(/^GFX_/, '').replace(/_medium$/, '');
  // Explicit technology sprites take priority over aliases inferred from small icons.
  if (sprite.endsWith('_medium') || !aliases[Catalog.key(tech)]) aliases[Catalog.key(tech)] = image.key;
}
const overrides = JSON.parse(readFileSync(resolve(game, 'tools/research-icon-overrides.json'), 'utf8'));
for (const [alias, key] of Object.entries(overrides)) {
  const image = catalog.resolve([key]);
  if (!image) throw new Error(`Missing override image: ${alias} → ${key}`);
  aliases[Catalog.key(alias)] = image.key;
}
mappings[0].aliases = Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b, 'en')));
for (const mapping of mappings) {
  writeFileSync(resolve(game, `assets/mappings/${mapping.id}.json`), JSON.stringify(mapping, null, 2) + '\n');
  console.log(`${mapping.id}: ${mapping.images.length} PNGs`);
}
console.log(`${Object.keys(aliases).length} shared aliases`);
