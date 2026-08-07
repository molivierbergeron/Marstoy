# marstoy-real — vision et décisions

> Audit horodaté du 2026-08-02, sur `b497120`. Ce fichier n'est pas mis à jour :
> il porte la preuve technique au moment de l'audit. L'état courant vit ailleurs.

---

## 1. Vision produit

**Ce que ça fait.** Marstoy vend des clones de sets LEGO sous des références illisibles — leurs fiches s'intitulent `MOC M70334 Parts Kit` et portent toutes la même photo générique. Ce produit rend leur catalogue lisible : le vrai nom du set (`Alien with Pizza Planet Rocket Ride`), son visuel officiel, son prix converti en dollars canadiens et l'écart avec le prix de détail LEGO, plus une short list par personne qui suit d'un appareil à l'autre.

**Ce que ça remplace.** Le geste d'avant, répété pour chaque produit envisagé : ouvrir marstoy.com, tomber sur `M70334`, inverser les chiffres de tête pour obtenir `43307`, chercher ce numéro ailleurs pour voir de quoi il s'agit, convertir le prix mentalement. Et ne rien garder d'une session à l'autre — la liste d'envies vivait dans la mémoire ou dans un fil de messages.

**Où ça s'arrête.** Il ne vend rien : « Commander » renvoie sur marstoy.com et le panier reste chez eux. Ce n'est pas un manque mais une décision actée en archivant le proxy dans `legacy/proxy/`, qui savait pourtant réécrire tout le parcours d'achat. Il ne juge pas la qualité des clones — il rapproche des références, il ne dit pas si la boîte vaut son prix. Et il ne protège rien : l'API des listes n'a aucun contrôle d'accès (`workers/favoris/src/index.js:60`, `access-control-allow-origin: '*'`, et aucune vérification d'identité sur les routes d'écriture), c'est un garde-fou contre la maladresse entre trois personnes qui se font confiance.

### État

| | |
| --- | --- |
| **Statut** | **Vivant** — dernier commit hier |
| **Dernière modification** | `b497120` · 2026-08-01 16:27 UTC |
| **Stack réelle** | Site statique HTML/CSS/JS sans build (`site/index.html`, 863 lignes) sur GitHub Pages · build Node 22 (`scripts/`, 6 modules) dans GitHub Actions · Worker Cloudflare + KV (`workers/favoris/src/index.js`, 173 lignes) |
| **Dépendances d'exécution** | **Aucune.** `package.json:13-17` ne déclare qu'`esbuild` et `wrangler` en devDependencies |
| **Tests** | 58, tous verts (`npm test`, 9,0 s) |
| **Coût récurrent** | **0 $/mois** |

### Dépendances externes et points de rupture

| Service | Rôle | Si ça tombe |
| --- | --- | --- |
| `marstoy.com` sitemap | source du catalogue, 2931 fiches par passage | Le build échoue bruyamment (`.github/workflows/build-catalog.yml:196-197`, sortie 1 si `resolved == '0'`). `products.json` répond déjà 403 (`data/recon.json`, `attempts[0]`) — le sitemap est la seule porte |
| `cdn.rebrickable.com` | `sets.csv.gz` + `themes.csv.gz`, sans clé | Arrêt du build avec message explicite (`scripts/build-catalog.mjs:50-59`, téléchargement à `scripts/lib/legodata.mjs:55-60`) |
| `brickset.com` API | prix de détail LEGO | Dégradation propre : la ligne « xx % off » disparaît, le reste tient (`scripts/lib/legoprice.mjs:83-89`) |
| `api.frankfurter.app` | taux USD→CAD (BCE) | Les prix restent affichés en USD (`scripts/build-catalog.mjs:154-161`) |
| Worker Cloudflare | listes de favoris | Les favoris retombent en local par appareil, sans synchronisation |
| `lego.com` | — | **Abandonné** : 403 sur les 302 requêtes du run du 2026-07-26. Ne subsiste que le lien sortant dans les cartes |

**Deux fragilités structurelles, non liées à un tiers :**

