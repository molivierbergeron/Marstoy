/**
 * Depuis le 14 septembre 2026, la boutique n'est lisible qu'à travers un vrai
 * navigateur. La découverte doit donc accepter un autre transport que `fetch` —
 * et s'en servir réellement, sans retomber en douce sur le transport par défaut,
 * qui se ferait refuser.
 */

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { resetForbiddenCount } from '../scripts/lib/fetch-util.mjs';
import { discoverCatalog } from '../scripts/lib/marstoy.mjs';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  resetForbiddenCount();
});

/** Réponse minimale, à la forme de ce que rend le transport navigateur. */
const reponse = (corps, { status = 200, type = 'application/xml' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (nom) => (nom.toLowerCase() === 'content-type' ? type : null) },
  text: async () => corps,
  json: async () => JSON.parse(corps),
});

test('le transport injecté est utilisé, et `fetch` jamais appelé', async () => {
  globalThis.fetch = () => assert.fail('fetch ne doit pas être sollicité');

  const vues = [];
  const get = async (url) => {
    vues.push(url);
    if (url.endsWith('/sitemap.xml')) {
      return reponse(
        '<sitemapindex><sitemap><loc>https://www.marstoy.com/sitemap_products_1.xml</loc></sitemap></sitemapindex>',
      );
    }
    if (url.endsWith('/sitemap_products_1.xml')) {
      return reponse(
        '<urlset><url><loc>https://www.marstoy.com/products/moc-m70334-parts-kit</loc>' +
          '<lastmod>2026-09-01</lastmod></url></urlset>',
      );
    }
    if (url.includes('/products/')) {
      return reponse(
        '<html><head><meta property="og:title" content="MOC M70334 Parts Kit-marstoy">' +
          '<meta property="og:description" content="Pcs: about 1200 pcs">' +
          '<meta property="product:price:amount" content="42.00"></head></html>',
        { type: 'text/html' },
      );
    }
    return reponse('', { status: 404 });
  };

  const { products, recon } = await discoverCatalog({ get });

  assert.equal(recon.strategyUsed, 'sitemap');
  assert.equal(products.length, 1);
  assert.equal(products[0].code, 'M70334');
  assert.equal(products[0].title, 'MOC M70334 Parts Kit');
  assert.equal(products[0].marstoyParts, 1200);
  assert.equal(products[0].lastmod, '2026-09-01');

  // La fiche produit doit avoir été chargée par le transport, pas devinée.
  assert.ok(vues.some((url) => url.includes('/products/moc-m70334-parts-kit')));
});

test('sans transport injecté, la découverte retombe sur fetch', async () => {
  let appels = 0;
  globalThis.fetch = async () => {
    appels += 1;
    return new Response('refusé', { status: 403 });
  };

  process.env.MARSTOY_FORBIDDEN_PAUSE_MS = '0';
  const { recon } = await discoverCatalog();

  assert.ok(appels > 0, 'le transport par défaut doit rester utilisable');
  assert.equal(recon.blocked, true);
});

test('la progression est annoncée exactement une fois par fiche', async () => {
  const FICHES = 12;
  const locs = Array.from(
    { length: FICHES },
    (_, i) => `<url><loc>https://www.marstoy.com/products/moc-m7033${i}-parts-kit</loc></url>`,
  ).join('');

  let echecs = 0;
  const get = async (url) => {
    if (url.endsWith('/sitemap.xml')) {
      return reponse('<urlset>' + locs + '</urlset>');
    }
    if (url.includes('/products/')) {
      // Une fiche sur trois casse : le compteur ne doit pas décrocher pour
      // autant, ni compter deux fois celles qui aboutissent.
      if (echecs++ % 3 === 0) throw new Error('connexion perdue');
      return reponse('<html><head><title>MOC-marstoy</title></head></html>', { type: 'text/html' });
    }
    return reponse('', { status: 404 });
  };

  const messages = [];
  await discoverCatalog({ get, log: (m) => messages.push(m) });

  const final = messages.filter((m) => m.includes(`${FICHES}/${FICHES} fiches`));
  assert.equal(final.length, 1, `attendu un seul « ${FICHES}/${FICHES} », vu : ${messages.join(' | ')}`);
});
