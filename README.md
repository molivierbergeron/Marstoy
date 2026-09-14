# marstoy-real

Consulter le catalogue **Marstoy** avec les **vrais noms et les vraies images des
sets LEGO**, depuis l'iPhone ou l'ordinateur.

Marstoy nomme ses boîtes `M` + les chiffres du set LEGO **à l'envers** :

| Marstoy  | Set LEGO réel |
| -------- | ------------- |
| `M70334` | `43307`       |
| `M29157` | `75192`       |
| `M914`   | `41900`       |

Un workflow GitHub parcourt chaque semaine les 2900 fiches de marstoy.com,
croise chaque référence avec les **exports publics de Rebrickable**, et publie
un catalogue statique sur GitHub Pages. La résolution ayant lieu à la
construction, **le site livré à ton navigateur ne contient aucune clé**.

## Ce que ça donne

```
Chez Marstoy :  MOC M70334 Parts Kit          + photo générique
Ici          :  Alien with Pizza Planet Rocket Ride
                2026 · 714 pièces · Disney › Toy Story
                25 $   80 $   [69 % · 55 $]      + visuel officiel du 43307
```

Sur 2901 produits Marstoy, 302 clonent un vrai set LEGO — le reste sont leurs
propres créations, sans équivalent officiel. Chaque correspondance est vérifiée
sur le nombre de pièces annoncé : un écart de plus de 20 % la fait rejeter
plutôt que publier.

## Le site

### Activer une fois

1. **Settings → Pages → Build and deployment → Source : `GitHub Actions`.**
2. **Actions → « Construire le catalogue et publier le site » → Run workflow.**

À la fin du run, l'URL du site s'affiche dans le job `deploy` (typiquement
`https://molivierbergeron.github.io/Marstoy/`).

### Sur l'iPhone

Ouvre l'URL dans Safari → **Partager** → **Sur l'écran d'accueil**. L'appli
fonctionne ensuite hors ligne (service worker) et se met à jour toute seule.

### Dans le site

- Recherche par nom, n° LEGO, référence `M…`, thème ou année.
- Tris par économie (% ou $), par prix, par prix LEGO, par nombre de pièces.
- ☆ pour construire sa short list (voir plus bas).
- « Commander » ouvre la fiche Marstoy, « LEGO » la fiche officielle.

### Prix

Les prix sont affichés en **dollars canadiens**, convertis à la construction avec
les taux de référence de la BCE (api.frankfurter.app, gratuit, sans clé). Le site
n'appelle aucune API : la conversion est déjà dans `catalog.json`.

Marstoy ne déclare pas sa devise — `og:price:currency` est vide sur ses fiches —
donc le build prend la devise majoritaire là où il sait la lire, et **USD par
défaut**. Le bandeau du site précise laquelle a servi, avec la mention
« supposé » le cas échéant, et la date du taux.

Marstoy facture dans sa propre devise avec son propre taux, auxquels s'ajoutent
frais de carte et livraison. Le prix d'origine reste accessible en appui long sur
le montant. **Pour décider d'un achat, fie-toi au prix affiché sur la fiche
Marstoy**, pas à la conversion.

### Écart avec le prix LEGO (« xx $ off »)

Optionnel, et désactivé tant qu'il manque une clé.

lego.com bloque les requêtes automatisées — 403 sur les 302 essais — donc les
prix de détail viennent de **Brickset**, qui publie le prix canadien et conserve
celui des sets retirés. La clé est gratuite :

1. Compte sur <https://brickset.com/> puis clé sur
   <https://brickset.com/tools/webservices/requestkey>.
2. Dépôt → **Settings → Secrets and variables → Actions → New repository
   secret**, nommé `BRICKSET_API_KEY`.
3. Relancer le workflow.

Sans ce secret, tout le reste fonctionne : seule la ligne « xx $ off »
disparaît. Les prix sont interrogés par année en lots de 500 (une quarantaine de
requêtes) et mis en cache dans `data/lego-prices.json`, donc les passages
suivants ne demandent que les nouveautés.

### Mise à jour

Le catalogue se reconstruit **chaque lundi à 02 h 17** (heure de Montréal), à
chaque modification du scraper, et à la demande. Un passage complet dure
**environ 3 minutes** (2901 fiches chargées), plus ~1 minute de file d'attente
et de publication.

L'appli va rechercher le catalogue à chaque ouverture quand tu as du réseau : tu
vois donc toujours le dernier build. Hors ligne, elle sert le dernier état connu.

