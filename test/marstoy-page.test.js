/**
 * Ces tests s'appuient sur une vraie page Marstoy, capturée par le workflow
 * (data/recon.json → test/fixtures). Marstoy tourne sur ShopLine, pas Shopify.
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

test('une fiche sans référence renvoie code null plutôt que d\'inventer', () => {
  const details = extractProductDetails(realPage, 'https://www.marstoy.com/products/the-rack-railway');
  assert.equal(details.code, null);
});

test('la référence de l\'URL fait foi', () => {
  const details = extractProductDetails(
    '<html><head><title>Blocks-marstoy</title></head><body>M11111 M11111 M11111</body></html>',
    'https://www.marstoy.com/products/moc-m70334-parts-kit',
  );
  assert.equal(details.code, 'M70334');
});

test('sans référence dans l\'URL, la plus fréquente de la page gagne', () => {
  const html =
    '<html><head><title>x</title></head><body>' +
    'voir aussi M99999 · sku M70334 · M70334 · réf M70334' +
    '</body></html>';
  const details = extractProductDetails(html, 'https://www.marstoy.com/products/un-nom-quelconque');
  assert.equal(details.code, 'M70334');
});

test('les entités HTML des URLs d\'image sont décodées', () => {
  const html = '<meta property="og:image" content="https://x.test/a.jpg?w=2000&amp;h=2000" />';
  const details = extractProductDetails(html, 'https://www.marstoy.com/products/x');
  assert.equal(details.image, 'https://x.test/a.jpg?w=2000&h=2000');
});
