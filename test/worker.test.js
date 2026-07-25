/**
 * Test d'intégration du Worker complet dans workerd (Miniflare), avec un faux
 * marstoy.com et une fausse API Rebrickable branchés sur `outboundService`.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import * as esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const COLOSSEUM = {
  set_num: '10276-1',
  name: 'Colosseum',
  year: 2020,
  theme_id: 1,
  num_parts: 9036,
  set_img_url: 'https://cdn.rebrickable.com/media/sets/10276-1.jpg',
  set_url: 'https://rebrickable.com/sets/10276-1/',
};

let mf;
let fixture;
const rebrickableCalls = [];

async function bundle() {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/index.js')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    loader: { '.json': 'json' },
  });
  return result.outputFiles[0].text;
}

async function start(bindings) {
  return new Miniflare({
    script: await bundle(),
    modules: true,
    compatibilityDate: '2025-06-01',
    bindings: {
      UPSTREAM_HOST: 'www.marstoy.com',
      LABEL_FORMAT: '{name} — LEGO {num} · {code}',
      REBRICKABLE_API_KEY: 'test-key',
      ...bindings,
    },
    async outboundService(request) {
      const url = new URL(request.url);

      if (url.host === 'www.marstoy.com') {
        if (url.pathname === '/redirect-me') {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://www.marstoy.com/collections/all' },
          });
        }
        if (url.pathname === '/search/suggest.json') {
          return new Response(
            JSON.stringify({ products: [{ title: 'M67201 Blocks', url: '/products/m67201' }] }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(fixture, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            // Doit être supprimée, sinon le script injecté est bloqué.
            'content-security-policy': "default-src 'self'",
            'set-cookie': 'cart=abc; Domain=.marstoy.com; Path=/',
          },
        });
      }

      if (url.host === 'rebrickable.com') {
        rebrickableCalls.push(url.pathname + url.search);
        assert.equal(request.headers.get('authorization'), 'key test-key');
        if (url.pathname === '/api/v3/lego/sets/10276-1/') {
          return Response.json(COLOSSEUM);
        }
        if (url.pathname === '/api/v3/lego/sets/') {
          return Response.json({ count: 0, results: [] });
        }
        return new Response('{"detail":"Not found."}', { status: 404 });
      }

      if (url.host === 'cdn.rebrickable.com') {
        return new Response('binaire', { headers: { 'content-type': 'image/jpeg' } });
      }

      throw new Error(`Requête sortante inattendue : ${request.url}`);
    },
  });
}

before(async () => {
  fixture = await readFile(path.join(here, 'fixtures/marstoy-page.html'), 'utf8');
  mf = await start();
});

after(async () => {
  await mf?.dispose();
});

test('la page produit affiche les vrais noms LEGO', async () => {
  const html = await (await mf.dispatchFetch('https://proxy.test/products/m67201')).text();

  assert.match(html, /<h3>Colosseum — LEGO 10276 · M67201 Building Blocks Set<\/h3>/);
  assert.match(html, /<title>Colosseum — LEGO 10276 · M67201 Building Blocks \| Marstoy<\/title>/);
  assert.match(html, /content="Colosseum — LEGO 10276 · M67201 Building Blocks"/);
  assert.match(html, /title="Voir Colosseum — LEGO 10276 · M67201"/);
});

test('les images pointent sur les visuels officiels Rebrickable', async () => {
  const html = await (await mf.dispatchFetch('https://proxy.test/products/m67201')).text();

  assert.match(html, /src="https:\/\/cdn\.rebrickable\.com\/media\/sets\/10276-1\.jpg"/);
  assert.match(html, /alt="Colosseum \(LEGO 10276\)"/);
  // Le <source> du <picture> gagnerait sur le <img> : il doit disparaître.
  assert.doesNotMatch(html, /<source/);
  assert.doesNotMatch(html, /srcset/);
});

test('une référence inconnue est laissée intacte', async () => {
  const html = await (await mf.dispatchFetch('https://proxy.test/products/m67201')).text();
  assert.match(html, /<h3>M99999 Mystery Set<\/h3>/);
});

test('le contenu des balises script n\'est pas réécrit', async () => {
  const html = await (await mf.dispatchFetch('https://proxy.test/products/m67201')).text();
  assert.match(html, /window\.shopConfig = \{"reference":"M67201"\}/);
});

test('la navigation reste sur le proxy et le script client est injecté', async () => {
  const response = await mf.dispatchFetch('https://proxy.test/products/m67201');
  const html = await response.text();

  assert.doesNotMatch(html, /marstoy\.com/);
  assert.match(html, /<a href="\/products\/m67201"/);
  assert.match(html, /<script src="\/__mr\/client\.js\?v=1" defer><\/script>/);
  assert.match(html, /rel="manifest" href="\/__mr\/manifest\.webmanifest"/);
  // La CSP amont bloquerait le script injecté et le CDN Rebrickable.
  assert.equal(response.headers.get('content-security-policy'), null);
  assert.match(response.headers.get('set-cookie') || '', /^cart=abc; Path=\/$/);
});

test('les redirections amont restent sur notre domaine', async () => {
  const response = await mf.dispatchFetch('https://proxy.test/redirect-me', { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://proxy.test/collections/all');
});

test('les réponses JSON sont réécrites aussi', async () => {
  const data = await (await mf.dispatchFetch('https://proxy.test/search/suggest.json')).json();
  assert.equal(data.products[0].title, 'Colosseum — LEGO 10276 · M67201 Blocks');
  assert.equal(data.products[0].url, '/products/m67201');
});

test('/__mr/resolve renvoie le set et jamais la clé API', async () => {
  const response = await mf.dispatchFetch('https://proxy.test/__mr/resolve?codes=M67201,M99999');
  const body = await response.text();

  assert.doesNotMatch(body, /test-key/);
  const data = JSON.parse(body);
  assert.equal(data.labelFormat, '{name} — LEGO {num} · {code}');
  assert.equal(data.sets.M67201.ok, true);
  assert.equal(data.sets.M67201.num, '10276');
  assert.equal(data.sets.M67201.name, 'Colosseum');
  assert.equal(data.sets.M99999.ok, false);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('/__mr/img relaie l\'image officielle', async () => {
  const response = await mf.dispatchFetch('https://proxy.test/__mr/img/M67201');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(await response.text(), 'binaire');
});

test('/__mr/health décrit la configuration sans divulguer la clé', async () => {
  const response = await mf.dispatchFetch('https://proxy.test/__mr/health');
  const body = await response.text();
  assert.doesNotMatch(body, /test-key/);
  assert.deepEqual(JSON.parse(body), {
    ok: true,
    upstream: 'www.marstoy.com',
    rebrickableKey: true,
    kvCache: false,
    accessToken: false,
  });
});

test('les résolutions sont mises en cache (une seule série d\'appels Rebrickable)', async () => {
  rebrickableCalls.length = 0;
  await (await mf.dispatchFetch('https://proxy.test/products/m67201')).text();
  const first = rebrickableCalls.length;
  await (await mf.dispatchFetch('https://proxy.test/products/m67201')).text();
  assert.equal(rebrickableCalls.length, first, 'la seconde page ne doit plus appeler Rebrickable');
});

test('ACCESS_TOKEN verrouille le proxy et le déverrouille par cookie', async () => {
  const locked = await start({ ACCESS_TOKEN: 'secret42' });
  try {
    assert.equal((await locked.dispatchFetch('https://proxy.test/')).status, 404);

    const gate = await locked.dispatchFetch('https://proxy.test/?k=secret42', { redirect: 'manual' });
    assert.equal(gate.status, 302);
    assert.match(gate.headers.get('set-cookie') || '', /mr_auth=secret42/);

    const allowed = await locked.dispatchFetch('https://proxy.test/', {
      headers: { cookie: 'mr_auth=secret42' },
    });
    assert.equal(allowed.status, 200);

    // Le userscript appelle l'API depuis marstoy.com : `?k=` sans redirection.
    const api = await locked.dispatchFetch('https://proxy.test/__mr/resolve?codes=M67201&k=secret42');
    assert.equal(api.status, 200);

    // Le script injecté doit rester servi sans jeton.
    assert.equal((await locked.dispatchFetch('https://proxy.test/__mr/client.js')).status, 200);
  } finally {
    await locked.dispose();
  }
});
