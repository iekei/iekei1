#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commonTechTrees } from './common-tech-tree.mjs';
import { buildSpriteMap, convertTechFile, loadIconCatalog } from './hoi4-tech-converter.mjs';

const game = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const countries = ['ger', 'sov', 'jap', 'usa', 'eng', 'fra', 'ita'];
export function buildTrees() {
  const trees = commonTechTrees();
  const catalog = loadIconCatalog();
  const sprites = buildSpriteMap(resolve(game, 'tools/hoi4-source/Technologies.txt'));
  trees.air = convertTechFile(resolve(game, 'tools/hoi4-source/bba_air_techs.txt'), sprites, 'air');
  const imageOverrides = {
    mechanised_infantry: 'FIN_mechanised_infantry', mechanised_infantry2: 'FIN_mechanised_infantry2', mechanised_infantry3: 'FIN_mechanised_infantry3',
    armored_car_equipment_1: 'GER_armored_car_equipment_1', armored_car_equipment_2: 'GER_armored_car_equipment_2', armored_car_equipment_3: 'GER_armored_car_equipment_3',
    basic_sonar: 'sonar'
  };
  const legacy = JSON.parse(readFileSync(resolve(game, 'tools/legacy-research-ids.json'), 'utf8'));
  const allIds = new Set();
  for (const [category, techs] of Object.entries(trees)) {
    for (const tech of techs) {
      const image = catalog.resolve([imageOverrides[tech.id], tech.asset_key, tech.id]);
      if (!image || !existsSync(resolve(game, image.local))) throw new Error(`Missing image: ${category}/${tech.id}`);
      tech.asset_key = image.key;
      if (allIds.has(tech.id)) throw new Error(`Duplicate technology: ${tech.id}`);
      allIds.add(tech.id);
      const legacyIds = Object.entries(legacy).filter(([, id]) => id === tech.id).map(([id]) => id);
      if (legacyIds.length) tech.legacy_ids = legacyIds;
    }
    const byId = new Map(techs.map(tech => [tech.id, tech]));
    const visited = new Set();
    function visit(id, stack = new Set()) {
      if (stack.has(id)) throw new Error(`Cyclic prerequisite: ${id}`);
      if (visited.has(id)) return;
      const tech = byId.get(id);
      if (!tech) throw new Error(`Missing prerequisite in ${category}: ${id}`);
      for (const parent of tech.prerequisites) visit(parent, new Set([...stack, id]));
      visited.add(id);
    }
    techs.forEach(tech => visit(tech.id));
  }
  for (const [oldId, newId] of Object.entries(legacy)) {
    if (!allIds.has(newId)) throw new Error(`Invalid legacy mapping: ${oldId} → ${newId}`);
  }
  return trees;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const trees = buildTrees(); // Validate every category before writing any output.
  const checkOnly = process.argv.includes('--check');
  const deploy = process.argv.includes('--deploy');
  for (const [category, techs] of Object.entries(trees)) {
    console.log(`${category}: ${techs.length} technologies`);
    if (checkOnly) continue;
    const directories = ['tools/hoi4-output', ...(deploy ? countries.map(country => `${country}/tec/data`) : [])];
    for (const directory of directories) {
      mkdirSync(resolve(game, directory), { recursive: true });
      writeFileSync(resolve(game, directory, `tech_${category}.json`), JSON.stringify(techs, null, 2) + '\n');
    }
  }
}
