/**
 * Le 11 septembre 2026, marstoy.com s'est mis à tout refuser. Le repli sur le
 * catalogue LEGO s'est déclenché et a écrasé 324 références vues en vente, avec
 * leurs titres et leurs prix, par 4928 références calculées sans prix. Ces
 * tests fixent la règle qui l'interdit.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chooseCatalogSource } from '../scripts/lib/fallback.mjs';

const marstoyCatalog = { counts: { resolved: 324 }, products: new Array(324).fill({}) };
const legoFallbackCatalog = { counts: { resolved: 0 }, products: new Array(4928).fill({}) };

test('la boutique a répondu : on publie ce qu\'on en a lu', () => {
  assert.equal(
    chooseCatalogSource({ resolvedCount: 324, previous: marstoyCatalog }),
    'marstoy',
  );
});

test('la boutique se tait : le catalogue qui vient d\'elle est conservé', () => {
  assert.equal(
    chooseCatalogSource({ resolvedCount: 0, previous: marstoyCatalog }),
    'preserve',
  );
});

test('premier run, rien à préserver : le repli LEGO vaut mieux que rien', () => {
  assert.equal(chooseCatalogSource({ resolvedCount: 0, previous: null }), 'lego');
  assert.equal(chooseCatalogSource({ resolvedCount: 0, previous: {} }), 'lego');
});

test('un catalogue déjà dégradé ne se préserve pas : il est calculé, pas observé', () => {
  assert.equal(
    chooseCatalogSource({ resolvedCount: 0, previous: legoFallbackCatalog }),
    'lego',
  );
});

test('un catalogue vide ne se préserve pas, quoi que disent ses compteurs', () => {
  assert.equal(
    chooseCatalogSource({ resolvedCount: 0, previous: { counts: { resolved: 12 }, products: [] } }),
    'lego',
  );
});