1. La branche par défaut est `claude/marstoy-iphone-lego-images-r7u3nd`, seule branche distante (`git branch -r`). GitHub Pages publie depuis elle et `catalog.repo.ref` la fige dans le JSON livré au navigateur (`scripts/build-catalog.mjs`, bloc `repo`). **La renommer casse simultanément la publication et le bouton ⟳.**
2. GitHub désactive les workflows planifiés après 60 jours sans activité sur le dépôt. Le rafraîchissement hebdomadaire s'arrête alors en silence côté produit (un courriel est envoyé au propriétaire).

---

## 2. Epics

### Epics socle

**S1 — Fiabilité.** Bon niveau. Le build échoue bruyamment sur catalogue vide, le commit du robot résiste aux courses de push (4 tentatives avec recalage, `.github/workflows/build-catalog.yml:156-193` — ajouté après l'échec réel du run 14), et le Worker est sondé à chaque build avec le résultat écrit dans les logs. **Le trou restant** : le seuil d'alerte est à zéro, pas à une variation. Si Marstoy change de structure et que la découverte tombe de 311 à 40 produits, le build réussit et personne n'est prévenu.

**S2 — Coût.** Rien à signaler côté argent : tout est sur des paliers gratuits et aucun quota n'est proche d'un plafond (écritures KV : quelques-unes par jour contre 1000 offertes). Le seul coût réel est adressé aux tiers — 2931 requêtes hebdomadaires vers marstoy.com pour une trentaine de changements (`data/recon.json` : `pagesFetched: 2931`).

**S3 — Vitesse et friction.** Le site charge 156 Ko de JSON et rend 60 cartes avant défilement infini. La friction est ailleurs : le bouton ⟳ annonce **4 minutes** d'attente (`site/index.html`, `repo.approxMinutes`) et réclame un jeton GitHub au premier usage.

**S4 — Analytics et observabilité.** Asymétrie nette. **Observabilité technique : bonne** — `data/recon.json` consigne stratégies, codes HTTP, échantillons de pages et rejets ; les logs du runner disent si chaque clé est vue. **Analytics d'usage : néant** — zéro occurrence de télémétrie dans `site/index.html`. On ne sait pas si le site est ouvert, ce qui est cherché, ni ce qui est mis en favori.

**S5 — Dette technique.** Faible. 58 tests, aucune dépendance d'exécution, modules courts. Deux scories : le secret `REBRICKABLE_API_KEY` est encore passé au build (`.github/workflows/build-catalog.yml:113`) alors qu'aucun code vivant ne le lit (vérifié par `grep` sur `scripts/ lib/ workers/ site/`), et les 18 tests de `legacy/proxy/` sont hors du glob `npm test` (`package.json:9`), donc jamais exécutés.

### Epics produit

**P1 — Savoir quoi commander ce soir**
*Objectif* : la liste dit ce que ça coûte, pas s'il faut acheter maintenant — ni si l'article est en stock, ni si son prix vient de baisser.
*On saura que c'est atteint quand* : on ouvre la short list et on commande sans rouvrir marstoy.com pour vérifier quoi que ce soit.

**P2 — Faire confiance au chiffre affiché**
*Objectif* : le montant en CAD est une conversion au taux BCE d'un prix relevé depuis une IP américaine ; il n'a jamais été confronté à ce que Marstoy facture réellement depuis Montréal.
*On saura que c'est atteint quand* : le total au moment de payer ne surprend personne par rapport au chiffre affiché.

**P3 — Couvrir ce que Marstoy vend, pas seulement ce qu'il copie**
*Objectif* : 2609 produits sur 2931 sont absents de l'outil — ce sont les créations maison de Marstoy, sans set LEGO derrière.
*On saura que c'est atteint quand* : une recherche qui ne donne rien ici n'en donne pas davantage sur marstoy.com.

---

## 3. Séquence par thème

### Maintenant

À la fin de cette vague, le produit sait dire ce qu'il est déjà : le document d'entrée cesse de décrire comme restant à faire un déploiement terminé depuis une semaine, et le secret fantôme disparaît. Surtout, il se rafraîchit en quelques secondes au lieu de quatre minutes, et il sait enfin si le prix qu'il affiche correspond à ce que Marstoy facture — aujourd'hui c'est une espérance, pas une mesure.

### Ensuite

Le produit acquiert une mémoire : il garde les prix passés au lieu de les écraser à chaque passage, et signale une baisse sur un article de la liste. Il commence aussi à dire qui l'utilise et ce qui est cherché sans succès, ce qui permet de trancher la question des 2609 MOC autrement qu'à l'instinct.

### Un jour

Le produit couvre l'intégralité du catalogue Marstoy et prévient sans qu'on le consulte quand un set suivi baisse. Rien de tout cela n'a de sens avant que l'historique des prix existe — c'est l'ambition, pas le prochain chantier.

---

## 4. Items

| # | Item | Epic | Bénéfice concret | Effort | Sessions |
| --- | --- | --- | --- | --- | --- |
| 1 | Consigner l'état déployé dans le README | S5 | Ne pas recréer un second Worker en janvier | XS | 0,25 |
| 2 | Mesurer le prix réellement facturé en CAD | P2 | Savoir si les « 78 % off » sont vrais | S | 1 |
| 3 | Ne recharger que les fiches modifiées | S3 · S2 | Le ⟳ passe de 4 min à quelques secondes | L | 4 |
| 4 | Alerter sur un effondrement du catalogue | S1 | Voir une panne silencieuse de Marstoy | S | 1 |
| 5 | Conserver l'historique des prix | P1 | Commander au bon moment | M | 2 |
| 6 | Compter les usages depuis le Worker | S4 | Trancher l'item 10 sur des faits | M | 2 |
| 7 | Signaler les produits disparus de Marstoy | P1 | Ne pas cliquer sur un 404 | S | 1 |
| 8 | Partager une short list par lien | P1 | Envoyer sa liste sans copier-coller | S | 1 |
| 9 | Ajouter note et quantité aux favoris | P1 | La liste devient une liste de courses | M | 2 |
| 10 | Publier les 2609 MOC maison | P3 | Cesser de sortir de l'app pour 89 % du catalogue | L | 4 |
| 11 | Corriger une correspondance sans passer par git | S5 | Réparer un mauvais appariement du téléphone | M | 2 |
| 12 | Retirer le secret `REBRICKABLE_API_KEY` | S5 | Ne pas tester un build pour savoir s'il sert | XS | 0,25 |

**Total sessions estimées : 20,5**

---

### [1] Consigner l'état déployé dans le README

**Constat** : `README.md:163-231` décrit le déploiement du Worker comme un travail à faire, en deux chemins détaillés. Aucune ligne du dépôt n'indique que le Worker vit à `marstoy-favoris.mo-bergeron.workers.dev`, que le namespace KV `c9bee6f1758b45c58fee08189df13d00` est branché, ni que les comptes Marco / Christian / Marie-Claude existent — tout cela est pourtant vérifié dans les logs du job `91386585341` (« Worker des favoris : **en ligne** — comptes : Christian (0), Marco (0), Marie-Claude (0) »). Seul `site/data/catalog.json` porte l'adresse, dans un fichier généré.

**Bénéfice** : en rouvrant le dépôt dans six mois, le CPO suit le mode d'emploi et crée un deuxième Worker, ou repart chercher une clé Brickset déjà en place. Cet item supprime cette demi-session perdue.

**Proposition** : ajouter en tête de `README.md` un bloc « Déjà en place » listant l'URL du site, l'URL du Worker, l'identifiant KV et les trois comptes. Déplacer les deux chemins de déploiement sous un titre « Si tout est à refaire ». Aucun code touché.

**Dépend de** : rien
**Confiance que ça règle le constat** : 95 %

---

### [2] Mesurer le prix réellement facturé en CAD

**Constat** : le runner GitHub tourne en `Azure Region: eastus` (logs du job `91385834410`). Il relève des prix en USD — devise détectée sur 319 fiches, `assumed: false` dans `site/data/catalog.json` — puis les convertit au taux BCE de 1,4041 (`scripts/build-catalog.mjs:154-161`). Marstoy tourne sur ShopLine, dont les boutiques localisent couramment la devise selon l'IP du visiteur. **Non vérifiable ici** : l'environnement de développement n'a aucun accès sortant vers marstoy.com (403 du proxy réseau sur toute requête). Personne n'a donc jamais comparé le montant affiché à celui d'un panier réel depuis Montréal.

**Bénéfice** : si Marstoy facture déjà en CAD à son propre taux, chaque pourcentage d'économie affiché est décalé — et c'est le chiffre sur lequel repose la décision d'achat. L'item transforme une hypothèse en fait mesuré, dans un sens ou dans l'autre.

**Proposition** : ouvrir une fiche produit depuis Montréal, relever le prix affiché, et le comparer au `priceCad` du catalogue pour le même code. Si l'écart dépasse quelques pour cent, faire porter au build un en-tête `Accept-Language: fr-CA` et enregistrer la devise réellement servie dans `data/recon.json`. Point d'entrée : `scripts/lib/fetch-util.mjs:19` (les en-têtes envoyés à chaque requête).

**Dépend de** : rien
**Confiance que ça règle le constat** : 90 % — la mesure tranchera ; la correction éventuelle dépend de ce que ShopLine sert au runner (confiance ~60 % qu'un en-tête suffise sans changer d'IP)

---

### [3] Ne recharger que les fiches modifiées

**Constat** : chaque passage charge les 2931 fiches (`data/recon.json` : `pagesFetched: 2931`), alors que le sitemap fournit une date de modification pour **la totalité** d'entre elles (`sitemapWithLastmod: 2931`). Cette date est déjà lue et transportée (`scripts/lib/marstoy.mjs:198`) mais uniquement pour dater les arrivées — jamais pour éviter un téléchargement. Le job de build dure 2 min 10 s (job `91386585341`, étapes 15:43:55 → 15:46:05), presque entièrement passées dans cette boucle.

**Bénéfice** : le bouton ⟳ annonce aujourd'hui 4 minutes d'attente, ce qui le réserve aux cas où l'on est prêt à patienter. À quelques secondes, il devient le geste normal quand on soupçonne une nouveauté. Effet secondaire : 2900 requêtes hebdomadaires en moins vers un site tiers.

**Proposition** : persister `code → lastmod` dans un fichier de données, sur le modèle de `data/first-seen.json`, et sauter le chargement des fiches dont le `lastmod` est inchangé en réutilisant les champs du catalogue précédent. Point d'entrée : la sélection des cibles à `scripts/lib/marstoy.mjs:214` et la boucle `mapLimit` qui la suit.

*Calibration* : **L** et non M — sauter des fiches transforme la boucle de découverte elle-même, qui est le chemin d'exécution principal du build.

**Dépend de** : rien
**Confiance que ça règle le constat** : 85 % — le gain dépend du sérieux avec lequel ShopLine met à jour ses `lastmod` (confiance ~70 % qu'ils soient fiables)

---

### [4] Alerter sur un effondrement du catalogue

**Constat** : le workflow n'échoue que si le catalogue est **totalement** vide (`.github/workflows/build-catalog.yml:197`, condition `resolved == '0'`). Le passage de 302 à 311 produits entre deux runs n'a été remarqué qu'en lisant les compteurs à la main. Une chute à 40 produits — Marstoy réorganise ses URLs, la moitié des références cessent d'être reconnues — produirait un build vert et un site appauvri sans un mot.

**Bénéfice** : le CPO découvre la panne en ouvrant l'app un soir et en trouvant sa short list amputée, sans savoir depuis quand. L'item fait échouer le run le jour même.

**Proposition** : comparer le nombre publié à celui du catalogue précédent, déjà présent dans le dépôt, et faire échouer le run si la baisse dépasse un seuil (25 % par exemple). Point d'entrée : l'étape « Échouer si le catalogue est vide », qui devient « Échouer si le catalogue s'effondre ».

**Dépend de** : rien
**Confiance que ça règle le constat** : 90 %

---

### [5] Conserver l'historique des prix

**Constat** : `scripts/build-catalog.mjs:158` écrase `item.priceCad` à chaque passage, et `site/data/catalog.json` ne porte qu'un instantané. Aucun fichier du dépôt ne conserve un prix passé — `data/lego-prices.json` ne stocke que le prix de détail LEGO, qui ne bouge pas. L'information est collectée puis jetée chaque semaine.

**Bénéfice** : la question qu'on se pose devant une short list est « est-ce le bon moment ? », et le produit ne peut pas y répondre. Avec trois mois d'historique, une carte peut afficher « 127 $, contre 149 $ en juin » et déclencher la commande — ou l'ajourner.

**Proposition** : écrire `data/price-history.json` (code → suite de dates et de prix), calqué sur le mécanisme déjà en place pour `data/first-seen.json`, et l'ajouter à la liste des fichiers commités par le workflow. Afficher la variation sur la carte quand elle dépasse quelques pour cent. Point d'entrée : `scripts/build-catalog.mjs:197-206`, où le registre des arrivées est déjà tenu.

**Dépend de** : rien
**Confiance que ça règle le constat** : 95 %

---

### [6] Compter les usages depuis le Worker

**Constat** : `site/index.html` ne contient aucune télémétrie (0 occurrence de `analytics`, `gtag`, `plausible`, `/api/events`). Le Worker expose cinq routes, toutes dédiées aux comptes et aux listes (`workers/favoris/src/index.js:115-168`). Rien ne dit si le site est ouvert, ce qui est cherché sans résultat, ni quels tris servent — l'ordre de priorité de ce document repose donc sur mon jugement, pas sur des faits.

**Bénéfice** : l'item 10 coûte 4 sessions et repose sur une intuition invérifiable. Les recherches infructueuses, à elles seules, diront si les 2609 MOC manquent vraiment — et éviteront, le cas échéant, de construire une section que personne n'ouvrira.

**Proposition** : ajouter un `POST /api/events` au Worker qui incrémente des compteurs en KV, et l'appeler depuis le site sur quatre événements seulement — ouverture, recherche sans résultat, favori ajouté, clic vers Marstoy. Aucune session, aucun parcours, aucun identifiant. Lecture par une route `GET /api/stats`.

**Dépend de** : rien
**Confiance que ça règle le constat** : 70 % — trois utilisateurs produiront peu de données ; suffisant pour trancher entre deux options, insuffisant pour une analyse fine

---

### [7] Signaler les produits disparus de Marstoy

**Constat** : `data/first-seen.json` (311 entrées) n'enregistre que des apparitions ; rien ne détecte une disparition. Un code retiré du catalogue reste dans la liste KV d'un utilisateur — `sanitizeCodes` (`workers/favoris/src/index.js:41-51`) ne vérifie que la forme `M\d{3,7}`, jamais l'existence. Le site affiche alors une carte dont le lien « Commander » mène à une page morte.

**Bénéfice** : on tape sur « Commander » depuis l'épicerie, on tombe sur un 404, et on ne sait pas si c'est le lien qui est cassé ou l'article qui n'existe plus. L'item répond à la question avant le clic.

**Proposition** : marquer dans le catalogue les codes présents au passage précédent et absents du nouveau, et griser la carte avec la date de disparition. Point d'entrée : le même bloc que le registre des arrivées, `scripts/build-catalog.mjs:197-206`.

**Dépend de** : rien
**Confiance que ça règle le constat** : 85 %

---

### [8] Partager une short list par lien

**Constat** : le seul partage possible est un export texte construit dans `site/index.html` (fonction `exportList`), qui passe par la feuille de partage iOS ou le presse-papiers. Le Worker sait pourtant déjà servir n'importe quelle liste en lecture (`GET /api/list/:slug`, `workers/favoris/src/index.js:137-145`), et le site sait déjà l'afficher en lecture seule (mode `browsing`).

**Bénéfice** : envoyer sa liste se fait aujourd'hui en collant un pavé de texte dans un message. Avec un lien, le destinataire voit les images et les prix à jour, et la liste continue d'évoluer après l'envoi.

**Proposition** : lire un paramètre `?liste=<slug>` au chargement et basculer directement en mode lecture seule sur ce compte. Ajouter un bouton « Copier le lien » à côté de « Exporter ». Toute la mécanique existe, il ne manque que le point d'entrée par URL.

**Dépend de** : rien
**Confiance que ça règle le constat** : 90 %

---

### [9] Ajouter note et quantité aux favoris

**Constat** : une liste est un simple tableau de codes — `sanitizeCodes` renvoie `['M70334', 'M25277']` et rien d'autre (`workers/favoris/src/index.js:41-51`, test à `test/favoris.test.js:54-58`). Impossible de noter « 2 exemplaires » ou « anniversaire de Simone ».

**Bénéfice** : la short list sert à préparer une commande groupée entre trois personnes. Sans quantité ni destinataire, l'information manquante se retrouve dans un fil de messages à côté — exactement ce que le produit remplaçait au départ.

**Proposition** : ajouter au document KV un champ frère `meta: { code: { note, qty } }` sans toucher au tableau `codes`, pour que les listes existantes restent lisibles. Exposer un champ de saisie sur la carte en vue « Ma liste ». Point d'entrée : la route `PUT /api/list/:slug`.

*Calibration* : **M** et non S — deux fichiers seulement, mais la forme du document stocké en KV évolue.

**Dépend de** : rien
**Confiance que ça règle le constat** : 85 %

---

### [10] Publier les 2609 MOC maison

**Constat** : `data/recon.json` compte `marstoyOwnMocs: 2609` sur `sitemapProductUrls: 2931`. Ces produits sont écartés à la source parce qu'aucune référence `M…` n'est attachée au produit lui-même (`scripts/lib/marstoy.mjs:242-247`, et le compteur ligne 254) — leurs codes `M03xxx` sont une numérotation interne, et les inverser produisait de fausses correspondances corrigées le 2026-07-26 (`M03120` renvoyait au set 2130 : 364 pièces annoncées contre 7 réelles). **89 % du catalogue Marstoy est donc invisible dans l'outil.**

**Bénéfice** : chercher un produit vu chez Marstoy et ne rien trouver oblige à rouvrir leur site — le geste que le produit existe pour éviter. Neuf fois sur dix, c'est ce qui arrivera.

**Proposition** : publier ces produits dans une section distincte, avec leur titre et leur photo Marstoy, explicitement étiquetés comme créations maison sans équivalent LEGO. Ne jamais leur appliquer l'inversion de chiffres. Point d'entrée : le tableau `withoutCode` de `scripts/lib/marstoy.mjs`, aujourd'hui limité à 60 entrées d'échantillon.

**Dépend de** : 6 (pour savoir si le besoin est réel avant d'engager 4 sessions)
**Confiance que ça règle le constat** : 80 % — techniquement direct ; l'incertitude porte sur l'utilité, pas sur la faisabilité

---

### [11] Corriger une correspondance sans passer par git

**Constat** : `overrides.json` ne contient aujourd'hui aucune correction réelle, seulement un commentaire d'usage. Les 8 correspondances rejetées ne sont lisibles qu'en ouvrant `data/recon.json` (`M64467 → 76446 Knight Bus Adventure`, motif « nombre de pièces trop éloigné »). Corriger l'une d'elles suppose d'éditer un fichier JSON, de commiter, et d'attendre un run.

**Bénéfice** : repérer une fiche mal appariée se fait en consultant le site, souvent depuis le téléphone. Le correctif, lui, demande un ordinateur et une session — l'écart fait que la correction n'est jamais faite.

**Proposition** : exposer les rejets et les non-résolus dans une page du site, et permettre d'y proposer un numéro de set qui alimente `overrides.json` via l'API GitHub — le même mécanisme de jeton que le bouton ⟳ utilise déjà (`site/index.html`, fonction `askToken`).

*Calibration* : **M** et non S — l'écriture dans le dépôt passe par l'API Contents de GitHub, un point d'appel externe que le produit n'utilise pas encore.

**Dépend de** : rien
**Confiance que ça règle le constat** : 70 % — 8 rejets sur 319 : le volume ne justifiera peut-être jamais l'outil

---

### [12] Retirer le secret `REBRICKABLE_API_KEY`

**Constat** : `.github/workflows/build-catalog.yml:113` passe `REBRICKABLE_API_KEY` au build. Un `grep` sur `scripts/ lib/ workers/ site/` ne trouve aucune lecture de cette variable dans le code vivant — la dernière remonte à `legacy/proxy/src/resolve.js`, archivé. Les données LEGO viennent des exports publics, sans clé (`scripts/lib/legodata.mjs:55-60`).

**Bénéfice** : au prochain ménage de secrets, cette entrée oblige à vérifier si la supprimer casse le build. L'item économise cette vérification, et retire une dépendance apparente qui n'existe plus.

**Proposition** : supprimer la ligne du workflow et révoquer le secret côté GitHub. Une ligne.

**Dépend de** : rien
**Confiance que ça règle le constat** : 100 %

---

### Écarté

| Écarté | Pourquoi |
| --- | --- |
| Réactiver le proxy de `legacy/proxy/` | Franchit la frontière posée en Vision : le produit ne prend pas en charge le parcours d'achat |
| Migrer le site vers Cloudflare Pages | Le build vit dans Actions avec la clé Brickset ; GitHub Pages publie l'artefact sans étape supplémentaire. Aucun constat ne l'exige |
| Recherche tolérante aux fautes | La recherche par sous-chaîne normalisée porte sur 311 entrées et 19 champs indexés. Aucun échec observé |
| Exécuter les 18 tests de `legacy/proxy/` | Du code gelé qui n'est plus importé. Les faire tourner ne protège rien |
| NIP par compte | Contredit la frontière « il ne protège rien ». À rouvrir seulement si la réponse à la question 2 change |
| Alertes de baisse de prix par courriel | Sans l'item 5, il n'y a rien à comparer. Appartient à « Un jour » |

---

## 5. Décisions qui appartiennent au CPO

1. **Les 2609 créations maison de Marstoy font-elles partie du produit ?** Le code ne peut pas trancher : elles n'ont aucun set LEGO derrière, donc rien à corriger, mais elles représentent 89 % de ce que Marstoy vend. Les inclure change la nature de l'outil — de « traducteur de références » à « catalogue Marstoy lisible ».

2. **Le produit reste-t-il à trois personnes qui se font confiance ?** Toute la conception de l'API des listes en dépend. Si le cercle s'élargit, l'absence de contrôle d'accès cesse d'être un choix assumé et devient une faille.

3. **Que doit faire le produit quand il doute d'une correspondance ?** La tolérance est aujourd'hui de 20 % d'écart sur le nombre de pièces, ce qui écarte 8 références sur 319. Préférence pour rater des correspondances justes, ou pour en publier de douteuses en les signalant ?

4. **La short list sert-elle à acheter maintenant ou à accumuler des envies ?** Les items 5, 7 et 9 n'ont de sens que dans le premier cas. Dans le second, le produit est déjà complet et la vague « Ensuite » peut être ignorée.

5. **Le prix affiché doit-il rester une conversion indicative ?** L'alternative est de viser ce que Marstoy facture réellement, ce qui suppose d'accepter que le chiffre dépende d'où l'on se trouve. Le produit affiche aujourd'hui un « ≈ » implicite qui n'est plus écrit nulle part depuis la refonte de la ligne de prix.

---

*Audit produit le 2026-08-02 sur `b497120`. Report dans Notion le 2026-08-07 :
[Marstoy réel — Vision produit](https://app.notion.com/p/3b5d951b509181c09742ead707d8c30a),
sous le hub [AI Products](https://app.notion.com/p/3b0d951b509180999098d32f48d9bc6b).
La page Notion porte l'état courant ; ce fichier reste figé sur `b497120`.*
