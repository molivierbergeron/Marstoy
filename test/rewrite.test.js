import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectCodes, localizeUrls, rewriteJson } from '../src/rewrite.js';
import { CLIENT_JS } from '../src/client.js';

const RESOLUTIONS = new Map([
  [
    'M67201',
    {
      ok: true,
      code: 'M67201',
      setNum: '10276-1',
      num: '10276',
      name: 'Colosseum',
      year: 2020,
      numParts: 9036,
      imgUrl: 'https://cdn.rebrickable.com/media/sets/10276-1.jpg',
    },
  ],
]);

test('collectCodes récupère les références du HTML brut, attributs compris', () => {
  const html = '<h1>Boîte M67201</h1><img alt="photo M29157"><script>var x="M375";</script>';
  assert.deepEqual(collectCodes(html), ['M67201', 'M29157', 'M375']);
});

test('localizeUrls ramène les URLs Marstoy sur notre origine', () => {
  const html = [
    '<a href="https://www.marstoy.com/products/x">a</a>',
    '<img src="//www.marstoy.com/img.jpg">',
    '<link href="http://marstoy.com/style.css">',
    '<a href="https://autre-site.com/x">b</a>',
  ].join('');
  const out = localizeUrls(html, ['www.marstoy.com', 'marstoy.com']);
  assert.equal(
    out,
    '<a href="/products/x">a</a><img src="/img.jpg"><link href="/style.css"><a href="https://autre-site.com/x">b</a>',
  );
});

test('rewriteJson remplace les références dans les champs textuels', () => {
  const body = JSON.stringify({
    results: [{ title: 'M67201 Building Blocks', handle: 'm67201-blocks', price: 129.9 }],
  });
  const out = JSON.parse(rewriteJson(body, RESOLUTIONS, '{name} — LEGO {num} · {code}'));
  assert.equal(out.results[0].title, 'Colosseum — LEGO 10276 · M67201 Building Blocks');
  assert.equal(out.results[0].price, 129.9);
});

test('rewriteJson ne touche ni aux URLs ni aux chemins de fichiers', () => {
  const body = JSON.stringify({
    image: 'https://cdn.example.com/M67201.jpg',
    path: '/products/M67201',
    file: 'M67201.webp',
  });
  const out = JSON.parse(rewriteJson(body, RESOLUTIONS, '{name} — LEGO {num} · {code}'));
  assert.equal(out.image, 'https://cdn.example.com/M67201.jpg');
  assert.equal(out.path, '/products/M67201');
  assert.equal(out.file, 'M67201.webp');
});

test('rewriteJson laisse passer un corps non JSON sans planter', () => {
  assert.equal(rewriteJson('pas du json', RESOLUTIONS, '{name}'), 'pas du json');
});

test('le script client est syntaxiquement valide', () => {
  assert.doesNotThrow(() => new Function(CLIENT_JS));
  // La regex est transmise en tant que chaîne : elle doit contenir `\d` une fois
  // interprétée par le navigateur, pas `\\d`.
  assert.match(CLIENT_JS, /\[Mm\]\(\\\\d\{3,7\}\)/);
});
