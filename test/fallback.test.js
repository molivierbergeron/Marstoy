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

test('un effondrement n\'écrase pas le catalogue publié', () => {
  // Le 31 octobre 2026 : le navigateur s'est fermé après 58 fiches, les 342
  // suivantes ont échoué une à une, et 55 références ont remplacé 319.
  // 55 n'étant pas zéro, le garde-fou d'alors a laissé passer.
  const publie = { counts: { resolved: 319 }, products: new Array(319).fill({}) };

  assert.equal(
    chooseCatalogSource({ resolvedCount: 55, previous: publie }),
    'effondrement',
  );
});

test('la variation ordinaire d\'une boutique reste publiable', () => {
  // Vraies valeurs successives du catalogue : 313, 324, 328, 327, 319.
  // Aucune ne doit être prise pour un effondrement.
  const suite = [313, 324, 328, 327, 319];
  for (let i = 1; i < suite.length; i += 1) {
    const avant = { counts: { resolved: suite[i - 1] }, products: new Array(suite[i - 1]).fill({}) };
    assert.equal(
      chooseCatalogSource({ resolvedCount: suite[i], previous: avant }),
      'marstoy',
      `${suite[i - 1]} → ${suite[i]} doit rester publiable`,
    );
  }
});

test('une vraie fonte progressive finit par passer', () => {
  // Une boutique peut réellement rétrécir. Le seuil laisse passer -30 % d'un
  // coup : on bloque l'accident, pas la décroissance.
  const avant = { counts: { resolved: 100 }, products: new Array(100).fill({}) };
  assert.equal(chooseCatalogSource({ resolvedCount: 71, previous: avant }), 'marstoy');
  assert.equal(chooseCatalogSource({ resolvedCount: 69, previous: avant }), 'effondrement');
});

test('le premier catalogue ne peut pas s\'effondrer', () => {
  assert.equal(chooseCatalogSource({ resolvedCount: 5, previous: null }), 'marstoy');
  assert.equal(
    chooseCatalogSource({ resolvedCount: 5, previous: { counts: { resolved: 0 }, products: [] } }),
    'marstoy',
  );
});
