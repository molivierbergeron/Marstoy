/**
 * Mémoire des fiches sans équivalent LEGO.
 *
 * Le catalogue Marstoy contient 3010 fiches, dont 2671 sont leurs propres
 * créations : aucun set officiel ne leur correspond, et elles sont écartées à
 * l'arrivée. Elles étaient pourtant téléchargées à chaque passage — 89 % d'une
 * collecte de vingt minutes consacrés à des pages qu'on jette.
 *
 * Le raccourci évident — ne charger que les fiches dont le code figure dans
 * l'URL — coûterait deux vraies copies sur 338 : celles dont la référence
 * n'apparaît que dans le titre, invisible avant d'avoir ouvert la page. On
 * garde donc la trace de ce qu'on a déjà écarté, plutôt que de le deviner.
 *
 * Une fiche connue sans code est revisitée au bout d'un trimestre, et pas
 * toutes le même jour : Marstoy peut renommer un produit, et un catalogue qui
 * ne revient jamais sur ses conclusions finit par se tromper en silence.
 */

const JOURS_AVANT_REVISITE = 90;

// Combien de fiches déjà écartées on rouvre par passage. Sans ce plafond,
// toutes celles inscrites le même jour expireraient ensemble et rendraient une
// collecte sur treize aussi longue qu'avant. Avec, la revisite s'étale d'elle-
// même : ~2700 fiches revues en une quinzaine de semaines.
const REVISITES_PAR_PASSAGE = 200;

const enJours = (ms) => ms / 86_400_000;

/**
 * Trie les URL du sitemap en « à charger » et « déjà écartées ».
 *
 * @param {string[]} urls toutes les fiches annoncées par le sitemap
 * @param {Record<string, string>} registre url -> date ISO du dernier constat
 * @returns {{ aCharger: string[], ignorees: number, revisitees: number, nouvelles: number }}
 */
export function choisirFiches(urls, registre = {}, options = {}) {
  const {
    maintenant = new Date(),
    joursAvantRevisite = JOURS_AVANT_REVISITE,
    revisitesMax = REVISITES_PAR_PASSAGE,
  } = options;

  const nouvelles = [];
  const anciennes = [];

  for (const url of urls) {
    const vue = registre[url];
    if (!vue) {
      // Jamais rencontrée : on ne sait rien d'elle, donc on la charge. C'est
      // ce qui garantit qu'une nouveauté n'est jamais manquée.
      nouvelles.push(url);
    } else {
      anciennes.push({ url, age: enJours(maintenant - new Date(vue)) });
    }
  }

  // Les plus anciennement vues d'abord : la revisite tourne au lieu de
  // repasser sur les mêmes.
  const aRevisiter = anciennes
    .filter((entree) => !Number.isFinite(entree.age) || entree.age >= joursAvantRevisite)
    .sort((a, b) => b.age - a.age)
    .slice(0, revisitesMax)
    .map((entree) => entree.url);

  return {
    aCharger: [...nouvelles, ...aRevisiter],
    ignorees: anciennes.length - aRevisiter.length,
    revisitees: aRevisiter.length,
    nouvelles: nouvelles.length,
  };
}

/**
 * Met le registre à jour avec ce que le passage vient d'apprendre.
 *
 * Une fiche qui livre enfin une référence en sort : Marstoy l'a renommée, ou
 * elle a toujours porté son code dans son titre. Une fiche qui n'en livre pas
 * y entre, ou voit sa date rafraîchie.
 *
 * @param {Record<string, string>} registre
 * @param {{ url: string, aCode: boolean }[]} constats
 */
export function majRegistre(registre, constats, maintenant = new Date()) {
  const suivant = { ...registre };
  const jour = maintenant.toISOString().slice(0, 10);

  for (const { url, aCode } of constats) {
    if (aCode) delete suivant[url];
    else suivant[url] = jour;
  }
  return suivant;
}

/**
 * Retire du registre les fiches que le sitemap n'annonce plus : un produit
 * retiré de la boutique n'a pas à gonfler le fichier indéfiniment.
 */
export function elaguer(registre, urlsConnues) {
  const vivantes = new Set(urlsConnues);
  return Object.fromEntries(Object.entries(registre).filter(([url]) => vivantes.has(url)));
}
