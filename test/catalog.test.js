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

/**
 * Extrait le bloc d'export de la page et l'exécute sur une liste donnée.
 * Le code vit dans une closure qui n'a pas de DOM : on lui injecte `filtered`
 * plutôt que de simuler un navigateur.
 */
async function runExport(filtered) {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  const block = html.match(/(const EXPORT_HEADERS[\s\S]*?\n {2}}\n)\n {2}async function exportList/);
  assert.ok(block, 'bloc d\'export introuvable');
  return new Function('filtered', `${block[1]}; return exportRows();`)(filtered);
}

test('l\'export sort les six colonnes demandées, tabulées', async () => {
  const rows = await runExport([
    {
      name: "The Mandalorian's N-1 Starfighter",
      priceCad: 55.99,
      legoPriceCad: 349.99,
      savingsPct: 84,
      savingsCad: 294,
      marstoyUrl: 'https://www.marstoy.com/products/moc-m24457-parts-kit',
    },
  ]);

  assert.deepEqual(rows[0], [
    'Nom du set', 'prix marstoy', 'prix original',
    'economie (%)', 'economie ($)', 'Lien marstoy',
  ]);
  assert.deepEqual(rows[1], [
    "The Mandalorian's N-1 Starfighter",
    '55,99',
    '349,99',
    84,
    '294,00',
    'https://www.marstoy.com/products/moc-m24457-parts-kit',
  ]);
  // Six colonnes partout, sinon le collage se décale dans le tableur.
  for (const row of rows) assert.equal(row.length, 6);
});

test('un prix LEGO inconnu laisse des cellules vides, jamais des zéros', async () => {
  const rows = await runExport([
    { name: 'Sans prix', priceCad: 40, marstoyUrl: 'https://x' },
  ]);
  assert.deepEqual(rows[1].slice(1, 5), ['40,00', '', '', '']);
});

test('un produit retiré du catalogue n\'exporte pas son lien mort', async () => {
  const rows = await runExport([
    { name: 'Retiré', priceCad: 40, unavailable: true, marstoyUrl: 'https://mort' },
  ]);
  assert.equal(rows[1][0], 'Retiré');
  assert.equal(rows[1][1], '40,00', 'le prix connu reste exporté');
  assert.equal(rows[1][5], '', 'le lien mènerait à un 404');
});

test('le total n\'impute l\'économie qu\'aux sets réellement comparables', async () => {
  const rows = await runExport([
    { name: 'Comparable', priceCad: 50, legoPriceCad: 200, savingsPct: 75, savingsCad: 150, marstoyUrl: 'https://a' },
    { name: 'Sans prix LEGO', priceCad: 100, marstoyUrl: 'https://b' },
  ]);
  const total = rows.at(-1);

  assert.equal(total[0], 'Total');
  assert.equal(total[1], '150,00', 'la somme payée couvre toute la liste');
  // 150 $ économisés sur les 200 $ comparables, pas sur les 300 $ de la liste :
  // sinon le pourcentage se calculerait sur un dénominateur incomplet.
  assert.equal(total[3], 75);
  assert.equal(total[4], '150,00');
});

/**
 * Exécute la chaîne de copie de la page contre des sosies de `navigator` et
 * `document`. Le bug corrigé ici ne se voyait qu'à l'exécution : le bouton
 * « Exporter » ne faisait rien du tout quand le presse-papiers refusait et que
 * `navigator.share` n'existait pas — c'est-à-dire sur navigateur de bureau.
 */
async function runCopyChain({ clipboardOk, execCommandOk, hasShare, shareThrows }) {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  const block = html.match(/(async function copyText[\s\S]*?\n {2}}\n)\n {2}\/\*\*/)?.[1]
    ?? html.match(/(async function copyText[\s\S]*?\n {2}}\n)$/m)?.[1];
  const rest = html.match(/(function showCopyFallback[\s\S]*?\n {2}}\n)/)?.[1];
  const list = html.match(/(async function exportList[\s\S]*?\n {2}}\n)/)?.[1];
  assert.ok(block && rest && list, 'chaîne de copie introuvable');

  const seen = { alert: null, shown: null };
  const area = { value: '', focus() {}, setSelectionRange() {}, scrollIntoView() {} };
  const fallbackEl = { hidden: true, querySelector: () => area };
  const navigator = {
    clipboard: {
      writeText: () => (clipboardOk ? Promise.resolve() : Promise.reject(new Error('refus'))),
    },
    ...(hasShare
      ? {
        share: () => {
          if (!shareThrows) return Promise.resolve();
          const error = new Error('annulé');
          error.name = shareThrows;
          return Promise.reject(error);
        },
      }
      : {}),
  };
  const document = {
    createElement: () => ({
      style: {}, focus() {}, setSelectionRange() {}, remove() {},
    }),
    body: { append() {} },
    execCommand: () => execCommandOk,
  };
  const win = { alert: (message) => { seen.alert = message; } };

  const source = `${block}\n${rest}\n${list}\n return exportList();`;
  await new Function(
    'navigator', 'document', 'window', 'fallbackEl', 'exportRows', 'cell',
    'filtered', 'activeList', source,
  )(
    navigator, document, win, fallbackEl,
    () => [['Nom du set'], ['Un set']], (v) => String(v),
    [{ name: 'Un set' }], () => null,
  );

  seen.shown = fallbackEl.hidden ? null : area.value;
  return seen;
}

