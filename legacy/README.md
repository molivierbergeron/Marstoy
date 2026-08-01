# legacy — code mis de côté

Ce dossier contient des travaux qui ont fonctionné mais que le projet
n'utilise plus. Ils sont **gelés** : aucun test ne les exécute, et le code
vivant ne les importe pas.

Chaque archive est autonome — elle embarque sa propre copie des modules
partagés — pour qu'une réorganisation du code vivant ne la casse jamais.

## `proxy/` — le proxy Cloudflare de la première approche

Un Worker qui allait chercher les pages de `marstoy.com`, réécrivait les noms et
les images à la volée, et les servait sur ton propre domaine. Tu naviguais sur
*leur* site, corrigé.

Le site statique (`site/`) l'a remplacé : il construit *ton* catalogue à
l'avance, ce qui est plus rapide, ne demande aucune clé, et fonctionne hors
ligne. Le proxy garde toutefois une capacité que le site n'a pas : **corriger
aussi le panier et le parcours de commande**, puisque toute la navigation
passait par lui.

Il n'a jamais été déployé. Le remettre en service demanderait un compte
Cloudflare, un secret `REBRICKABLE_API_KEY`, et un `wrangler deploy` depuis
`legacy/proxy/`.

Ce qu'il contient :

| Chemin | Rôle |
| --- | --- |
| `src/index.js` | entrée du Worker, routage, verrou d'accès optionnel |
| `src/proxy.js` | requêtes vers Marstoy, cookies et redirections ramenés sur le proxy |
| `src/rewrite.js` | réécriture du HTML et du JSON |
| `src/client.js` | script injecté, pour ce qui est rendu en JavaScript |
| `src/resolve.js`, `src/rebrickable.js`, `src/store.js` | résolution via l'API Rebrickable, avec cache |
| `src/setnum.js` | copie gelée de `lib/setnum.js` |
| `userscript/` | variante sans proxy, à installer dans Safari |
| `scripts/check.mjs` | diagnostic d'une référence via l'API Rebrickable |
| `test/` | 12 tests d'intégration dans workerd, plus les tests de réécriture |

Pour relancer ses tests :

```bash
cd legacy/proxy && node --test 'test/*.test.js'
```

Ils ont besoin de `miniflare` et `esbuild`, présents dans les dépendances de
développement du dépôt racine.
