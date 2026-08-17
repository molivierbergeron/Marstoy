/**
 * Affiche les lignes de l'export Rebrickable pour une liste de sets.
 * Complément de diagnose-product.mjs : une fois la référence Marstoy connue,
 * il faut voir le nombre de pièces réel des candidats pour savoir lequel le
 * garde-fou aurait dû accepter.
 *
 * Usage : TARGET_SETS=60433,42042 node scripts/diagnose-sets.mjs
 */

import { loadLegoIndex } from './lib/legodata.mjs';

const wanted = (process.env.TARGET_SETS || '')
  .split(',').map((value) => value.trim()).filter(Boolean);

if (!wanted.length) {
  console.error('TARGET_SETS manquant.');
  process.exit(1);
}

const index = await loadLegoIndex();
console.log(`index LEGO : ${index.totalSets} sets\n`);

for (const number of wanted) {
  const editions = index.byNumber.get(number.split('-')[0]) || [];
  if (!editions.length) {
    console.log(`${number} : introuvable`);
    continue;
  }
  for (const set of editions) {
    console.log(`${set.setNum} · ${set.numParts} pièces · ${set.year} · ${set.theme} · ${set.name}`);
  }
}
