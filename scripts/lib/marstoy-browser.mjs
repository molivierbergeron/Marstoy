/**
 * Lire marstoy.com à travers un vrai navigateur.
 *
 * Cloudflare ne juge pas l'adresse IP mais le client : `fetch` de Node est
 * refusé depuis un runner GitHub comme depuis une connexion résidentielle, et
 * un Chrome sans interface l'est aussi. Un Chrome ordinaire, avec fenêtre et
 * profil persistant, franchit le défi — c'est le constat du 14 septembre 2026,
 * fait par scripts/probe-browser.mjs.
 *
 * Ce module en tire un transport : on ouvre la page d'accueil jusqu'à ce que le
 * défi tombe, puis on emprunte le canal HTTP du navigateur, qui porte le cookie
 * obtenu. On ne charge pas les pages dans un onglet — d'une part c'est
 * inutilement lent, d'autre part Chrome enveloppe le XML dans sa visionneuse et
 * on récupérerait ce cadre au lieu du document.
 *
 * L'objet rendu imite `fetch` juste assez pour marstoy.mjs : `ok`, `status`,
 * `headers.get()`, `text()`, `json()`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROFIL_PAR_DEFAUT = path.join(racine, '.profil-navigateur');

const estDefi = (texte) =>
  /just a moment|challenges\.cloudflare\.com|cf-browser-verification/i.test(texte);

/**
 * Ouvre un navigateur, franchit le défi, et rend un `get` utilisable par
 * `discoverCatalog`. Toujours refermer avec `close()`.
 *
 * @param {{ origin?: string, profilDir?: string, log?: Function }} options
 */
export async function ouvrirTransport({
  origin = process.env.MARSTOY_ORIGIN || 'https://www.marstoy.com',
  profilDir = process.env.MARSTOY_PROFIL || PROFIL_PAR_DEFAUT,
  log = () => {},
} = {}) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      "Playwright n'est pas installé — sans lui, marstoy.com est illisible.\n" +
        'Depuis le dépôt : npm install --no-save playwright && npx playwright install chromium',
    );
  }

  const commun = {
    headless: false,
    viewport: { width: 1280, height: 820 },
    locale: 'en-US',
    timezoneId: 'America/Toronto',
  };

  // Le Chrome du système d'abord : c'est lui qui a franchi le défi à l'essai.
  let contexte;
  try {
    contexte = await chromium.launchPersistentContext(profilDir, { ...commun, channel: 'chrome' });
    log('navigateur : Google Chrome du système');
  } catch {
    contexte = await chromium.launchPersistentContext(profilDir, commun);
    log('navigateur : Chromium de Playwright (Chrome introuvable)');
  }

  const page = contexte.pages()[0] ?? (await contexte.newPage());

  // --- Franchir le défi une fois, sur l'accueil ---------------------------
  //
  // Le cookie obtenu vaut ensuite pour toutes les requêtes du contexte, y
  // compris celles du canal HTTP.
  let franchi = false;
  try {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let essai = 0; essai < 20; essai += 1) {
      if (!estDefi(await page.content())) {
        franchi = true;
        break;
      }
      await page.waitForTimeout(3000);
    }
  } catch (error) {
    await contexte.close();
    throw new Error(`Impossible d'ouvrir ${origin} : ${error?.message || error}`);
  }

  if (!franchi) {
    await contexte.close();
    throw new Error(
      `Le défi Cloudflare de ${origin} n'est pas tombé après 60 s.\n` +
        'Relance scripts/try-browser.sh pour voir où ça bloque.',
    );
  }
  log('défi Cloudflare franchi');

  /**
   * Même signature que le `get` de fetch-util, mais la requête part **de la
   * page elle-même**.
   *
   * Le premier essai passait par `contexte.request` : il partage bien les
   * cookies du navigateur, mais pas sa pile réseau — c'est un client HTTP Node
   * déguisé. Résultat observé le 14 septembre 2026 : le défi était franchi sur
   * l'accueil, et malgré cela chaque requête repartait en 403. Le cookie seul
   * ne suffit pas, c'est l'empreinte du client qui est jugée.
   *
   * Un `fetch` exécuté dans la page emprunte au contraire la vraie pile de
   * Chrome, avec son empreinte TLS et ses cookies. Et comme il rend le corps
   * brut, il règle du même coup l'enveloppe de la visionneuse XML.
   */
  async function get(url, { accept = '*/*', timeoutMs = 45000, referer = null } = {}) {
    const resultat = await page.evaluate(
      async ({ url, accept, referer, timeoutMs }) => {
        const arret = AbortSignal.timeout(timeoutMs);
        const entetes = { Accept: accept };
        if (referer) entetes.Referer = referer;
        try {
          const reponse = await fetch(url, {
            headers: entetes,
            credentials: 'include',
            redirect: 'follow',
            signal: arret,
          });
          return {
            status: reponse.status,
            ok: reponse.ok,
            entetes: Object.fromEntries(reponse.headers.entries()),
            corps: await reponse.text(),
          };
        } catch (error) {
          return { erreur: String(error?.message || error) };
        }
      },
      { url, accept, referer, timeoutMs },
    );

    if (resultat.erreur) throw new Error(`${url} : ${resultat.erreur}`);

    return {
      ok: resultat.ok,
      status: resultat.status,
      headers: { get: (nom) => resultat.entetes[String(nom).toLowerCase()] ?? null },
      text: async () => resultat.corps,
      json: async () => JSON.parse(resultat.corps),
    };
  }

  return { get, close: () => contexte.close() };
}
