/**
 * Le 12 septembre 2026, marstoy.com s'est mis à répondre 403 à tout : produits,
 * sitemap, collections. Ces tests fixent ce que le client réseau doit faire
 * face à un mur anti-robot — insister un peu, puis renoncer sans s'acharner —
 * parce que la différence entre les deux, c'est une heure de runner.
 */

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { forbiddenCount, get, resetForbiddenCount } from '../scripts/lib/fetch-util.mjs';

const realFetch = globalThis.fetch;

/** Faux serveur : rend les statuts de la liste, un par appel, et compte. */
function server(statuses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return new Response(status === 200 ? 'ok' : 'refusé', { status });
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  resetForbiddenCount();
});

test('se présente avec les en-têtes complets d\'un navigateur', async () => {
  const calls = server([200]);
  await get('https://www.marstoy.com/sitemap.xml', { accept: 'application/xml' });

  const { headers } = calls[0];
  assert.match(headers['User-Agent'], /Chrome\/126/);
  assert.equal(headers.Accept, 'application/xml');
  // Un Chrome annoncé qui n'envoie ni Sec-Fetch-* ni sec-ch-ua se trahit.
  assert.equal(headers['Sec-Fetch-Mode'], 'navigate');
  assert.equal(headers['Sec-Fetch-Site'], 'none');
  assert.match(headers['sec-ch-ua'], /Chromium/);
  // undici pose et décode Accept-Encoding lui-même : le fixer livrerait du binaire.
  assert.equal(headers['Accept-Encoding'], undefined);
});

test('une fiche ouverte depuis la boutique annonce sa provenance', async () => {
  const calls = server([200]);
  await get('https://www.marstoy.com/products/x', { referer: 'https://www.marstoy.com/' });

  assert.equal(calls[0].headers.Referer, 'https://www.marstoy.com/');
  assert.equal(calls[0].headers['Sec-Fetch-Site'], 'same-origin');
});

test('un 403 isolé est retenté une fois, puis rendu tel quel', async () => {
  const calls = server([403, 403]);
  const response = await get('https://www.marstoy.com/sitemap.xml', { forbiddenPauseMs: 0 });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 2, 'une seule seconde chance, pas quatre');
});

test('un 403 qui laisse passer à la seconde tentative rend bien la page', async () => {
  const calls = server([403, 200]);
  const response = await get('https://www.marstoy.com/sitemap.xml', { forbiddenPauseMs: 0 });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test('le mur constaté, on cesse de réessayer — 3000 fiches ne coûtent pas 3000 attentes', async () => {
  const calls = server([403]);
  for (let i = 0; i < 6; i += 1) {
    await get(`https://www.marstoy.com/products/${i}`, { forbiddenPauseMs: 0 });
  }

  // Le budget compte les refus, pas les fiches : les deux premières en
  // consomment deux chacune, après quoi chaque fiche coûte une seule requête.
  assert.equal(calls.length, 2 + 2 + 1 + 1 + 1 + 1);
  assert.equal(forbiddenCount(), calls.length);
});

test('`retries: 0` renvoie le refus plutôt que de lever `undefined`', async () => {
  server([403]);
  const response = await get('https://www.marstoy.com/', { retries: 0, forbiddenPauseMs: 0 });
  assert.equal(response.status, 403);
});
