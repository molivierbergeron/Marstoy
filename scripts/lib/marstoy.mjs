/**
 * Découverte du catalogue Marstoy. La structure du site n'est pas connue à
 * l'avance, donc on essaie plusieurs stratégies et on consigne laquelle a
 * fonctionné (`data/recon.json`) pour pouvoir affiner ensuite.
 */

import { get, mapLimit, sleep } from './fetch-util.mjs';
import { extractCodes } from '../../src/setnum.js';

const ORIGIN = process.env.MARSTOY_ORIGIN || 'https://www.marstoy.com';

/** Produit normalisé, quelle que soit la stratégie. */
const product = ({ code, title, url, image, price, marstoyParts, source }) => ({
  code,
  title: title?.trim() || null,
  url: url || null,
  image: image || null,
  price: price ?? null,
  // Nombre de pièces annoncé par Marstoy : sert à vérifier la correspondance.
  marstoyParts: marstoyParts ?? null,
  source,
});

/**
 * Stratégie 1 — `products.json` (Shopify). La plus riche : titres, images,
 * prix, handles, en une poignée de requêtes.
 */
async function fromShopifyJson(recon) {
  const products = [];
  for (let page = 1; page <= 40; page += 1) {
    const url = `${ORIGIN}/products.json?limit=250&page=${page}`;
    const response = await get(url, { accept: 'application/json' });
    if (!response.ok) {
      recon.attempts.push({ strategy: 'products.json', page, status: response.status });
      break;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      recon.attempts.push({ strategy: 'products.json', page, status: 'réponse non JSON' });
      break;
    }

    const batch = payload?.products;
    if (!Array.isArray(batch) || batch.length === 0) break;
    if (page === 1) recon.samples.shopifyProduct = batch[0];

    for (const item of batch) {
      const haystack = `${item.title || ''} ${item.handle || ''} ${item.sku || ''}`;
      const code = extractCodes(haystack)[0];
      if (!code) continue;
      products.push(
        product({
          code,
          title: item.title,
          url: `${ORIGIN}/products/${item.handle}`,
          image: item.images?.[0]?.src || null,
          price: item.variants?.[0]?.price ?? null,
          source: 'products.json',
        }),
      );
    }

    recon.attempts.push({ strategy: 'products.json', page, status: 200, received: batch.length });
    if (batch.length < 250) break;
    await sleep(400);
  }
  return products;
}

const decodeEntities = (value) =>
  String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');

