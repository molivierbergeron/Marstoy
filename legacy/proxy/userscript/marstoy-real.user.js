// ==UserScript==
// @name         Marstoy → vrais sets LEGO
// @namespace    marstoy-real
// @version      1.0.0
// @description  Affiche les vrais noms et visuels LEGO sur marstoy.com, en passant par ton Worker (la clé Rebrickable reste côté serveur).
// @match        *://*.marstoy.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Alternative au proxy : tu navigues sur le vrai marstoy.com et seul l'affichage
 * est corrigé. À utiliser avec l'app « Userscripts » (gratuite, App Store) dans
 * les extensions Safari de l'iPhone.
 *
 * 1. Remplace WORKER_URL ci-dessous par l'URL de ton Worker.
 * 2. Si tu as défini ACCESS_TOKEN, remplace aussi ACCESS_TOKEN ci-dessous.
 *
 * Aucune clé Rebrickable ici : le script ne fait que demander les noms/images
 * à ton Worker, qui est le seul à détenir la clé.
 */

(function () {
  'use strict';

  const WORKER_URL = 'https://marstoy-real.TON-SOUS-DOMAINE.workers.dev';
  const ACCESS_TOKEN = ''; // laisse vide si le Worker n'est pas verrouillé

  if (WORKER_URL.includes('TON-SOUS-DOMAINE')) {
    console.warn('[marstoy-real] Configure WORKER_URL dans le userscript.');
    return;
  }

  const query = ACCESS_TOKEN ? `?k=${encodeURIComponent(ACCESS_TOKEN)}` : '';
  window.__mrResolveUrl = `${WORKER_URL}/__mr/resolve${query}`;

  // On récupère le même script que celui injecté par le proxy : une seule
  // implémentation à maintenir.
  fetch(`${WORKER_URL}/__mr/client.js`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((source) => {
      // eslint-disable-next-line no-new-func
      new Function(source)();
    })
    .catch((error) => {
      console.warn('[marstoy-real] Worker injoignable :', error.message);
    });
})();