test('le presse-papiers moderne suffit quand il est accordé', async () => {
  const seen = await runCopyChain({ clipboardOk: true, execCommandOk: false, hasShare: false });
  assert.match(seen.alert, /copié/);
  assert.equal(seen.shown, null, 'aucun repli inutile');
});

test('execCommand rattrape un presse-papiers refusé', async () => {
  const seen = await runCopyChain({ clipboardOk: false, execCommandOk: true, hasShare: false });
  assert.match(seen.alert, /copié/);
  assert.equal(seen.shown, null);
});

test('le bouton Exporter n\'échoue jamais en silence', async () => {
  // Le cas exact du bug : bureau, presse-papiers refusé, pas de partage.
  const seen = await runCopyChain({ clipboardOk: false, execCommandOk: false, hasShare: false });
  assert.equal(seen.alert, null, 'rien n\'a été copié, donc rien à annoncer');
  assert.ok(seen.shown?.includes('Nom du set'), 'le tableau doit s\'afficher pour copie manuelle');
});

test('un partage annulé volontairement ne déclenche pas le repli', async () => {
  const cancelled = await runCopyChain({
    clipboardOk: false, execCommandOk: false, hasShare: true, shareThrows: 'AbortError',
  });
  assert.equal(cancelled.shown, null, 'l\'utilisateur a fermé la feuille exprès');

  // Un partage qui casse pour une autre raison, lui, mérite le repli.
  const broken = await runCopyChain({
    clipboardOk: false, execCommandOk: false, hasShare: true, shareThrows: 'NotAllowedError',
  });
  assert.ok(broken.shown?.includes('Nom du set'));
});

/** Rend une référence écartée avec la vraie fonction de la page. */
async function renderSkipped(item) {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  const escape = html.match(/(const escapeHtml =[\s\S]*?\}\[char\]\)\);\n)/)?.[1];
  const card = html.match(/(function skippedCardHtml[\s\S]*?\n {2}}\n)/)?.[1];
  assert.ok(escape && card, 'rendu des écartées introuvable');
  return new Function('item', `${escape}${card}; return skippedCardHtml(item);`)(item);
}

const REJECTED = {
  kind: 'rejected',
  code: 'M33406',
  url: 'https://www.marstoy.com/products/m33406',
  marstoyTitle: 'MOC M24024 Parts Kit',
  marstoyParts: 1401,
  num: '60433',
  name: 'Modular Space Station',
  setUrl: 'https://rebrickable.com/sets/60433-1/',
  legoParts: 1099,
  gapPct: 27,
  reason: 'nombre de pièces trop éloigné',
};

test('une référence écartée montre la preuve chiffrée et les deux liens', async () => {
  const card = await renderSkipped(REJECTED);

  assert.match(card, /M33406/);
  assert.match(card, /apparié à 60433 Modular Space Station/);
  // Les deux nombres et l'écart : c'est ce qui permet de juger sans lire le code.
  assert.match(card, /1401 pièces annoncées contre 1099 chez LEGO/);
  assert.match(card, /écart 27 %/);
  assert.match(card, /nombre de pièces trop éloigné/);
  assert.match(card, /https:\/\/www\.marstoy\.com\/products\/m33406/);
  assert.match(card, /https:\/\/rebrickable\.com\/sets\/60433-1\//);
  // Pas d'étoile : une référence écartée n'est pas dans le catalogue, elle ne
  // peut pas entrer dans une short list.
  assert.doesNotMatch(card, /data-star/);
});

test('une référence non résolue n\'affiche pas de set supposé', async () => {
  const card = await renderSkipped({
    kind: 'unresolved',
    code: 'M99999',
    url: 'https://www.marstoy.com/products/m99999',
    marstoyTitle: 'MOC M99999 Parts Kit',
    tried: ['99999'],
    reason: 'aucun set LEGO connu',
  });

  assert.match(card, /aucun set LEGO pour 99999/);
  assert.doesNotMatch(card, /Set supposé/);
  assert.doesNotMatch(card, /apparié à/);
});

test('le titre Marstoy d\'une écartée est échappé', async () => {
  // Ces titres sont saisis à la main chez Marstoy : ils ne sont pas de confiance.
  const card = await renderSkipped({
    ...REJECTED,
    marstoyTitle: '<img src=x onerror=alert(1)>',
  });
  assert.doesNotMatch(card, /<img src=x/);
  assert.match(card, /&lt;img src=x/);
});

test('le build publie les écartées avec de quoi les vérifier', async () => {
  const build = await readFile(path.join(root, 'scripts/build-catalog.mjs'), 'utf8');
  // Sans l'URL de la fiche, un rejet est une affirmation invérifiable.
  assert.match(build, /url: item\.url,/);
  assert.match(build, /skipped: \[/);
  assert.match(build, /kind: 'rejected'/);
  assert.match(build, /kind: 'unresolved'/);
  assert.match(build, /gapPct/);

  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  assert.match(html, /data-view="skipped"/);
  assert.match(html, /catalog\.skipped/);
});

test('la barre des totaux disparaît vraiment quand elle est masquée', async () => {
  // `display: flex` battait le `display: none` de [hidden] : la barre restait
  // une boîte vide sur toutes les vues sans total.
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  assert.match(html, /\.totals\[hidden\] \{ display: none; \}/);
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
