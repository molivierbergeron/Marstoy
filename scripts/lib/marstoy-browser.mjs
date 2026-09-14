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

/** Adapte une réponse Playwright à ce que marstoy.mjs attend de `fetch`. */
function adapter(reponse) {
  const entetes = reponse.headers();
  return {
    ok: reponse.ok(),
    status: reponse.status(),
    headers: { get: (nom) => entetes[String(nom).toLowerCase()] ?? null },
    text: () => reponse.text(),
    json: () => reponse.json(),
  };
}

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

  /** Même signature que le `get` de fetch-util, en passant par le navigateur. */
  async function get(url, { accept = '*/*', timeoutMs = 45000, referer = null } = {}) {
    const entetes = { Accept: accept };
    if (referer) entetes.Referer = referer;
    const reponse = await contexte.request.get(url, {
      headers: entetes,
      timeout: timeoutMs,
      // On veut lire le refus, pas lever dessus : marstoy.mjs le consigne.
      failOnStatusCode: false,
    });
    return adapter(reponse);
  }

  return { get, close: () => contexte.close() };
}
