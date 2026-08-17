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

// Marstoy renvoie des 403 sporadiques (8 sur 2931 au dernier build). `get()`
// ne réessaie pas sur 403, ce qui convient à un balayage complet mais pas à un
// diagnostic ponctuel : ici, un seul refus fait tout échouer.
let response;
for (let attempt = 1; attempt <= 6; attempt += 1) {
  response = await get(url, { accept: 'text/html' });
  if (response.status !== 403) break;
  console.log(`tentative ${attempt} : 403, nouvel essai…`);
  await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
}

console.log(`URL demandée : ${url}`);
console.log(`HTTP         : ${response.status}`);
// Le point décisif : `get()` suit les redirections, mais le build extrait la
// référence du slug DEMANDÉ, pas de celui-ci.
console.log(`URL finale   : ${response.url}`);
console.log(`redirigée    : ${response.redirected}`);
if (!response.ok) process.exit(1);

const html = await response.text();
const details = extractProductDetails(html, url);

const slug = url.split('?')[0].replace(/\/$/, '').split('/').pop() || '';
const finalSlug = response.url.split('?')[0].replace(/\/$/, '').split('/').pop() || '';
console.log(`slug     : ${slug}`);
console.log(`titre    : ${details.title}`);
console.log(`pièces   : ${details.marstoyParts}`);
console.log(`prix     : ${details.price} ${details.currency || '(devise non déclarée)'}`);
console.log(`image    : ${details.image}`);

console.log('\n--- extraction de la référence ---');
const fromSlug = extractCodes(slug.replaceAll('-', ' '));
const fromFinalSlug = extractCodes(finalSlug.replaceAll('-', ' '));
const fromTitle = extractCodes(details.title || '');
console.log(`slug demandé    : ${slug} -> ${JSON.stringify(fromSlug)}`);
console.log(`slug final      : ${finalSlug} -> ${JSON.stringify(fromFinalSlug)}`);
console.log(`depuis le titre : ${JSON.stringify(fromTitle)}`);
console.log(`retenue (build) : ${details.code}`);

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
for (const code of new Set([details.code, ...fromSlug, ...fromFinalSlug, ...fromTitle].filter(Boolean))) {
  console.log(`${code} -> ${JSON.stringify(candidateSetNumbers(code.slice(1)))}`);
}

// Le titre canonique déclaré par la page : si le slug est un alias, l'URL
// canonique porte le vrai identifiant du produit.
const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
  || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
console.log(`\ncanonique       : ${canonical || '(absente)'}`);
