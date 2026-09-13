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
 * @param {{ resolvedCount: number, previous: object|null }} state
 * @returns {'marstoy'|'preserve'|'lego'}
 *   - `marstoy`  : la boutique a répondu, on publie ce qu'on en a lu.
 *   - `preserve` : elle n'a rien livré, mais le catalogue publié vient d'elle.
 *   - `lego`     : elle n'a rien livré et il n'y a rien à préserver.
 */
export function chooseCatalogSource({ resolvedCount, previous }) {
  if (Number(resolvedCount) > 0) return 'marstoy';

  // Un catalogue déjà dégradé (repli LEGO) ne se préserve pas : ses références
  // sont calculées, pas observées. `counts.resolved` est ce qui les distingue.
  const usable =
    Number(previous?.counts?.resolved) > 0 && Number(previous?.products?.length) > 0;

  return usable ? 'preserve' : 'lego';
}
