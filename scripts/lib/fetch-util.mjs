/**
 * Utilitaires réseau pour les scripts de build (exécutés sur un runner GitHub
 * Actions, qui a un accès Internet complet).
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET avec en-têtes de navigateur, réessais et backoff. */
export async function get(url, { retries = 3, accept = '*/*', timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 404 et 403 sont des réponses utiles (la stratégie ne marche pas) :
      // inutile de réessayer.
      if (response.status === 404 || response.status === 403) return response;
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} sur ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
