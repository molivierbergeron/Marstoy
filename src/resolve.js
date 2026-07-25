/**
 * Résolution référence Marstoy -> set LEGO réel (nom + image officielle),
 * avec cache et limitation de concurrence pour rester dans le quota Rebrickable.
 */

// Attribut d'import explicite : le module doit rester chargeable par Node
// (script de diagnostic) autant que par esbuild/wrangler.
import overrides from '../overrides.json' with { type: 'json' };
import { candidateGroups, candidateSetNumbers, codeDigits } from './setnum.js';
import { getSet, pickBestSet, searchSet } from './rebrickable.js';
import { cacheGet, cacheSet } from './store.js';

const CACHE_VERSION = 'v1';
const TTL_FOUND = 60 * 24 * 3600; // 60 jours : un set LEGO ne change plus
const TTL_MISSING = 3 * 24 * 3600; // 3 jours : laisse une chance à un correctif
const MAX_CONCURRENCY = 2; // Rebrickable throttle agressivement les clés gratuites
const MAX_CODES_PER_REQUEST = 60;

const cacheKey = (code) => `${CACHE_VERSION}:code:${code}`;

/** Résout un lot de références. Renvoie une Map code -> résolution. */
export async function resolveCodes(codes, env) {
  const unique = [...new Set(codes)].slice(0, MAX_CODES_PER_REQUEST);
  const results = new Map();
  const missing = [];

  await Promise.all(
    unique.map(async (code) => {
      const cached = await cacheGet(cacheKey(code), env);
      if (cached) results.set(code, cached);
      else missing.push(code);
    }),
  );

  if (!missing.length) return results;
  if (!env.REBRICKABLE_API_KEY) {
    for (const code of missing) {
      results.set(code, { ok: false, code, reason: 'clé Rebrickable absente' });
    }
    return results;
  }

  const queue = [...missing];
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const code = queue.shift();
      const resolution = await resolveOne(code, env);
      results.set(code, resolution);
      // Les erreurs transitoires (quota, réseau) ne doivent pas être figées.
      if (resolution.cacheable !== false) {
        await cacheSet(cacheKey(code), resolution, resolution.ok ? TTL_FOUND : TTL_MISSING, env);
      }
    }
  });
  await Promise.all(workers);

  return results;
}

const resolveOne = (code, env) => resolveUncached(code, env.REBRICKABLE_API_KEY);

/**
 * Résolution d'une référence sans cache ni binding Worker, donc utilisable
 * aussi depuis Node (voir `scripts/check.mjs`).
 */
export async function resolveUncached(code, apiKey) {
  const override = Object.prototype.hasOwnProperty.call(overrides, code) ? overrides[code] : undefined;
  if (override === null) {
    return { ok: false, code, reason: 'ignoré via overrides.json' };
  }

  const digits = codeDigits(code);

  if (override) {
    const forced = typeof override === 'string' ? override : override.num;
    try {
      const set = await getSet(forced, apiKey);
      if (set) return { ok: true, code, ...set };
      return { ok: false, code, reason: `override ${forced} inconnu chez Rebrickable` };
    } catch (error) {
      return { ok: false, code, reason: error?.message || 'erreur Rebrickable', cacheable: false };
    }
  }

  const groups = candidateGroups(digits);

  try {
    for (const group of groups) {
      const hits = [];
      for (const candidate of group) {
        const set = await getSet(candidate, apiKey);
        if (set) hits.push(set);
      }
      // Plusieurs candidats du même groupe peuvent exister (zéros de fin) :
      // on tranche sur l'année plutôt que sur l'ordre d'essai.
      if (hits.length) return { ok: true, code, ...pickBestSet(hits) };
    }

    const searched = await searchSet(groups[0]?.[0], apiKey);
    if (searched) return { ok: true, code, ...searched };

    return { ok: false, code, reason: 'aucun set LEGO correspondant', tried: candidateSetNumbers(digits) };
  } catch (error) {
    return {
      ok: false,
      code,
      reason: error?.message || 'erreur Rebrickable',
      cacheable: false,
    };
  }
}
