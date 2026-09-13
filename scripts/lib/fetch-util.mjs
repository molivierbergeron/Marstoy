/**
 * Utilitaires réseau pour les scripts de build (exécutés sur un runner GitHub
 * Actions, qui a un accès Internet complet).
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Un mur anti-robot ne regarde pas que l'User-Agent : il compare l'ensemble des
 * en-têtes à ce qu'enverrait un vrai navigateur, et un Chrome annoncé qui
 * n'envoie ni `Sec-Fetch-*` ni `sec-ch-ua` se trahit tout seul. Ce sont ici les
 * en-têtes d'un Chrome sur macOS ouvrant une page depuis la barre d'adresse.
 *
 * `Accept-Encoding` est volontairement absent : undici le pose lui-même et
 * décompresse la réponse ; le fixer à la main risque de livrer du binaire.
 */
const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Budget de patience face aux 403. Un 403 isolé est parfois un contrôle
// ponctuel qu'une seconde tentative passe ; un 403 en série est un mur, et
// insister coûterait des heures de runner pour le même refus. On retente donc
// les premiers, puis plus aucun pour le reste du run.
const FORBIDDEN_RETRY_BUDGET = 3;
let forbiddenSeen = 0;

/** Nombre de 403 essuyés depuis le début du run — consigné dans le rapport. */
export const forbiddenCount = () => forbiddenSeen;

/** Remet le compteur à zéro (tests). */
export const resetForbiddenCount = () => {
  forbiddenSeen = 0;
};

/** GET avec en-têtes de navigateur, réessais et backoff. */
export async function get(
  url,
  {
    retries = 3,
    accept = '*/*',
    timeoutMs = 30000,
    referer = null,
    // Réglable par l'environnement : les tests n'ont aucune raison d'attendre
    // cinq secondes pour vérifier une règle de patience.
    forbiddenPauseMs = Number(process.env.MARSTOY_FORBIDDEN_PAUSE_MS ?? 5000),
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const headers = { ...BROWSER_HEADERS, Accept: accept };
      // Une fiche produit atteinte depuis la boutique, pas surgie de nulle part.
      if (referer) {
        headers.Referer = referer;
        headers['Sec-Fetch-Site'] = 'same-origin';
      }

      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 403) {
        forbiddenSeen += 1;
        if (attempt === 0 && attempt < retries && forbiddenSeen <= FORBIDDEN_RETRY_BUDGET) {
          // Pause plus longue que le backoff ordinaire : c'est le débit qui est
          // en cause, pas un aléa réseau.
          await sleep(forbiddenPauseMs);
          continue;
        }
        return response;
      }
      // 404 est une réponse utile (la stratégie ne marche pas) : pas de réessai.
      if (response.status === 404) return response;
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} sur ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  // `retries: 0` sur une réponse qu'on ne rend pas telle quelle laisserait
  // `lastError` vide : lever `undefined` masquerait la cause.
  throw lastError || new Error(`Aucune réponse exploitable sur ${url}`);
}

/** Limiteur de concurrence : garde le scraping poli. */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
