#!/usr/bin/env node
/**
 * Construit le catalogue statique du site : découvre les produits Marstoy,
 * résout chaque référence vers le vrai set LEGO, et écrit
 * `site/data/catalog.json`.
 *
 * Tourne sur un runner GitHub Actions (accès Internet complet). Aucune clé
 * n'est nécessaire : les données LEGO viennent des exports publics de
 * Rebrickable. La résolution a lieu ici, à la compilation — le site livré au
 * navigateur ne contient donc aucun secret.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverCatalog } from './lib/marstoy.mjs';
import { loadLegoIndex, resolveFromIndex } from './lib/legodata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = (...args) => console.log('▸', ...args);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(root, file), 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data, { pretty = false } = {}) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(data, null, pretty ? 2 : 0));
  return target;
}

// La découverte passe d'abord et son rapport est écrit tout de suite : même si
// le téléchargement Rebrickable échoue ensuite, on garde de quoi diagnostiquer.
log('Découverte du catalogue Marstoy…');
const { products, recon } = await discoverCatalog();
log(`  stratégie retenue : ${recon.strategyUsed || 'aucune'} — ${products.length} référence(s)`);
await writeJson('data/recon.json', recon, { pretty: true });

log('Téléchargement des exports Rebrickable…');
let index;
try {
  index = await loadLegoIndex();
} catch (error) {
  console.error(
    `\nÉchec du téléchargement des données LEGO : ${error?.message || error}\n` +
      'Les exports publics attendus sont https://cdn.rebrickable.com/media/downloads/sets.csv.gz\n' +
      'et themes.csv.gz. data/recon.json a tout de même été écrit.',
  );
  process.exit(1);
}
log(`  ${index.totalSets} sets, ${index.totalThemes} thèmes indexés`);

const overrides = await readJson('overrides.json', {});

const resolved = [];
const unresolved = [];

for (const item of products) {
  const set = resolveFromIndex(item.code, index, overrides);
  if (set.ok) {
    resolved.push({
      code: item.code,
      marstoyTitle: item.title,
      marstoyUrl: item.url,
      marstoyImage: item.image,
      price: item.price,
      num: set.num,
      setNum: set.setNum,
      name: set.name,
      year: set.year,
      numParts: set.numParts,
      theme: set.theme,
      imgUrl: set.imgUrl,
      setUrl: set.setUrl,
      matchedBy: set.matchedBy,
    });
  } else {
    unresolved.push({ code: item.code, title: item.title, url: item.url, reason: set.reason, tried: set.tried });
  }
}

// Les plus récents d'abord : c'est ce qu'on cherche en général.
resolved.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));

const catalog = {
  generatedAt: new Date().toISOString(),
  source: recon.origin,
  strategy: recon.strategyUsed,
  counts: {
    discovered: products.length,
    resolved: resolved.length,
    unresolved: unresolved.length,
  },
  products: resolved,
};

await writeJson('site/data/catalog.json', catalog);
await writeJson('data/recon.json', { ...recon, unresolved: unresolved.slice(0, 200) }, { pretty: true });

log(`Catalogue : ${resolved.length} résolus, ${unresolved.length} non résolus`);
if (unresolved.length) {
  log('Exemples non résolus :', unresolved.slice(0, 10).map((item) => item.code).join(', '));
}

if (!resolved.length) {
  console.error(
    "\nAucun produit résolu. Voir data/recon.json : il contient le détail des tentatives\n" +
      'et des extraits des réponses de marstoy.com pour adapter le scraper.',
  );
  process.exit(1);
}
