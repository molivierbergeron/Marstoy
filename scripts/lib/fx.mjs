/**
 * Conversion des prix vers le dollar canadien.
 *
 * Source : api.frankfurter.app (taux de référence de la BCE, gratuit, sans clé).
 * La conversion a lieu à la construction : le site n'appelle aucune API.
 *
 * Le montant obtenu reste indicatif — Marstoy facture dans sa propre devise et
 * applique son propre taux, auxquels s'ajoutent frais de carte et livraison.
 */

import { get } from './fetch-util.mjs';

const FRANKFURTER = 'https://api.frankfurter.app/latest';

/** Taux `devise -> CAD`. Renvoie null si la conversion est impossible. */
export async function fetchCadRate(fromCurrency, { fetchJson } = {}) {
  const from = String(fromCurrency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(from)) return null;
  if (from === 'CAD') return { rate: 1, date: new Date().toISOString().slice(0, 10), source: 'identité' };

  const load =
    fetchJson ||
    (async (url) => {
      const response = await get(url, { accept: 'application/json' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });

  try {
    const data = await load(`${FRANKFURTER}?from=${from}&to=CAD`);
    const rate = data?.rates?.CAD;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
    return { rate, date: data.date || null, source: 'frankfurter.app (BCE)' };
  } catch {
    return null;
  }
}

/** Applique un taux à un prix textuel. Renvoie null si le prix est inexploitable. */
export function toCad(price, rate) {
  if (rate == null) return null;
  const amount = Number.parseFloat(String(price ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * rate * 100) / 100;
}