> GitHub désactive les workflows planifiés après **60 jours sans activité sur le
> dépôt**. Il envoie un courriel et un clic suffit à réactiver.

#### À la demande, depuis un navigateur

Actions → « Construire le catalogue et publier le site » → **Run workflow**.

#### À la demande, depuis l'iPhone (raccourci)

L'app GitHub n'expose pas « Run workflow ». Un raccourci iOS le fait en un tap,
et le jeton reste sur ton téléphone.

1. Crée un **fine-grained token** sur
   <https://github.com/settings/personal-access-tokens/new> :
   - *Repository access* → **Only select repositories** → `Marstoy`
   - *Permissions* → *Repository permissions* → **Actions : Read and write**
   - rien d'autre : ce jeton ne peut que déclencher des workflows sur ce dépôt.
2. App **Raccourcis** → nouveau raccourci → action **Obtenir le contenu de l'URL** :

   | Champ | Valeur |
   | --- | --- |
   | URL | `https://api.github.com/repos/molivierbergeron/Marstoy/actions/workflows/build-catalog.yml/dispatches` |
   | Méthode | `POST` |
   | En-têtes | `Authorization: Bearer <TON_JETON>`<br>`Accept: application/vnd.github+json` |
   | Corps de la requête | JSON : `ref` = `claude/marstoy-iphone-lego-images-r7u3nd` |

3. Ajoute le raccourci à l'écran d'accueil.

Un `204` sans contenu veut dire que c'est parti ; le catalogue est à jour ~4
minutes plus tard.

### Si le catalogue ne se rafraîchit plus

Le workflow écrit `data/recon.json` dans le dépôt : stratégies tentées, codes
HTTP obtenus, et — depuis septembre 2026 — le corps de la première réponse
refusée (`samples.blockedResponse`), qui dit *qui* bloque. Ouvre-le, ou
donne-le moi.

**Depuis le 11 septembre 2026, marstoy.com est derrière un défi JavaScript
Cloudflare** (« Just a moment... »). Il vise les IP de centre de données, donc
les runners GitHub le prennent de plein fouet : le build ne lit plus rien de la
boutique. Il ne se dégrade pas pour autant — il **conserve le catalogue déjà
publié** et signale le run en jaune. Le site continue de servir les dernières
vraies données, simplement elles vieillissent.

Pour vérifier si une autre porte s'est rouverte : Actions → **« Sonder les
portes d'entrée Marstoy »** → *Run workflow*. La sortie dit quelle adresse
utiliser, ou qu'il n'y en a aucune.

#### Ce qui est jugé, c'est le client — pas l'adresse IP

Essai du 14 septembre 2026 : le build lancé depuis une connexion résidentielle
est refusé **exactement comme** depuis un runner GitHub. L'hypothèse « une IP
domestique passera » est donc fausse, et il faut la dire fausse.

Ce que Cloudflare examine, c'est la signature du client : empreinte TLS,
réglages HTTP/2, capacité à exécuter le JavaScript du défi. `node` n'a rien d'un
navigateur sur aucun de ces points, et aucun en-tête ajouté n'y change quoi que
ce soit — d'où l'inutilité d'insister de ce côté.

**Ce qui passe, en revanche : un vrai Chrome avec fenêtre.** Vérifié le
14 septembre 2026. Le détail compte — un Chrome *sans* interface (headless) est
défié lui aussi ; c'est la fenêtre visible, le profil persistant et le Chrome du
système qui font la différence.

La collecte passe donc par là (`scripts/lib/marstoy-browser.mjs`) : on ouvre la
page d'accueil jusqu'à ce que le défi tombe, puis on emprunte le canal HTTP du
navigateur, qui porte le cookie obtenu. Les pages ne sont pas chargées dans un
onglet — c'est inutilement lent, et Chrome enveloppe le XML dans sa visionneuse,
si bien qu'on récupérerait ce cadre au lieu du document.

Deux conséquences à connaître :

- **Ça ne peut pas tourner sur un runner GitHub**, qui n'a pas de session
  graphique. Le workflow hebdomadaire continue donc d'échouer à lire la
  boutique, de conserver le catalogue publié, et de passer au vert avec une
  alerte. Le rafraîchissement, lui, se fait depuis la machine de l'auteur.
- `products.json` est définitivement mort : Marstoy tourne sur **ShopLine**, pas
  Shopify, et cette adresse rend du HTML. Seul le sitemap compte.

