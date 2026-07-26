import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchCadRate, toCad } from '../scripts/lib/fx.mjs';
import { extractCurrency } from '../scripts/lib/marstoy.mjs';

const stub = (payload) => async () => payload;

test('fetchCadRate lit le taux renvoyé par Frankfurter', async () => {
  const fx = await fetchCadRate('USD', {
    fetchJson: stub({ amount: 1, base: 'USD', date: '2026-07-24', rates: { CAD: 1.3712 } }),
  });
  assert.equal(fx.rate, 1.3712);
  assert.equal(fx.date, '2026-07-24');
});

test('fetchCadRate court-circuite quand la source est déjà en CAD', async () => {
  const fx = await fetchCadRate('cad', { fetchJson: () => assert.fail('aucun appel attendu') });
  assert.equal(fx.rate, 1);
});

test('fetchCadRate renvoie null plutôt qu\'un taux inventé', async () => {
  assert.equal(await fetchCadRate('', { fetchJson: stub({}) }), null);
  assert.equal(await fetchCadRate('XX', { fetchJson: stub({}) }), null);
  assert.equal(await fetchCadRate('USD', { fetchJson: stub({ rates: {} }) }), null);
  assert.equal(await fetchCadRate('USD', { fetchJson: stub({ rates: { CAD: 0 } }) }), null);
  assert.equal(
    await fetchCadRate('USD', { fetchJson: () => { throw new Error('réseau'); } }),
    null,
  );
});

test('toCad convertit et arrondit au cent', () => {
  assert.equal(toCad('26.00', 1.3712), 35.65);
  assert.equal(toCad('18', 1.5), 27);
  assert.equal(toCad('1 234,50', 2), 2469);
});

test('toCad refuse ce qui n\'est pas un prix', () => {
  assert.equal(toCad(null, 1.37), null);
  assert.equal(toCad('gratuit', 1.37), null);
  assert.equal(toCad('26.00', null), null);
});

test('extractCurrency ignore un og:price:currency vide, comme chez Marstoy', () => {
  const html = '<meta property="og:price:amount" content="26.00" />' +
    '<meta property="og:price:currency" content="" />';
  assert.equal(extractCurrency(html), null);
});

test('extractCurrency lit les devises déclarées ailleurs dans la page', () => {
  assert.equal(extractCurrency('{"priceCurrency":"USD"}'), 'USD');
  assert.equal(extractCurrency('{"currencyCode":"cad"}'), 'CAD');
  assert.equal(extractCurrency('{"shopCurrency":"EUR"}'), 'EUR');
});

test('extractCurrency ne conclut pas sur un « $ » seul', () => {
  assert.equal(extractCurrency('<span class="price">$26.00</span>'), null);
  assert.equal(extractCurrency('<span class="price">US$26.00</span>'), 'USD');
});
