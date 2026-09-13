/**
 * Ce que doit produire un run où marstoy.com refuse tout (403 partout, comme
 * depuis le 12 septembre 2026) : un rapport qui dit *qui* bloque, et un essai
 * direct des sitemaps produits — leur index peut être muré alors qu'eux non.
 */

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { resetForbiddenCount } from '../scripts/lib/fetch-util.mjs';
import { discoverCatalog, noteBlocked } from '../scripts/lib/marstoy.mjs';

const realFetch = globalThis.fetch;

// La règle vérifiée ici est « on renonce », pas « on attend cinq secondes ».
process.env.MARSTOY_FORBIDDEN_PAUSE_MS = '0';

afterEach(() => {
  globalThis.fetch = realFetch;
  resetForbiddenCount();
});

test('noteBlocked garde la pièce à conviction : le corps du premier refus', async () => {
  const recon = { samples: {} };
  const response = new Response('<title>Attention Required! | Cloudflare</title>', {
    status: 403,
    headers: { server: 'cloudflare', 'cf-ray': '8f2c', 'content-type': 'text/html' },
  });

  await noteBlocked(recon, response, 'https://www.marstoy.com/sitemap.xml');

  assert.equal(recon.samples.blockedResponse.status, 403);
  assert.equal(recon.samples.blockedResponse.server, 'cloudflare');
  assert.equal(recon.samples.blockedResponse.cfRay, '8f2c');
  assert.match(recon.samples.blockedResponse.body, /Cloudflare/);
});

test('noteBlocked ne garde que le premier : le centième refus n\'apprend rien de plus', async () => {
  const recon = { samples: {} };
  await noteBlocked(recon, new Response('premier', { status: 403 }), 'a');
  await noteBlocked(recon, new Response('second', { status: 403 }), 'b');

  assert.equal(recon.samples.blockedResponse.body, 'premier');
  assert.equal(recon.samples.blockedResponse.where, 'a');
});

test('un site entièrement muré rend un rapport qui le dit, sans planter', async () => {
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return new Response('refusé par le WAF', { status: 403, headers: { server: 'shopline' } });
  };

  const { products, recon } = await discoverCatalog();

  assert.deepEqual(products, []);
  assert.equal(recon.blocked, true);
  assert.ok(recon.counts.forbidden > 0);
  assert.equal(recon.samples.blockedResponse.server, 'shopline');

  // L'index muré ne doit pas condamner la stratégie : les sitemaps produits
  // sont tentés directement, sous le nom que l'index publiait.
  assert.ok(seen.some((url) => url.endsWith('/sitemap_products_1.xml')));
});
