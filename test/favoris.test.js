/**
 * Le Worker des favoris, exécuté dans workerd avec un vrai KV (Miniflare).
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import * as esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

import { sanitizeCodes, toSlug } from '../workers/favoris/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let mf;

const call = (method, url, body) =>
  mf.dispatchFetch(`https://favoris.test${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(root, 'workers/favoris/src/index.js')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
  });
  mf = new Miniflare({
    script: built.outputFiles[0].text,
    modules: true,
    compatibilityDate: '2025-06-01',
    kvNamespaces: ['FAVORIS'],
  });
});

after(async () => {
  await mf?.dispose();
});

test('toSlug normalise accents, casse et ponctuation', () => {
  assert.equal(toSlug('Marc-Christian'), 'marc-christian');
  assert.equal(toSlug('  Éloïse  '), 'eloise');
  assert.equal(toSlug('Jean/Luc!!'), 'jean-luc');
  assert.equal(toSlug('***'), '');
});

test('sanitizeCodes ne garde que des références plausibles et dédoublonne', () => {
  assert.deepEqual(sanitizeCodes(['m70334', 'M70334', 'bidon', 'M12', 'M25277']),
    ['M70334', 'M25277']);
  assert.equal(sanitizeCodes('pas un tableau'), null);
});

test('un compte se crée, apparaît dans la liste, et refuse le doublon', async () => {
  const created = await call('POST', '/api/users', { name: 'Marc-Christian' });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { slug: 'marc-christian', name: 'Marc-Christian' });

  const again = await call('POST', '/api/users', { name: 'marc christian' });
  assert.equal(again.status, 409);

  const { users } = await (await call('GET', '/api/users')).json();
  assert.deepEqual(users, [
    { slug: 'marc-christian', name: 'Marc-Christian', count: 0, updatedAt: users[0].updatedAt },
  ]);
});

test('une liste se remplace et se relit', async () => {
  await call('POST', '/api/users', { name: 'Marc-Claude' });

  const put = await call('PUT', '/api/list/marc-claude', { codes: ['M70334', 'M25277', 'M70334'] });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).count, 2);

  const got = await (await call('GET', '/api/list/marc-claude')).json();
  assert.deepEqual(got.codes, ['M70334', 'M25277']);
  assert.equal(got.name, 'Marc-Claude');

  // Les listes sont indépendantes : personne n'écrit chez le voisin.
  const autre = await (await call('GET', '/api/list/marc-christian')).json();
  assert.deepEqual(autre.codes, []);
});

test('les entrées douteuses sont écartées plutôt que stockées', async () => {
  await call('PUT', '/api/list/marc-claude', { codes: ['M70334', '<script>', 'M1'] });
  const got = await (await call('GET', '/api/list/marc-claude')).json();
  assert.deepEqual(got.codes, ['M70334']);

  const bad = await call('PUT', '/api/list/marc-claude', { codes: 'oups' });
  assert.equal(bad.status, 400);
});

test('un compte inconnu répond 404 sans rien créer', async () => {
  assert.equal((await call('GET', '/api/list/personne')).status, 404);
  assert.equal((await call('PUT', '/api/list/personne', { codes: [] })).status, 404);
});

test('un nom vide est refusé', async () => {
  assert.equal((await call('POST', '/api/users', { name: '***' })).status, 400);
});

test('CORS est ouvert : le site est sur un autre domaine', async () => {
  const options = await call('OPTIONS', '/api/users');
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
});

test('un compte se supprime', async () => {
  await call('POST', '/api/users', { name: 'Éphémère' });
  assert.equal((await call('DELETE', '/api/users/ephemere')).status, 200);
  assert.equal((await call('GET', '/api/list/ephemere')).status, 404);
});

test('les comptes de départ sont créés une seule fois', async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(root, 'workers/favoris/src/index.js')],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
  });
  const seeded = new Miniflare({
    script: built.outputFiles[0].text,
    modules: true,
    compatibilityDate: '2025-06-01',
    kvNamespaces: ['FAVORIS'],
    bindings: { SEED_USERS: 'Marco,Christian,Marie-Claude' },
  });
  try {
    const first = await (await seeded.dispatchFetch('https://f.test/api/users')).json();
    assert.deepEqual(first.users.map((user) => user.slug), ['christian', 'marco', 'marie-claude']);
    assert.deepEqual(first.users.map((user) => user.name), ['Christian', 'Marco', 'Marie-Claude']);

    // Un compte supprimé ne doit pas réapparaître au prochain appel.
    await seeded.dispatchFetch('https://f.test/api/users/marco', { method: 'DELETE' });
    const after = await (await seeded.dispatchFetch('https://f.test/api/users')).json();
    assert.deepEqual(after.users.map((user) => user.slug), ['christian', 'marie-claude']);
  } finally {
    await seeded.dispose();
  }
});
