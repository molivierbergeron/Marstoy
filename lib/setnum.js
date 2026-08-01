/**
 * Conversion des références Marstoy vers les numéros de sets LEGO officiels.
 *
 * Marstoy nomme ses boîtes "M" + les chiffres du set LEGO à l'envers :
 *   set LEGO 10276  ->  M67201
 *   set LEGO 41900  ->  M00914 (les zéros de tête sont souvent supprimés -> M914)
 *
 * Comme l'inversion perd les zéros de tête, une référence peut correspondre à
 * plusieurs candidats. On les génère du plus probable au moins probable et le
 * résolveur garde le premier qui existe réellement chez Rebrickable.
 */

// Pas de lookbehind : Safari < 16.4 ne le supporte pas et ce module tourne
// aussi dans le script injecté côté iPhone.
const CODE_SOURCE = '(^|[^A-Za-z0-9])[Mm](\\d{3,7})(?!\\d)';

/** Nouvelle regex globale (les regex globales ont un état, ne pas partager). */
export function codeRegex() {
  return new RegExp(CODE_SOURCE, 'g');
}

/** Toutes les références Marstoy d'un texte, normalisées en `M12345`. */
export function extractCodes(text) {
  const found = [];
  if (!text) return found;
  const re = codeRegex();
  let m;
  while ((m = re.exec(text)) !== null) {
    const code = 'M' + m[2];
    if (!found.includes(code)) found.push(code);
  }
  return found;
}

/** `M12345` -> `12345`. */
export function codeDigits(code) {
  return String(code).replace(/^[Mm]/, '');
}

const reverse = (s) => s.split('').reverse().join('');
const plausible = (num) => num.length >= 3 && num.length <= 7;

/**
 * Candidats groupés par niveau de confiance :
 *   groupe 0 — l'inversion des chiffres (le schéma Marstoy documenté) ;
 *   groupe 1 — la référence telle quelle, au cas où elle ne serait pas inversée.
 *
 * Dans le groupe 0 il peut y avoir plusieurs candidats : si le numéro LEGO finit
 * par des zéros, son inversion commence par des zéros que Marstoy supprime.
 * `LEGO 41900 -> 00914 -> M914`, donc M914 peut valoir 419, 4190 ou 41900.
 */
export function candidateGroups(digits) {
  const reversed = reverse(digits).replace(/^0+/, '');
  const primary = [];
  const add = (list, num) => {
    if (num && plausible(num) && !list.includes(num)) list.push(num);
  };

  add(primary, reversed);
  let withZeros = reversed;
  while (withZeros.length < 5) {
    withZeros += '0';
    add(primary, withZeros);
  }

  const groups = [];
  if (primary.length) groups.push(primary);
  if (plausible(digits) && !primary.includes(digits)) groups.push([digits]);
  return groups;
}

/** Tous les candidats à plat, du plus probable au moins probable. */
export function candidateSetNumbers(digits) {
  return candidateGroups(digits).flat();
}

/**
 * Remplace chaque référence Marstoy d'un texte par son libellé réel.
 * `lookup(code)` renvoie le libellé, ou une valeur falsy pour ne rien changer.
 */
export function replaceCodes(text, lookup) {
  if (!text) return text;
  return text.replace(new RegExp(CODE_SOURCE, 'g'), (match, before, digits) => {
    const label = lookup('M' + digits);
    if (!label) return match;
    // Le libellé contient la référence d'origine : sans ce garde-fou, un second
    // passage (script client après réécriture serveur) l'imbriquerait deux fois.
    if (text.includes(label)) return match;
    return before + label;
  });
}

/** Libellé lisible pour un set résolu, ex. `Hogwarts Castle — LEGO 71043 · M34017`. */
export function formatLabel(resolution, code, template) {
  const pattern = template || '{name} — LEGO {num} · {code}';
  return pattern
    .replaceAll('{name}', resolution.name)
    .replaceAll('{num}', resolution.num)
    .replaceAll('{setNum}', resolution.setNum)
    .replaceAll('{code}', code)
    .replaceAll('{year}', resolution.year == null ? '' : String(resolution.year))
    .replaceAll('{parts}', resolution.numParts == null ? '' : String(resolution.numParts));
}
