/**
 * Que publier quand marstoy.com n'a rien livré ?
 *
 * Le repli sur le catalogue LEGO a été écrit pour le cas « premier run, la
 * boutique refuse » : mieux vaut des références calculées que rien. Appliqué
 * par-dessus un catalogue déjà constitué, il devient destructeur — il échange
 * des références vues en vente, avec leur titre et leur prix, contre des
 * suppositions. Des données d'il y a une semaine valent mieux que ça.
 *
 * D'où trois issues, et pas deux.
 */

/**
 * Un passage peut casser au milieu sans rien dire : le 31 octobre 2026, le
 * navigateur s'est fermé après 58 fiches et les 342 suivantes ont échoué une à
 * une. Le catalogue est passé de 319 références à 55, et il a été publié —
 * parce que 55 n'est pas zéro, et que le garde-fou ne connaissait que zéro.
 *
 * Une boutique perd des produits petit à petit, pas les quatre cinquièmes en
 * une nuit. Au-delà de cette chute, on considère que c'est la collecte qui a
 * échoué, pas le catalogue qui a fondu.
 */
const CHUTE_MAX = 0.3;

/**
 * @param {{ resolvedCount: number, previous: object|null, chuteMax?: number }} state
 * @returns {'marstoy'|'preserve'|'effondrement'|'lego'}
 *   - `marstoy`      : la boutique a répondu, on publie ce qu'on en a lu.
 *   - `effondrement` : elle a répondu, mais tellement moins qu'avant que la
 *                      collecte est suspecte. On garde l'ancien catalogue.
 *   - `preserve`     : elle n'a rien livré, mais le catalogue publié vient d'elle.
 *   - `lego`         : elle n'a rien livré et il n'y a rien à préserver.
 */
export function chooseCatalogSource({ resolvedCount, previous, chuteMax = CHUTE_MAX }) {
  if (Number(resolvedCount) > 0) {
    const avant = Number(previous?.counts?.resolved) || 0;
    if (avant > 0 && Number(resolvedCount) < avant * (1 - chuteMax)) return 'effondrement';
    return 'marstoy';
  }

  // Un catalogue déjà dégradé (repli LEGO) ne se préserve pas : ses références
  // sont calculées, pas observées. `counts.resolved` est ce qui les distingue.
  const usable =
    Number(previous?.counts?.resolved) > 0 && Number(previous?.products?.length) > 0;

  return usable ? 'preserve' : 'lego';
}
