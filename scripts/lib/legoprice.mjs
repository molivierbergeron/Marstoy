/**
 * Prix de détail LEGO, pour chiffrer l'écart avec Marstoy.
 *
 * Source : l'API Brickset (clé gratuite, secret `BRICKSET_API_KEY`). Elle donne
 * le prix canadien directement — aucune conversion pour cette ligne — et garde
 * le prix d'origine des sets retirés, ce qui est justement ce qu'on compare.
 *
 * lego.com a d'abord été essayé : 403 sur les 302 requêtes, leur protection
 * anti-robot ne laisse pas passer un client HTTP simple.
 *
 * On interroge par année en lots de 500 plutôt qu'un set à la fois : une
 * quarantaine de requêtes au lieu de trois cents. Le résultat est mis en cache
 * dans le dépôt pour que les passages suivants ne redemandent que le nouveau.
 */

import { get, sleep } from './fetch-util.mjs';

const API = 'https://brickset.com/api/v3.asmx/getSets';
const PAGE_SIZE = 500;
const FOUND_TTL_DAYS = 90; // un prix de détail ne bouge plus une fois le set sorti
const MISSING_TTL_DAYS = 30;

const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

/** Prix canadien d'un set Brickset, avec repli sur l'américain converti. */
export function priceFromBricksetSet(set, usdToCad) {
  const shops = set?.LEGOCom || {};
  const canadian = Number(shops.CA?.retailPrice);
  if (Number.isFinite(canadian) && canadian > 0) {
    return { price: Math.round(canadian * 100) / 100, currency: 'CAD' };
  }
  const american = Number(shops.US?.retailPrice);
  if (Number.isFinite(american) && american > 0 && usdToCad) {
    return { price: Math.round(american * usdToCad * 100) / 100, currency: 'USD→CAD' };
  }
  return null;
}

async function fetchYear(year, apiKey, recon) {
  const sets = [];
  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const params = encodeURIComponent(JSON.stringify({ year: String(year), pageSize: PAGE_SIZE, pageNumber }));
    const url = `${API}?apiKey=${encodeURIComponent(apiKey)}&userHash=&params=${params}`;

    let payload;
    try {
      const response = await get(url, { accept: 'application/json', retries: 1 });
      if (!response.ok) {
        recon.bricksetStatus[response.status] = (recon.bricksetStatus[response.status] || 0) + 1;
        break;
      }
      payload = await response.json();
    } catch (error) {
      recon.bricksetStatus.erreur = (recon.bricksetStatus.erreur || 0) + 1;
      break;
    }

    if (payload?.status !== 'success') {
      // `invalidApiKey`, `invalidParams`… : à consigner tel quel, c'est parlant.
      recon.bricksetStatus[payload?.status || 'réponse inattendue'] =
        (recon.bricksetStatus[payload?.status || 'réponse inattendue'] || 0) + 1;
      recon.bricksetMessage = payload?.message || null;
      break;
    }

    const batch = payload.sets || [];
    sets.push(...batch);
    recon.bricksetStatus.ok = (recon.bricksetStatus.ok || 0) + 1;
    if (batch.length < PAGE_SIZE) break;
    await sleep(300);
  }
  return sets;
}

/**
 * Complète le cache des prix pour les produits donnés (`{ num, year }`).
 * Renvoie `{ "10276": { price, currency, fetchedAt } }`, `price` null quand
 * Brickset ne connaît pas de prix pour ce set.
 */
export async function loadLegoPrices(items, cache, recon, { apiKey, usdToCad } = {}) {
  recon.bricksetStatus = {};
  const updated = { ...cache };

  if (!apiKey) {
    recon.bricksetStatus['clé absente'] = 1;
    recon.counts.legoPricesCached = Object.keys(cache).length;
    recon.counts.legoPricesFetched = 0;
    return updated;
  }

  const stale = items.filter(({ num }) => {
    const entry = updated[num];
    if (!entry) return true;
    const ttl = entry.price == null ? MISSING_TTL_DAYS : FOUND_TTL_DAYS;
    return daysSince(entry.fetchedAt) > ttl;
  });

  recon.counts.legoPricesCached = Object.keys(cache).length;
  recon.counts.legoPricesFetched = stale.length;
  if (!stale.length) return updated;

  // Une requête par année couvre d'un coup tous les sets de cette année-là.
  const years = [...new Set(stale.map(({ year }) => year).filter(Boolean))].sort();
  const wanted = new Set(stale.map(({ num }) => String(num)));
  const found = new Map();

  for (const year of years) {
    for (const set of await fetchYear(year, apiKey, recon)) {
      const number = String(set.number);
      if (!wanted.has(number) || found.has(number)) continue;
      const price = priceFromBricksetSet(set, usdToCad);
      if (price) found.set(number, price);
    }
    await sleep(300);
  }

  const now = new Date().toISOString();
  for (const { num } of stale) {
    const hit = found.get(String(num));
    updated[num] = { price: hit?.price ?? null, currency: hit?.currency ?? null, fetchedAt: now };
  }

  recon.counts.legoPricesResolved = found.size;
  return updated;
}
