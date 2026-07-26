/**
 * Prix de détail LEGO, pour chiffrer l'écart avec Marstoy.
 *
 * Rebrickable ne publie pas de prix : on interroge lego.com, en canadien, et on
 * met le résultat en cache dans le dépôt (`data/lego-prices.json`) pour ne
 * rechercher chaque semaine que les sets nouveaux ou périmés.
 *
 * Beaucoup de sets sont retirés du catalogue LEGO : l'absence de prix est un
 * résultat normal, pas une erreur. On la mémorise aussi pour ne pas la
 * redemander à chaque passage.
 */

import { get, mapLimit, sleep } from './fetch-util.mjs';

const LOCALE = process.env.LEGO_LOCALE || 'en-ca';
const FOUND_TTL_DAYS = 30;
const MISSING_TTL_DAYS = 14;

const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

/** Extrait un prix canadien d'une fiche produit lego.com. */
export function parseLegoPrice(html) {
  if (!html) return null;

  // Les données de la page sont sérialisées en JSON ; plusieurs formes existent
  // selon les versions du site, on les essaie toutes.
  const candidates = [
    html.match(/"formattedAmount"\s*:\s*"([^"]+)"/)?.[1],
    html.match(/"centAmount"\s*:\s*(\d+)/)?.[1],
    html.match(/"price"\s*:\s*\{[^}]*"amount"\s*:\s*([\d.]+)/)?.[1],
    html.match(/<meta[^>]+itemprop="price"[^>]+content="([\d.]+)"/i)?.[1],
    html.match(/"price"\s*:\s*"?([\d.]+)"?\s*,\s*"priceCurrency"\s*:\s*"CAD"/)?.[1],
  ];

  const currency =
    html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/)?.[1] ||
    html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] ||
    null;
  if (currency && currency !== 'CAD') return null;

  for (const [index, raw] of candidates.entries()) {
    if (raw == null) continue;
    // `centAmount` est en cents ; les autres formes sont déjà en dollars.
    const cleaned = String(raw).replace(/[^\d.]/g, '');
    if (!cleaned) continue;
    const value = index === 1 ? Number(cleaned) / 100 : Number(cleaned);
    if (Number.isFinite(value) && value > 0 && value < 100000) return Math.round(value * 100) / 100;
  }
  return null;
}

async function fetchOne(num, recon) {
  const url = `https://www.lego.com/${LOCALE}/product/${encodeURIComponent(num)}`;
  try {
    const response = await get(url, { accept: 'text/html', retries: 1 });
    if (!response.ok) {
      recon.legoStatus[response.status] = (recon.legoStatus[response.status] || 0) + 1;
      return null;
    }
    const html = await response.text();
    const price = parseLegoPrice(html);
    if (price == null && !recon.samples.legoProductPage) {
      // Une page chargée sans prix lisible : garder de quoi ajuster l'analyse.
      recon.samples.legoProductPage = html.slice(0, 6000);
    }
    recon.legoStatus[price == null ? 'sans prix' : 'ok'] =
      (recon.legoStatus[price == null ? 'sans prix' : 'ok'] || 0) + 1;
    return price;
  } catch (error) {
    recon.legoStatus.erreur = (recon.legoStatus.erreur || 0) + 1;
    return null;
  }
}

/**
 * Complète le cache pour les numéros demandés et le renvoie.
 * `cache` : `{ "10276": { price: 549.99, fetchedAt: "..." } }`, price null si absent.
 */
export async function loadLegoPrices(numbers, cache, recon) {
  recon.legoStatus = {};
  const updated = { ...cache };

  const stale = [...new Set(numbers)].filter((num) => {
    const entry = updated[num];
    if (!entry) return true;
    const ttl = entry.price == null ? MISSING_TTL_DAYS : FOUND_TTL_DAYS;
    return daysSince(entry.fetchedAt) > ttl;
  });

  recon.counts.legoPricesCached = Object.keys(cache).length;
  recon.counts.legoPricesFetched = stale.length;
  if (!stale.length) return updated;

  await mapLimit(stale, 3, async (num) => {
    const price = await fetchOne(num, recon);
    updated[num] = { price, fetchedAt: new Date().toISOString() };
    await sleep(200);
  });

  return updated;
}
