/**
 * Ces tests s'appuient sur une vraie page Marstoy, capturée par le workflow
 * (data/recon.json → test/fixtures). Marstoy tourne sur ShopLine, pas Shopify.
 *
 * Leçon du deuxième run réel : le catalogue mêle des clones de sets LEGO
 * (URL `moc-m70334-parts-kit`) et les MOC maison de Marstoy (« Moc The JEEP »,
 * codes `M03xxx` internes). Chercher un code n'importe où dans la page attrapait
 * ceux des produits suggérés et inventait des correspondances — d'où la règle
 * stricte : URL ou titre, rien d'autre.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { extractProductDetails } from '../scripts/lib/marstoy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const realPage = await readFile(path.join(here, 'fixtures/marstoy-product-shopline.html'), 'utf8');

test('extrait titre, image et nombre de pièces d\'une vraie fiche ShopLine', () => {
  const details = extractProductDetails(realPage, 'https://www.marstoy.com/products/the-rack-railway');

  // Le suffixe « -marstoy » de leur balise title doit disparaître.
  assert.equal(details.title, 'The Rack Railway');
  assert.match(details.image, /^https:\/\/img\.myshopline\.com\/image\/store\//);
  // « Pcs: about 1987 pcs » dans la description.
  assert.equal(details.marstoyParts, 1987);
});

test('un MOC maison sans référence renvoie code null plutôt que d\'inventer', () => {
  const details = extractProductDetails(realPage, 'https://www.marstoy.com/products/the-rack-railway');
  assert.equal(details.code, null);
});

test('la référence vient du slug de l\'URL', () => {
  const details = extractProductDetails(
    '<html><head><title>MOC M70334 Parts Kit-marstoy</title></head><body></body></html>',
    'https://www.marstoy.com/products/moc-m70334-parts-kit',
  );
  assert.equal(details.code, 'M70334');
});

test('à défaut de slug, le titre du produit fait foi', () => {
  const details = extractProductDetails(
    '<meta property="og:title" content="MOC M70334 Parts Kit-marstoy" />',
    'https://www.marstoy.com/products/un-nom-sans-code',
  );
  assert.equal(details.code, 'M70334');
});

test('les codes des produits suggérés ne contaminent pas la fiche', () => {
  // Le piège du deuxième run : ces codes apparaissaient plus souvent que celui
  // du produit et gagnaient le vote de fréquence.
  const html =
    '<head><meta property="og:title" content="The Rack Railway-marstoy" /></head>' +
    '<body><section class="recommendations">' +
    '<a href="/products/moc-m03203-parts-kit">M03203</a><a href="/x">M03203</a><a href="/y">M03203</a>' +
    '<a href="/products/moc-m03120-parts-kit">M03120</a><a href="/z">M03120</a>' +
    '</section></body>';
  const details = extractProductDetails(html, 'https://www.marstoy.com/products/the-rack-railway');
  assert.equal(details.code, null);
  assert.equal(details.title, 'The Rack Railway');
});

test('un slug avec paramètres ou slash final reste lisible', () => {
  for (const url of [
    'https://www.marstoy.com/products/moc-m70334-parts-kit/',
    'https://www.marstoy.com/products/moc-m70334-parts-kit?variant=42',
  ]) {
    assert.equal(extractProductDetails('<html></html>', url).code, 'M70334', url);
  }
});

test('les entités HTML des URLs d\'image sont décodées', () => {
  const html = '<meta property="og:image" content="https://x.test/a.jpg?w=2000&amp;h=2000" />';
  const details = extractProductDetails(html, 'https://www.marstoy.com/products/x');
  assert.equal(details.image, 'https://x.test/a.jpg?w=2000&h=2000');
});
