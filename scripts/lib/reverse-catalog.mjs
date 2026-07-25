/**
 * Filet de sécurité : si marstoy.com refuse le runner (protection anti-robot),
 * on construit le catalogue dans l'autre sens — à partir des sets LEGO, dont on
 * calcule la référence Marstoy en inversant les chiffres.
 *
 * On ne sait alors pas si Marstoy vend réellement le set, mais on peut chercher
 * par vrai nom LEGO et obtenir la référence à taper dans leur recherche : c'est
 * l'essentiel de ce qu'on veut faire.
 */

const reverse = (s) => s.split('').reverse().join('');

/** Référence Marstoy déduite d'un numéro LEGO (zéros de tête supprimés). */
export function marstoyCodeFor(num) {
  const digits = String(num).replace(/\D/g, '');
  if (!digits) return null;
  const reversed = reverse(digits).replace(/^0+/, '');
  return reversed ? `M${reversed}` : null;
}

/**
 * Sélectionne les sets susceptibles d'être clonés par Marstoy : assez gros pour
 * valoir une copie, et pas trop anciens. Sans filtre on embarquerait 24 000
 * entrées dont l'essentiel de sachets de pièces et de polybags.
 */
export function buildFromLegoIndex(index, { minParts = 200, minYear = 1998 } = {}) {
  const bestByNumber = new Map();

  for (const entries of index.byNumber.values()) {
    for (const set of entries) {
      if ((set.numParts ?? 0) < minParts) continue;
      if ((set.year ?? 0) < minYear) continue;
      const code = marstoyCodeFor(set.num);
      if (!code) continue;

      // Une seule entrée par numéro : la plus récente / la plus grosse.
      const current = bestByNumber.get(set.num);
      const better =
        !current ||
        (set.year ?? 0) > (current.year ?? 0) ||
        ((set.year ?? 0) === (current.year ?? 0) && (set.numParts ?? 0) > (current.numParts ?? 0));
      if (better) bestByNumber.set(set.num, { ...set, code });
    }
  }

  return [...bestByNumber.values()].map((set) => ({
    code: set.code,
    // Marstoy n'a pas été consulté : pas de titre, de photo ni de prix.
    marstoyTitle: null,
    marstoyUrl: `https://www.marstoy.com/search?q=${encodeURIComponent(set.code)}`,
    marstoyImage: null,
    price: null,
    num: set.num,
    setNum: set.setNum,
    name: set.name,
    year: set.year,
    numParts: set.numParts,
    theme: set.theme,
    imgUrl: set.imgUrl,
    setUrl: set.setUrl,
    matchedBy: 'catalogue LEGO (référence calculée)',
  }));
}
