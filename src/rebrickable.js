/**
 * Petit client Rebrickable. La clé API ne sort jamais du Worker : elle est
 * stockée comme secret Cloudflare et n'apparaît dans aucune réponse.
 */

const API_BASE = 'https://rebrickable.com/api/v3/lego';

export class RebrickableError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RebrickableError';
    this.status = status;
  }
}

async function apiGet(path, apiKey) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `key ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'marstoy-real/1.0',
    },
  });

  if (response.status === 404) return null;
  if (response.status === 429) {
    throw new RebrickableError('Rebrickable : quota atteint (429)', 429);
  }
  if (!response.ok) {
    throw new RebrickableError(`Rebrickable : HTTP ${response.status}`, response.status);
  }
  return response.json();
}

/** Set exact, `10276` étant traité comme `10276-1`. */
export async function getSet(number, apiKey) {
  const setNum = /-\d+$/.test(number) ? number : `${number}-1`;
  const set = await apiGet(`/sets/${encodeURIComponent(setNum)}/`, apiKey);
  return set ? normalizeSet(set) : null;
}

/** Recherche plein texte, pour les sets dont l'édition n'est pas `-1`. */
export async function searchSet(number, apiKey) {
  if (!number) return null;
  const search = await apiGet(`/sets/?search=${encodeURIComponent(number)}&page_size=20`, apiKey);
  const match = search?.results?.find((set) => String(set.set_num).split('-')[0] === number);
  return match ? normalizeSet(match) : null;
}

/**
 * Entre plusieurs sets existants pour une même référence Marstoy, garde le plus
 * récent (Marstoy clone des sets modernes), puis le plus gros.
 */
export function pickBestSet(sets) {
  return [...sets].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.numParts ?? 0) - (a.numParts ?? 0))[0];
}

function normalizeSet(set) {
  return {
    setNum: set.set_num,
    num: String(set.set_num).split('-')[0],
    name: set.name,
    year: set.year ?? null,
    numParts: set.num_parts ?? null,
    themeId: set.theme_id ?? null,
    imgUrl: set.set_img_url || null,
    setUrl: set.set_url || `https://rebrickable.com/sets/${set.set_num}/`,
  };
}
