/**
 * Inspecte une seule fiche Marstoy et montre ce que le build en tirerait.
 * Sert à répondre à « pourquoi ce produit n'est-il pas listé ? » sans avoir à
 * relancer un catalogue complet — et depuis un runner, seul endroit d'où
 * marstoy.com est joignable.
 *
 * Usage : TARGET_URL=https://www.marstoy.com/products/m33406 node scripts/diagnose-product.mjs
 */

import { get } from './lib/fetch-util.mjs';
import { extractProductDetails } from './lib/marstoy.mjs';
import { candidateSetNumbers, extractCodes } from '../lib/setnum.js';

const url = process.env.TARGET_URL;
if (!url) {
  console.error('TARGET_URL manquant.');
  process.exit(1);
}

const response = await get(url, { accept: 'text/html' });
console.log(`URL      : ${url}`);
console.log(`HTTP     : ${response.status}`);
if (!response.ok) process.exit(1);

const html = await response.text();
const details = extractProductDetails(html, url);

const slug = url.split('?')[0].replace(/\/$/, '').split('/').pop() || '';
console.log(`slug     : ${slug}`);
console.log(`titre    : ${details.title}`);
console.log(`pièces   : ${details.marstoyParts}`);
console.log(`prix     : ${details.price} ${details.currency || '(devise non déclarée)'}`);
console.log(`image    : ${details.image}`);

console.log('\n--- extraction de la référence ---');
const fromSlug = extractCodes(slug.replaceAll('-', ' '));
const fromTitle = extractCodes(details.title || '');
console.log(`depuis le slug  : ${JSON.stringify(fromSlug)}`);
console.log(`depuis le titre : ${JSON.stringify(fromTitle)}`);
console.log(`retenue         : ${details.code}`);

// Toutes les références présentes dans la page, avec leur nombre d'occurrences :
// c'est ce qui avait produit de faux appariements quand on prenait la plus
// fréquente. Utile pour voir si le slug est un alias.
const counts = new Map();
for (const match of html.matchAll(/(^|[^A-Za-z0-9])[Mm](\d{3,7})(?!\d)/g)) {
  const code = `M${match[2]}`;
  counts.set(code, (counts.get(code) || 0) + 1);
}
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`toutes les réfs : ${ranked.map(([c, n]) => `${c}×${n}`).join(', ')}`);

console.log('\n--- candidats LEGO par inversion ---');
for (const code of new Set([details.code, ...fromSlug, ...fromTitle].filter(Boolean))) {
  console.log(`${code} -> ${JSON.stringify(candidateSetNumbers(code.slice(1)))}`);
}

// Le titre canonique déclaré par la page : si le slug est un alias, l'URL
// canonique porte le vrai identifiant du produit.
const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
  || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
console.log(`\ncanonique       : ${canonical || '(absente)'}`);
