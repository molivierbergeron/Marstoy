# marstoy-real

Consulter le catalogue **Marstoy depuis l'iPhone** avec les **vrais noms et les
vraies images des sets LEGO**.

Deux voies, indépendantes — prends celle qui te convient :

| | **A. Site statique** (GitHub Pages) | **B. Proxy live** (Cloudflare Worker) |
|---|---|---|
| À installer | rien | un compte Cloudflare |
| Ce que tu vois | un catalogue à toi, recherche + tri | le vrai marstoy.com, réécrit à la volée |
| Clé Rebrickable | **inutile** | requise (secret du Worker) |
| Panier / commande | lien vers la fiche Marstoy | directement dans le site |
| Mise à jour | hebdomadaire (workflow) | temps réel |

La voie A est la plus simple et ne demande aucune clé : les données LEGO viennent
des **exports publics** de Rebrickable, et la résolution a lieu à la compilation
— le site livré à ton navigateur ne contient donc aucun secret.

Marstoy nomme ses boîtes `M` + les chiffres du set LEGO **à l'envers** :

| Marstoy  | Set LEGO réel |
| -------- | ------------- |
| `M67201` | `10276`       |
| `M29157` | `75192`       |
| `M914`   | `41900`       |

Ce dépôt contient un proxy [Cloudflare Worker](https://workers.cloudflare.com/)
qui affiche marstoy.com en remplaçant à la volée les références par le nom du
set officiel et la photo de la boîte LEGO (source : Rebrickable), tout en
gardant la référence `M…` visible pour pouvoir commander.

**Ta clé Rebrickable reste privée** : elle est stockée comme secret Cloudflare,
utilisée uniquement côté serveur, et n'apparaît ni dans le dépôt ni dans les
pages envoyées à ton navigateur. Un test vérifie qu'elle ne fuite pas dans les
réponses.

---

## Ce que ça donne

```
Avant :  M67201 Building Blocks Set      + photo Marstoy
Après :  Colosseum — LEGO 10276 · M67201 + visuel officiel du 10276
```

Un bouton flottant en bas à droite (`LEGO ✓` / `Marstoy`) permet de repasser à
l'affichage d'origine d'un tap, pratique au moment de commander.

---

## Voie A — le site statique (rien à installer)

Un workflow GitHub va chercher le catalogue Marstoy, le croise avec les exports
Rebrickable, et publie une PWA sur GitHub Pages. Tu l'ajoutes à ton écran
d'accueil et c'est fini.

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
- **Touche une image** pour basculer entre le visuel LEGO officiel et la photo
  Marstoy : de quoi vérifier que c'est bien la même boîte avant de commander.
- **Touche la référence `M…`** pour la copier.
- « Commander » ouvre la fiche produit sur marstoy.com.

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

### Si le catalogue sort vide

Le workflow écrit `data/recon.json` dans le dépôt : il contient les stratégies
tentées, les codes HTTP obtenus et des extraits des réponses de marstoy.com.
C'est fait pour ça — ouvre-le, ou donne-le moi, et on adapte le scraper.

---

## Voie B — le proxy live : tester par étapes

Chaque étape valide une brique de plus. Arrête-toi dès que quelque chose cloche :
tu sauras exactement où.

### Étape 1 — la clé et l'inversion des chiffres (30 s, aucun déploiement)

```bash
npm install
cp .dev.vars.example .dev.vars   # mets ta clé Rebrickable dedans
npm run check M67201 M29157 M914
```

```
✅ M67201 → LEGO 10276 · Colosseum (2020, 9036 pièces)
   image : https://cdn.rebrickable.com/media/sets/10276-1.jpg
   fiche : https://rebrickable.com/sets/10276-1/
```

Prends 3-4 références sur marstoy.com dont tu connais le vrai set et compare.
Un `❌` affiche les candidats essayés ; corrige alors dans `overrides.json`.

### Étape 2 — le proxy sur le vrai marstoy.com (2 min, en local)

```bash
npm run dev      # puis ouvre http://localhost:8787 dans ton navigateur
```

C'est **l'étape qui compte** : elle confronte la réécriture au vrai HTML de la
boutique. Vérifie une page collection (la grille), une fiche produit et la
recherche. Si des vignettes gardent la photo Marstoy alors que le titre est
corrigé, c'est le repérage des cartes produit qu'il faut ajuster
(`CARD_SELECTOR` dans `src/client.js`).

### Étape 3 — sur l'iPhone

`npx wrangler deploy`, puis voir la section suivante.

---

## Installation (≈ 10 min, gratuit)

### 1. Prérequis

- Un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (plan gratuit
  suffisant).
- Une clé API Rebrickable : <https://rebrickable.com/api/> (gratuite).
- Node.js 18+ sur ton ordinateur.

### 2. Déployer

```bash
git clone <ce-dépôt> && cd Marstoy
npm install
npx wrangler login

# La clé est chiffrée chez Cloudflare, jamais écrite dans le dépôt.
npx wrangler secret put REBRICKABLE_API_KEY

# Recommandé : que toi seul puisses utiliser le proxy (donc ta clé).
# Choisis une valeur longue et aléatoire, garde-la.
npx wrangler secret put ACCESS_TOKEN

npx wrangler deploy
```

### 3. Cache partagé (recommandé)

Sans ça le cache est par datacenter Cloudflare, donc plus d'appels Rebrickable.

```bash
npx wrangler kv namespace create MR_CACHE
```

Décommente le bloc `[[kv_namespaces]]` dans `wrangler.toml`, colle l'`id`
renvoyé, puis `npx wrangler deploy`.

### 4. Sur l'iPhone

1. Ouvre `https://marstoy-real.<ton-sous-domaine>.workers.dev/?k=<ACCESS_TOKEN>`
   dans Safari. Le jeton est échangé une fois contre un cookie valable un an ;
   ensuite l'URL nue suffit.
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. Tu navigues normalement : accueil, collections, recherche, fiche produit,
   panier. Tout passe par le proxy.

Vérifier que tout est branché : `https://…workers.dev/__mr/health`

```json
{ "ok": true, "rebrickableKey": true, "kvCache": true, "accessToken": true }
```

---

## Comment ça marche

Deux couches complémentaires, car une boutique moderne rend une partie de son
catalogue en JavaScript :

1. **Côté Worker** (`src/rewrite.js`) — le HTML est réécrit avant envoi :
   textes, `alt`, `<title>`, balises `meta`, images (`<img src>` remplacé par le
   visuel officiel, `<source>` concurrente supprimée). Les réponses JSON
   (recherche Shopify, `products.json`) sont traitées aussi. Le contenu des
   balises `<script>` n'est jamais touché.
2. **Côté page** (`src/client.js`, injecté) — un `MutationObserver` rattrape le
   scroll infini, les résultats de recherche en AJAX et les images sans
   référence dans leurs attributs (on remonte alors à la carte produit parente).
   Il interroge `/__mr/resolve`, qui ne renvoie que des noms et des URLs
   d'images — jamais la clé.

La résolution `M…` → set LEGO (`src/setnum.js`) essaie l'inversion des chiffres,
puis les variantes avec zéros finaux (les zéros que Marstoy supprime en tête de
son numéro inversé), puis la référence non inversée, puis la recherche
plein texte Rebrickable. Quand plusieurs candidats existent réellement, le plus
récent gagne. Tout est mis en cache 60 jours.

### Corriger un cas particulier

Si une référence tombe à côté, force-la dans `overrides.json` :

```json
{
  "M67201": "10276-1",
  "M12345": null
}
```

`null` = ne jamais toucher cette référence. Puis `npx wrangler deploy`.

### Personnaliser l'affichage

`LABEL_FORMAT` dans `wrangler.toml`. Placeholders disponibles : `{name}`,
`{num}`, `{setNum}`, `{code}`, `{year}`, `{parts}`.

```toml
LABEL_FORMAT = "{name} ({year}, {parts} pcs) · {code}"
```

---

## Alternative : userscript (sans proxy)

Si tu préfères naviguer sur le vrai marstoy.com et ne corriger que l'affichage :
installe l'app **Userscripts** (gratuite) dans les extensions Safari de
l'iPhone, puis ajoute `userscript/marstoy-real.user.js` en y renseignant l'URL
de ton Worker. Le script ne contient aucune clé : il demande les noms et images
à ton Worker.

Le proxy reste le chemin le plus simple (rien à installer) et le seul qui
corrige aussi le `<title>` des onglets et les aperçus de partage.

---

## Développement

```bash
cp .dev.vars.example .dev.vars   # ignoré par git, mets ta clé dedans
npm run check M67201             # diagnostic d'une référence, sans déploiement
npm run dev                      # proxy sur http://localhost:8787
npm test                         # tests unitaires + intégration workerd
npm run tail                     # logs du Worker déployé
node scripts/build-catalog.mjs   # reconstruit site/data/catalog.json en local
```

### Organisation

| Chemin | Rôle |
| --- | --- |
| `src/setnum.js` | conversion `M…` → n° LEGO, partagée par les deux voies |
| `src/` (reste) | le Worker proxy (voie B) |
| `scripts/` | scraper Marstoy + build du catalogue statique (voie A) |
| `site/` | la PWA publiée sur GitHub Pages (voie A) |
| `.github/workflows/` | construction et publication automatiques |
| `overrides.json` | corrections manuelles, utilisées par les deux voies |

Les tests d'intégration (`test/worker.test.js`) exécutent le Worker complet dans
workerd via Miniflare, avec un faux marstoy.com et une fausse API Rebrickable :
aucun appel réseau réel, aucune clé nécessaire.

## Notes

- Usage personnel. Le proxy renvoie `X-Robots-Tag: noindex` et n'est pas destiné
  à être partagé publiquement — c'est ta clé API derrière.
- Le paiement/checkout d'une boutique se fait souvent sur un domaine tiers : le
  proxy laisse alors partir la navigation, ce qui est le comportement voulu.
- Les données LEGO viennent de [Rebrickable](https://rebrickable.com/). LEGO® est
  une marque du groupe LEGO, qui ne sponsorise ni n'approuve ce projet.
