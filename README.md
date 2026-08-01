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

### Si le catalogue sort vide

Le workflow écrit `data/recon.json` dans le dépôt : il contient les stratégies
tentées, les codes HTTP obtenus et des extraits des réponses de marstoy.com.
C'est fait pour ça — ouvre-le, ou donne-le moi, et on adapte le scraper.

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

### Déployer le Worker (~10 min, gratuit)

```bash
cd workers/favoris
npx wrangler login
npx wrangler kv namespace create FAVORIS     # colle l'id dans wrangler.toml
npx wrangler deploy
```

L'URL affichée à la fin (`https://marstoy-favoris.<sous-domaine>.workers.dev`)
doit ensuite être connue du site :

**Settings → Secrets and variables → Actions → onglet Variables →
`New repository variable`**, nommée `FAVORIS_API_URL`. C'est une *variable*, pas
un secret : cette adresse est publique de toute façon.

Relance ensuite le workflow. Sans cette variable, les favoris fonctionnent
quand même mais restent dans le navigateur de chaque appareil.

Vérifier : `https://marstoy-favoris.<sous-domaine>.workers.dev/api/health`

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
