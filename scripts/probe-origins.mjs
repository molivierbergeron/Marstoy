#!/usr/bin/env node
/**
 * Sonde : par quelle porte le catalogue Marstoy est-il encore lisible ?
 *
 * Depuis le 11 septembre 2026, Cloudflare sert un défi JavaScript
 * (« Just a moment... ») devant www.marstoy.com, et le runner GitHub — une IP
 * de centre de données — ne le passe pas. Le défi est monté devant le domaine
 * personnalisé ; la boutique tourne sur ShopLine, qui publie ses propres
 * adresses. Ce script se contente de constater ce qui répond et ce qui refuse.
 *
 * Aucun contournement : on frappe des adresses publiques avec les en-têtes d'un
 * navigateur ordinaire, une fois chacune, et on note la réponse.
 *
 * Le conteneur de développement n'a pas d'accès sortant vers marstoy.com : ce
 * script n'a de sens que lancé depuis un runner (probe-origins.yml) ou depuis
 * une machine personnelle.
 */

import { get } from './lib/fetch-util.mjs';

// L'identifiant de boutique ShopLine, lu dans les URL d'images de leurs fiches
// (img.myshopline.com/image/store/1752723592316/…).
const STORE_ID = process.env.SHOPLINE_STORE_ID || '1752723592316';

const HOSTS = [
  'https://www.marstoy.com', // témoin : c'est celle qui refuse
  'https://marstoy.com',
  'https://marstoy.myshopline.com',
  `https://${STORE_ID}.myshopline.com`,
];

// robots.txt d'abord : il est presque toujours exempté du défi, et il déclare
// souvent les sitemaps — s'il répond alors que le reste refuse, on sait que le
// filtrage est sélectif et non total.
const PATHS = ['/robots.txt', '/sitemap.xml', '/sitemap_products_1.xml', '/products.json?limit=1'];

const ACCEPT = {
  '/robots.txt': 'text/plain',
  '/sitemap.xml': 'application/xml',
  '/sitemap_products_1.xml': 'application/xml',
  '/products.json?limit=1': 'application/json',
};

/** Ce qu'on a reçu, en une ligne lisible dans le journal du run. */
function describe(body, contentType) {
  const head = body.slice(0, 400).replace(/\s+/g, ' ').trim();
  if (/just a moment|challenges\.cloudflare\.com|cf-browser-verification/i.test(body)) {
    return 'défi Cloudflare';
  }
  if (/^<\?xml|<urlset|<sitemapindex/i.test(head)) return `XML (${head.slice(0, 60)}…)`;
  if (/^[[{]/.test(head)) return `JSON (${head.slice(0, 60)}…)`;
  if (/^user-agent:/i.test(head)) return `robots.txt (${head.slice(0, 90)}…)`;
  return `${contentType || '?'} — ${head.slice(0, 80)}…`;
}

const results = [];
// robots.txt passe là où tout le reste est défié : c'est le seul document que
// la boutique nous laisse lire, et il déclare ses propres sitemaps. On le garde
// en entier pour sonder ensuite exactement les adresses qu'il annonce — suivre
// robots.txt, c'est la manière la plus canonique de lire un site.
const declaredSitemaps = new Set();
let robotsShown = false;

for (const host of HOSTS) {
  for (const path of PATHS) {
    const url = host + path;
    // `retries: 0` : on constate, on n'insiste pas. Une sonde qui s'acharne
    // ressemble à ce qu'on cherche justement à ne pas être.
    try {
      const response = await get(url, { retries: 0, accept: ACCEPT[path] || '*/*' });
      const body = await response.text();

      if (path === '/robots.txt' && response.status === 200) {
        for (const match of body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) declaredSitemaps.add(match[1]);
        if (!robotsShown) {
          console.log(`=== robots.txt intégral (${url}) ===\n`);
          console.log(body.trim());
          console.log();
          robotsShown = true;
        }
      }

      results.push({
        url,
        status: response.status,
        server: response.headers.get('server') || '',
        challenged: /just a moment|challenges\.cloudflare\.com/i.test(body),
        note: describe(body, response.headers.get('content-type')),
      });
    } catch (error) {
      results.push({ url, status: 'erreur', server: '', challenged: false, note: String(error?.message || error).slice(0, 90) });
    }
  }
}

// Les sitemaps que la boutique déclare elle-même. Ils peuvent vivre ailleurs
// que sur les hôtes devinés plus haut — c'est tout l'intérêt de les lire.
const alreadyTried = new Set(HOSTS.flatMap((h) => PATHS.map((p) => h + p)));
if (declaredSitemaps.size) {
  console.log('=== Sitemaps déclarés par robots.txt ===\n');
  for (const url of declaredSitemaps) {
    console.log(`  ${url}${alreadyTried.has(url) ? '  (déjà dans la liste ci-dessous)' : ''}`);
  }
  console.log();
} else {
  console.log('robots.txt ne déclare aucun sitemap.\n');
}

for (const url of declaredSitemaps) {
  if (alreadyTried.has(url)) continue;
  try {
    const response = await get(url, { retries: 0, accept: 'application/xml' });
    const body = await response.text();
    results.push({
      url: `${url}  (déclaré par robots.txt)`,
      status: response.status,
      server: response.headers.get('server') || '',
      challenged: /just a moment|challenges\.cloudflare\.com/i.test(body),
      note: describe(body, response.headers.get('content-type')),
    });
  } catch (error) {
    results.push({ url: `${url}  (déclaré par robots.txt)`, status: 'erreur', server: '', challenged: false, note: String(error?.message || error).slice(0, 90) });
  }
}

console.log('\n=== Ce qui répond, ce qui refuse ===\n');
for (const r of results) {
  const mark = r.status === 200 && !r.challenged ? '✓' : '✗';
  console.log(`${mark} ${String(r.status).padEnd(7)} ${r.url}`);
  console.log(`    ${r.server ? `[${r.server}] ` : ''}${r.note}`);
}

const usable = results.filter((r) => r.status === 200 && !r.challenged && /sitemap|products\.json/.test(r.url));
console.log('\n=== Conclusion ===\n');
if (usable.length) {
  console.log('Portes utilisables pour reconstruire le catalogue :');
  for (const r of usable) console.log(`  ${r.url}`);
  console.log('\nPour les utiliser : MARSTOY_ORIGIN=<hôte> node scripts/build-catalog.mjs');
} else {
  console.log("Aucune porte alternative ne répond. Les adresses publiques de la boutique sont");
  console.log('toutes derrière le défi Cloudflare, ou inexistantes.');
  console.log('Reste : demander un flux à Marstoy, ou lancer la collecte depuis une IP');
  console.log('résidentielle (machine personnelle, runner auto-hébergé).');
}
