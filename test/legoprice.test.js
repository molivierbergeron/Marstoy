import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadLegoPrices, priceFromBricksetSet } from '../scripts/lib/legoprice.mjs';

const newRecon = () => ({ counts: {}, samples: {} });

test('priceFromBricksetSet préfère le prix canadien', () => {
  const set = { LEGOCom: { CA: { retailPrice: 649.99 }, US: { retailPrice: 549.99 } } };
  assert.deepEqual(priceFromBricksetSet(set, 1.4), { price: 649.99, currency: 'CAD' });
});

test('priceFromBricksetSet convertit l\'américain à défaut de canadien', () => {
  const set = { LEGOCom: { US: { retailPrice: 100 } } };
  assert.deepEqual(priceFromBricksetSet(set, 1.4086), { price: 140.86, currency: 'USD→CAD' });
});

test('priceFromBricksetSet renvoie null plutôt qu\'un prix douteux', () => {
  assert.equal(priceFromBricksetSet({}, 1.4), null);
  assert.equal(priceFromBricksetSet({ LEGOCom: { CA: { retailPrice: 0 } } }, 1.4), null);
  assert.equal(priceFromBricksetSet({ LEGOCom: { US: { retailPrice: 100 } } }, null), null);
});

test('sans clé, aucun appel et le cache est renvoyé tel quel', async () => {
  const recon = newRecon();
  const cache = { 10276: { price: 549.99, fetchedAt: new Date().toISOString() } };
  const out = await loadLegoPrices([{ num: '10276', year: 2020 }], cache, recon, {});
  assert.deepEqual(out, cache);
  assert.equal(recon.counts.legoPricesFetched, 0);
  assert.ok(recon.bricksetStatus['clé absente']);
});

test('un cache frais évite de redemander', async () => {
  const recon = newRecon();
  const cache = {
    10276: { price: 549.99, fetchedAt: new Date().toISOString() },
    // Un prix absent est mémorisé aussi : inutile de le redemander sans cesse.
    43307: { price: null, fetchedAt: new Date().toISOString() },
  };
  const out = await loadLegoPrices(
    [{ num: '10276', year: 2020 }, { num: '43307', year: 2026 }],
    cache,
    recon,
    { apiKey: 'peu-importe' },
  );
  assert.equal(recon.counts.legoPricesFetched, 0);
  assert.deepEqual(out, cache);
});

test('une entrée périmée est redemandée', async () => {
  const recon = newRecon();
  const vieux = new Date(Date.now() - 200 * 86400000).toISOString();
  // Pas de vraie requête ici : la clé provoque le chemin réseau, qui échoue
  // proprement et laisse quand même une entrée datée.
  const out = await loadLegoPrices(
    [{ num: '10276', year: 2020 }],
    { 10276: { price: 549.99, fetchedAt: vieux } },
    recon,
    { apiKey: 'clé-invalide' },
  );
  assert.equal(recon.counts.legoPricesFetched, 1);
  assert.ok(Object.prototype.hasOwnProperty.call(out, '10276'));
});