Pour re-vérifier l'état du mur à tout moment :

```sh
curl -fsSL https://raw.githubusercontent.com/molivierbergeron/Marstoy/refs/heads/claude/marstoy-iphone-lego-images-r7u3nd/scripts/try-browser.sh | bash
```

#### Rafraîchir depuis ta machine — une seule commande

Utile dès que la boutique redevient lisible. Colle ceci dans le Terminal,
**depuis n'importe quel dossier** :

```sh
curl -fsSL https://raw.githubusercontent.com/molivierbergeron/Marstoy/refs/heads/claude/marstoy-iphone-lego-images-r7u3nd/scripts/refresh-local.sh | bash
```

Le script clone le dépôt s'il n'existe pas (dans `~/Marstoy`), le met à jour
sinon, construit le catalogue, puis le pousse. Le site se met à jour tout seul
une à deux minutes plus tard.

**Rien à installer** : le build n'utilise que des modules Node natifs, aucun
paquet npm. (`npm ci` n'a rien à faire ici et échouerait hors du dépôt.)

#### Un raccourci sur le Bureau

À installer une fois :

```sh
curl -fsSL https://raw.githubusercontent.com/molivierbergeron/Marstoy/refs/heads/claude/marstoy-iphone-lego-images-r7u3nd/scripts/install-shortcut.sh | bash
```

Pose sur le Bureau un fichier **« Rafraîchir le catalogue Marstoy »**. Un
double-clic ouvre le Terminal et lance le rafraîchissement ; la fenêtre reste
ouverte jusqu'à ce que tu appuies sur une touche. Le raccourci va chercher la
dernière version du script à chaque lancement, donc il n'est jamais à
réinstaller, et retombe sur la copie de `~/Marstoy` s'il n'y a pas de réseau.

Si tu as déjà un clone ailleurs :

```sh
MARSTOY_DIR=~/chemin/vers/Marstoy bash ~/Marstoy/scripts/refresh-local.sh
```

Le script refuse de publier un catalogue dégradé. Trois issues possibles :

| il affiche | ce que ça veut dire |
| --- | --- |
| `✓ N références lues` | la boutique a répondu, le catalogue est publié |
| `✗ marstoy.com n'a rien livré` | le défi bloque aussi ta machine — rien n'est touché, `data/recon.json` dit pourquoi |
| `✗ reparti du catalogue LEGO` | références calculées, sans prix : non publiées |

Attention au piège si tu fais les étapes à la main : quand la boutique refuse,
le build **ne réécrit pas** `site/data/catalog.json` — il préserve l'existant.
Compter ses références renverrait l'ancien chiffre et laisserait croire à une
réussite. C'est `data/recon.json` (`preservedCatalog`) qui dit la vérité sur le
run qui vient d'avoir lieu.

#### Les autres voies

- Demander à Marstoy un flux produits, ou la mise en liste blanche du runner.
- Un **runner auto-hébergé** sur une machine à toi : c'est la version
  automatique du paragraphe ci-dessus, le planning hebdomadaire retrouve son
  sens.
- Rester en mode LEGO calculé (`buildFromLegoIndex`) : on garde la recherche
  par vrai nom et le code à taper chez Marstoy, on perd les prix et la
  certitude que le set est en vente. C'est le repli automatique **quand il n'y
  a aucun catalogue à préserver**, pas un remplacement de données réelles.

---

## Short list et comptes

Chaque set porte une ☆. Un onglet **Ma liste** ne montre que tes favoris, avec
le total de ce que ça coûterait chez Marstoy, le total au prix LEGO, l'économie,
et un bouton d'export pour partager la liste.

Les listes vivent sur un **Cloudflare Worker** (`workers/favoris/`) : c'est ce
qui permet de commencer une short list sur l'iPhone et de la retrouver sur
l'ordinateur.

### Comptes

Une pastille en haut à droite. On la touche, on choisit son prénom — ou on crée
un compte — et une confirmation demande « Te connecter comme X ? ». Refuser
ouvre la liste en **lecture seule**, ce qui permet de regarder celle des autres
sans risquer d'y ajouter quelque chose. Le choix est mémorisé, on ne le refait
plus.

> **Ce n'est pas de la sécurité.** N'importe qui peut choisir n'importe quel
> compte, et l'API n'a aucun contrôle d'accès : les listes sont lisibles et
> modifiables par qui connaît l'adresse du Worker. C'est un garde-fou contre la
> maladresse, conformément au besoin. N'y mets rien de sensible. Un NIP par
> compte serait une vingtaine de lignes de plus.

### Déployer le Worker

Deux chemins. Le premier ne demande **aucun terminal** — tout se fait dans le
navigateur — et c'est celui à suivre si la ligne de commande ne te dit rien.

#### Chemin A — tableau de bord Cloudflare, sans terminal

**1. Compte.** <https://dash.cloudflare.com/sign-up> — courriel et mot de passe,
puis confirme le courriel reçu. Aucune carte bancaire demandée.

**2. Créer l'espace de stockage.** Menu de gauche → **Storage & Databases** →
**KV** → bouton **Create**. Nomme-le `marstoy-favoris`. Valide.

**3. Créer le Worker.** Menu de gauche → **Compute (Workers)** → **Workers &
Pages** → **Create** → onglet **Workers** → **Start with Hello World** →
**Deploy**. Nomme-le `marstoy-favoris`.

**4. Coller le code.** Sur la page du Worker → **Edit code**. Sélectionne tout
ce qu'il y a dans l'éditeur, supprime, et colle le contenu de
[`workers/favoris/src/index.js`](workers/favoris/src/index.js) (bouton *Copy raw
file* sur GitHub). Puis **Deploy**.

**5. Brancher le stockage.** Page du Worker → **Settings** → **Bindings** →
**Add binding** :

| Champ | Valeur |
| --- | --- |
| Type | **KV namespace** |
| Variable name | `FAVORIS` — exactement, en majuscules |
| KV namespace | `marstoy-favoris`, créé à l'étape 2 |

**Deploy** pour appliquer.

C'est le seul branchement nécessaire. Les comptes Marco, Christian et
Marie-Claude sont créés automatiquement au premier accès ; d'autres s'ajoutent
ensuite depuis le site. Pour changer cette liste de départ, la variable
`SEED_USERS` la remplace — elle se règle dans **Settings → Variables and
Secrets**, un écran distinct de « Add a binding ».

**6. Vérifier.** L'adresse du Worker est affichée en haut de sa page
(`https://marstoy-favoris.QUELQUECHOSE.workers.dev`). Ouvre-la en ajoutant
`/api/users` : les trois comptes doivent apparaître.

#### Chemin B — en ligne de commande

```bash
cd workers/favoris
npx wrangler login
npx wrangler kv namespace create FAVORIS   # colle l'id renvoyé dans wrangler.toml
npx wrangler deploy
```

### Dire au site où se trouve le Worker

Dépôt GitHub → **Settings** → **Secrets and variables** → **Actions** → onglet
**Variables** → **New repository variable** :

| Champ | Valeur |
| --- | --- |
| Name | `FAVORIS_API_URL` |
| Value | l'adresse du Worker, **sans barre oblique finale** |

C'est une *variable*, pas un secret : cette adresse est publique de toute façon.
Relance ensuite le workflow.

Sans cette variable, les favoris fonctionnent quand même — ils restent
simplement dans le navigateur de chaque appareil, sans synchronisation.

---

## Développement

```bash
npm test                            # 54 tests, dont l'API des favoris dans workerd
node scripts/build-catalog.mjs      # reconstruit site/data/catalog.json
cd workers/favoris && npx wrangler dev   # l'API des favoris en local
python3 -m http.server -d site 8080     # le site en local
```

### Organisation

| Chemin | Rôle |
| --- | --- |
| `site/` | la PWA publiée sur GitHub Pages |
| `scripts/` | scraper Marstoy, prix, construction du catalogue |
| `workers/favoris/` | l'API des short lists (Cloudflare Worker + KV) |
| `lib/setnum.js` | conversion `M…` → n° LEGO, le cœur du projet |
| `.github/workflows/` | construction et publication automatiques |
| `overrides.json` | corrections manuelles de correspondance |
| `legacy/` | travaux mis de côté, gelés — voir `legacy/README.md` |

## Notes

- Usage personnel. Le proxy renvoie `X-Robots-Tag: noindex` et n'est pas destiné
  à être partagé publiquement — c'est ta clé API derrière.
- Le paiement/checkout d'une boutique se fait souvent sur un domaine tiers : le
  proxy laisse alors partir la navigation, ce qui est le comportement voulu.
- Les données LEGO viennent de [Rebrickable](https://rebrickable.com/). LEGO® est
  une marque du groupe LEGO, qui ne sponsorise ni n'approuve ce projet.