const metaContent = (html, key) =>
  decodeEntities(
    html.match(
      new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`, 'i'),
    )?.[1] || '',
  ) || null;

/**
 * Le catalogue Marstoy contient deux familles :
 *
 *  - les clones de sets LEGO officiels, dont l'URL est de la forme
 *    `moc-m70334-parts-kit` et le titre « MOC M70334 Parts Kit » ;
 *  - les MOC maison de Marstoy (« Moc The JEEP », « The Rack Railway »), dont
 *    les codes `M03xxx` sont une numérotation interne : aucun set LEGO ne leur
 *    correspond et les inverser produit n'importe quoi.
 *
 * On n'accepte donc une référence que si elle est attachée au produit lui-même —
 * URL ou titre. Balayer tout le HTML attraperait les codes des produits
 * suggérés en bas de page et fabriquerait de fausses correspondances.
 */
export function extractProductDetails(html, url) {
  const rawTitle = metaContent(html, 'og:title') ||
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '') || null;

  const description = metaContent(html, 'og:description') || metaContent(html, 'description') || '';
  const partsMatch = description.match(/(?:Pcs|Pieces|pcs)\s*[:：]?\s*(?:about\s*)?([\d\s,]{2,9})\s*(?:pcs|pieces)?/i);
  const price =
    metaContent(html, 'product:price:amount') ||
    metaContent(html, 'og:price:amount') ||
    html.match(/"price"\s*:\s*"?([\d.]+)"?/)?.[1] ||
    null;

  const title = rawTitle ? rawTitle.replace(/\s*-\s*marstoy\s*$/i, '').trim() : null;
  // Uniquement ce qui appartient au produit : le slug de son URL, puis son titre.
  const slug = url.split('?')[0].replace(/\/$/, '').split('/').pop() || '';
  const code = extractCodes(slug.replaceAll('-', ' '))[0] || extractCodes(title || '')[0] || null;

  return {
    code,
    // « The Rack Railway-marstoy » -> « The Rack Railway »
    title,
    image: metaContent(html, 'og:image') || metaContent(html, 'og:image:secure_url'),
    marstoyParts: partsMatch ? Number(partsMatch[1].replace(/[\s,]/g, '')) || null : null,
    price,
  };
}

/**
 * Stratégie 2 — sitemap produits, puis fiche de chaque produit. Plus lente mais
 * quasi universelle (et le sitemap est fait pour être lu par des robots).
 */
async function fromSitemap(recon) {
  const roots = [`${ORIGIN}/sitemap.xml`, `${ORIGIN}/sitemap_index.xml`];
  const productSitemaps = [];

  for (const root of roots) {
    const response = await get(root, { accept: 'application/xml' });
    recon.attempts.push({ strategy: 'sitemap', url: root, status: response.status });
    if (!response.ok) continue;
    const xml = await response.text();
    if (!recon.samples.sitemap) recon.samples.sitemap = xml.slice(0, 1500);
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
    for (const loc of locs) {
      if (/sitemap.*product|product.*sitemap/i.test(loc)) productSitemaps.push(loc);
    }
    if (locs.some((loc) => loc.includes('/products/'))) productSitemaps.push(root);
    if (productSitemaps.length) break;
  }

  const urls = new Set();
  for (const sitemap of [...new Set(productSitemaps)].slice(0, 20)) {
    const response = await get(sitemap, { accept: 'application/xml' });
    if (!response.ok) continue;
    const xml = await response.text();
    for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      if (match[1].includes('/products/')) urls.add(match[1]);
    }
    await sleep(300);
  }
  recon.counts.sitemapProductUrls = urls.size;
  if (!urls.size) return [];

  recon.counts.sitemapCodesFromUrl = [...urls].filter(
    (url) => extractCodes(url.split('/').pop().replaceAll('-', ' ')).length,
  ).length;

  // On charge chaque fiche : c'est le seul endroit où se trouvent le titre, la
  // photo, le prix, et — pour la majorité du catalogue — la référence elle-même.
  const limit = Number(process.env.MARSTOY_PAGE_LIMIT || 0);
  const targets = limit > 0 ? [...urls].slice(0, limit) : [...urls];
  recon.counts.pagesFetched = targets.length;

  const httpErrors = new Map();
  const withoutCode = [];

  const fetched = await mapLimit(targets, 4, async (url) => {
    try {
      const response = await get(url, { accept: 'text/html' });
      if (!response.ok) {
        httpErrors.set(response.status, (httpErrors.get(response.status) || 0) + 1);
        return null;
      }
      const html = await response.text();
      const details = extractProductDetails(html, url);

      // Deux pages entières en échantillon : une qui a livré une référence et
      // une qui n'en a pas, pour pouvoir affiner sans deviner.
      if (details.code && !recon.samples.productPageWithCode) {
        recon.samples.productPageWithCode = html.slice(0, 12000);
      }
      if (!details.code && !recon.samples.productPageWithoutCode) {
        recon.samples.productPageWithoutCode = html.slice(0, 12000);
      }

      if (!details.code) {
        if (withoutCode.length < 60) withoutCode.push({ url, title: details.title, parts: details.marstoyParts });
        return null;
      }
      return product({ ...details, url, source: 'sitemap-page' });
    } catch (error) {
      httpErrors.set(String(error?.message || error).slice(0, 60), 1);
      return null;
    }
  });

  recon.counts.pagesWithoutCode = withoutCode.length;
  recon.httpErrors = Object.fromEntries(httpErrors);
  recon.samples.urlsWithoutCode = withoutCode.slice(0, 25);

  return fetched.filter(Boolean);
}

/** Stratégie 3 — pages collection en HTML, dernier recours. */
async function fromCollections(recon) {
  const products = [];
  for (let page = 1; page <= 30; page += 1) {
    const url = `${ORIGIN}/collections/all?page=${page}`;
    const response = await get(url, { accept: 'text/html' });
    recon.attempts.push({ strategy: 'collections', page, status: response.status });
    if (!response.ok) break;
    const html = await response.text();
    if (page === 1 && !recon.samples.collectionPage) recon.samples.collectionPage = html.slice(0, 6000);

    const links = [...html.matchAll(/href="([^"]*\/products\/[^"?#]+)/g)].map((match) => match[1]);
    const codes = new Set();
    for (const href of links) {
      const code = extractCodes(href.split('/').pop().replaceAll('-', ' '))[0];
      if (code && !codes.has(code)) {
        codes.add(code);
        products.push(
          product({ code, url: href.startsWith('http') ? href : ORIGIN + href, source: 'collections' }),
        );
      }
    }
    if (!codes.size) break;
    await sleep(500);
  }
  return products;
}

/** Lance les stratégies dans l'ordre et garde la première qui donne du volume. */
export async function discoverCatalog() {
  const recon = {
    origin: ORIGIN,
    startedAt: new Date().toISOString(),
    attempts: [],
    counts: {},
    samples: {},
    strategyUsed: null,
    error: null,
  };

  const strategies = [
    ['products.json', fromShopifyJson],
    ['sitemap', fromSitemap],
    ['collections', fromCollections],
  ];

  let products = [];
  for (const [name, run] of strategies) {
    try {
      const found = await run(recon);
      recon.counts[name] = found.length;
      if (found.length > products.length) {
        products = found;
        recon.strategyUsed = name;
      }
      // Un catalogue conséquent : pas besoin d'insister avec les suivantes.
      if (products.length >= 200) break;
    } catch (error) {
      recon.attempts.push({ strategy: name, error: String(error?.message || error) });
    }
  }

  // Dédoublonnage : on garde l'entrée la plus complète par référence.
  const byCode = new Map();
  for (const item of products) {
    const existing = byCode.get(item.code);
    const score = (entry) => (entry.title ? 2 : 0) + (entry.image ? 1 : 0);
    if (!existing || score(item) > score(existing)) byCode.set(item.code, item);
  }

  recon.counts.unique = byCode.size;
  recon.finishedAt = new Date().toISOString();
  return { products: [...byCode.values()], recon };
}
