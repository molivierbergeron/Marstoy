import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { parseCsv, resolveFromIndex } from '../scripts/lib/legodata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Index minimal, dans la forme produite par loadLegoIndex(). */
function makeIndex(sets) {
  const byNumber = new Map();
  for (const set of sets) {
    const base = set.setNum.split('-')[0];
    if (!byNumber.has(base)) byNumber.set(base, []);
    byNumber.get(base).push(set);
  }
  return { byNumber, totalSets: sets.length, totalThemes: 0 };
}

const INDEX = makeIndex([
  { setNum: '10276-1', num: '10276', name: 'Colosseum', year: 2020, numParts: 9036, theme: 'Icons' },
  { setNum: '419-1', num: '419', name: 'Vintage Car', year: 1972, numParts: 60, theme: 'Classic' },
  { setNum: '41900-1', num: '41900', name: 'Pineapple Bag Charm', year: 2019, numParts: 68, theme: 'Dots' },
  { setNum: '75192-1', num: '75192', name: 'Millennium Falcon', year: 2017, numParts: 7541, theme: 'Star Wars' },
  { setNum: '30000-1', num: '30000', name: 'Ancien', year: 1990, numParts: 20, theme: 'Vieux' },
  { setNum: '30000-2', num: '30000', name: 'Réédition', year: 2015, numParts: 40, theme: 'Récent' },
]);

test('parseCsv gère les guillemets, virgules et retours Windows', () => {
  const csv = 'set_num,name,year\r\n10276-1,"Colosseum, the",2020\r\n419-1,"Say ""hi""",1972\r\n';
  assert.deepEqual(parseCsv(csv), [
    { set_num: '10276-1', name: 'Colosseum, the', year: '2020' },
    { set_num: '419-1', name: 'Say "hi"', year: '1972' },
  ]);
});

test('parseCsv ignore une ligne finale vide', () => {
  assert.equal(parseCsv('a,b\n1,2\n').length, 1);
});

test('resolveFromIndex inverse les chiffres', () => {
  const result = resolveFromIndex('M67201', INDEX);
  assert.equal(result.ok, true);
  assert.equal(result.num, '10276');
  assert.equal(result.name, 'Colosseum');
  assert.equal(result.matchedBy, 'inversion');
});

test('resolveFromIndex tranche sur l\'année quand plusieurs candidats existent', () => {
  // M914 peut valoir 419 (1972) ou 41900 (2019) : le plus récent gagne.
  const result = resolveFromIndex('M914', INDEX);
  assert.equal(result.ok, true);
  assert.equal(result.num, '41900');
  assert.equal(result.name, 'Pineapple Bag Charm');
});

test('resolveFromIndex choisit la bonne édition d\'un même numéro', () => {
  const result = resolveFromIndex('M00003', INDEX);
  assert.equal(result.setNum, '30000-2');
  assert.equal(result.name, 'Réédition');
});

test('resolveFromIndex signale une référence inconnue avec les candidats essayés', () => {
  const result = resolveFromIndex('M99999', INDEX);
  assert.equal(result.ok, false);
  assert.deepEqual(result.tried, ['99999']);
});

test('resolveFromIndex respecte les overrides, y compris null', () => {
  const forced = resolveFromIndex('M67201', INDEX, { M67201: '75192-1' });
  assert.equal(forced.num, '75192');
  assert.equal(forced.matchedBy, 'override');

  const ignored = resolveFromIndex('M67201', INDEX, { M67201: null });
  assert.equal(ignored.ok, false);
});

test('le script de la page du site est syntaxiquement valide', async () => {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script && script.length > 500, 'script inline introuvable');
  assert.doesNotThrow(() => new Function(script));
});

test('le catalogue livré est un JSON valide avec la forme attendue', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'site/data/catalog.json'), 'utf8'));
  assert.ok(Array.isArray(catalog.products));
  assert.ok(catalog.counts && typeof catalog.counts.resolved === 'number');
});

test('un set LEGO sans pièce ne peut pas cloner une boîte de briques', async () => {
  // M142 s'était retrouvé apparié au livre « 4.5v Idea Book » (0 pièce) alors
  // que Marstoy annonçait 629 pièces : le garde-fou exigeait `set.numParts`
  // vrai, et zéro étant falsy, il ne se déclenchait pas.
  const build = await readFile(path.join(root, 'scripts/build-catalog.mjs'), 'utf8');
  assert.match(build, /if \(!set\.numParts\)/);
  assert.match(build, /ne contient aucune pièce/);
  assert.doesNotMatch(build, /if \(item\.marstoyParts && set\.numParts\)/);
});

test('le manifeste déclare des icônes PNG pour l\'installation bureau', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'site/manifest.webmanifest'), 'utf8'),
  );
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'), '192 px requis par Chrome');
  assert.ok(sizes.includes('512x512'), '512 px requis par Chrome');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    await readFile(path.join(root, 'site', icon.src.replace('./', '')));
  }
});

test('le tri par arrivée est proposé à part, en bêta assumée', async () => {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');

  // Le tri par défaut est l'arrivée chez Marstoy : c'est ce qu'on vient voir.
  // L'année de sortie du set reste offerte juste après.
  const options = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(options[0], 'added');
  assert.equal(options[1], 'year');
  assert.match(html, /comparators\[sortEl\.value\] \|\| comparators\.added/);

  assert.match(html, /<option value="year">Plus récents<\/option>/);
  assert.match(html, /<option value="added">Arrivées \(bêta\)<\/option>/);
});

test('le registre des arrivées est tenu d\'un passage à l\'autre', async () => {
  const build = await readFile(path.join(root, 'scripts/build-catalog.mjs'), 'utf8');
  assert.match(build, /data\/first-seen\.json/);
  // Une référence déjà connue garde sa date : sinon tout serait « nouveau »
  // à chaque passage.
  assert.match(build, /if \(!firstSeen\[item\.code\]\)/);
  assert.match(build, /item\.lastmod \|\| today/);

  const workflow = await readFile(path.join(root, '.github/workflows/build-catalog.yml'), 'utf8');
  assert.match(workflow, /data\/first-seen\.json/, 'le registre doit être commité, sinon il repart de zéro');
});
