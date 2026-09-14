#!/usr/bin/env bash
#
# Rafraîchit le catalogue depuis une machine personnelle.
#
# Depuis le 11 septembre 2026, Cloudflare sert un défi JavaScript devant
# marstoy.com et les runners GitHub ne le passent pas. Une connexion domestique,
# elle, passe. Ce script fait donc chez toi ce que le workflow ne peut plus
# faire : lire la boutique, reconstruire le catalogue, et le publier.
#
# Il se lance de n'importe où, y compris sans clone préalable :
#
#   bash refresh-local.sh
#
# Rien à installer : le build n'utilise que des modules Node natifs.

set -euo pipefail

DEPOT="${MARSTOY_DIR:-$HOME/Marstoy}"
URL='https://github.com/molivierbergeron/Marstoy.git'
BRANCHE='claude/marstoy-iphone-lego-images-r7u3nd'

echo
echo "▸ Catalogue Marstoy — rafraîchissement local"
echo

# --- Vérifications, avant de faire perdre du temps -------------------------

if ! command -v node > /dev/null 2>&1; then
  echo "✗ Node.js est introuvable."
  echo "  Installe-le depuis https://nodejs.org (version 20 ou plus), puis relance."
  exit 1
fi

version_majeure=$(node -p 'process.versions.node.split(".")[0]')
if [ "$version_majeure" -lt 20 ]; then
  echo "✗ Node.js $(node -v) est trop ancien — il faut la version 20 ou plus."
  exit 1
fi

if ! command -v git > /dev/null 2>&1; then
  echo "✗ git est introuvable. Lance « xcode-select --install », puis relance."
  exit 1
fi

# --- Le dépôt --------------------------------------------------------------

if [ -d "$DEPOT/.git" ]; then
  echo "▸ Dépôt trouvé dans $DEPOT — mise à jour"
  cd "$DEPOT"
  git fetch --quiet origin "$BRANCHE"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "  ⚠ Des modifications locales sont en cours : je ne touche à rien d'autre."
  else
    git checkout --quiet "$BRANCHE"
    git merge --ff-only --quiet "origin/$BRANCHE" || {
      echo "  ⚠ La branche locale a divergé. Règle-la à la main, puis relance."
      exit 1
    }
  fi
else
  echo "▸ Aucun dépôt dans $DEPOT — clonage"
  git clone --quiet --branch "$BRANCHE" "$URL" "$DEPOT"
  cd "$DEPOT"
fi

# --- Le build --------------------------------------------------------------

echo
echo "▸ Construction du catalogue (~3 minutes : Marstoy, puis Rebrickable)"
echo
if ! node scripts/build-catalog.mjs; then
  echo
  echo "✗ Le build s'est arrêté en erreur — voir le message ci-dessus."
  echo "  Le catalogue publié n'a pas été touché."
  exit 1
fi

# --- Qu'est-ce qu'on a obtenu ? -------------------------------------------
#
# Attention au piège : quand la boutique refuse, le build *ne réécrit pas*
# site/data/catalog.json — il préserve l'existant. Compter ses références
# renverrait donc l'ancien chiffre et annoncerait une réussite imaginaire.
# C'est le rapport du run qui dit la vérité sur ce run-ci.

verdict=$(node -p "
  const recon = require('./data/recon.json');
  if (recon.preservedCatalog) 'bloque';
  else if ((require('./site/data/catalog.json').counts.resolved ?? 0) === 0) 'repli';
  else 'ok';
")

echo
if [ "$verdict" = 'bloque' ]; then
  echo "✗ marstoy.com n'a rien livré, même depuis cette machine."
  echo
  echo "  Le catalogue publié n'a pas été touché — rien n'est cassé, rien n'est perdu."
  echo "  Ce que la boutique a répondu :"
  node -p "
    const r = require('./data/recon.json');
    const b = r.samples?.blockedResponse;
    '    ' + (r.attempts || []).map((a) => (a.url || a.strategy) + ' → ' + a.status).join('\n    ') +
      (b ? '\n    bloqueur : ' + b.server + (b.body?.includes('Just a moment') ? ' (défi JavaScript)' : '') : '');
  "
  echo
  echo "  Le rapport complet est dans $DEPOT/data/recon.json — envoie-le moi."
  exit 1
fi

if [ "$verdict" = 'repli' ]; then
  echo "✗ La boutique n'a rien livré et le build est reparti du catalogue LEGO."
  echo "  Ces références sont calculées, sans prix : on ne publie pas ça."
  echo "  Rien n'a été envoyé. Le rapport est dans $DEPOT/data/recon.json."
  exit 1
fi

echo "✓ $(node -p "require('./site/data/catalog.json').counts.resolved") références lues sur la boutique."
echo

# --- Publication -----------------------------------------------------------

git add data site/data
if git diff --cached --quiet; then
  echo "▸ Le catalogue est déjà à jour : rien à publier."
  exit 0
fi

git commit --quiet -m 'Rafraîchit le catalogue Marstoy depuis une machine locale'

echo "▸ Envoi vers GitHub"
if ! git push --quiet origin "$BRANCHE"; then
  echo
  echo "✗ Le push a échoué — c'est presque toujours l'authentification GitHub."
  echo "  Le catalogue est construit et commité localement, rien n'est perdu."
  echo "  Installe GitHub CLI puis identifie-toi :"
  echo "      brew install gh && gh auth login"
  echo "  puis relance ce script : il reprendra là où il s'est arrêté."
  exit 1
fi

echo
echo "✓ Publié. Le site se met à jour tout seul dans 1 à 2 minutes."
echo "  https://molivierbergeron.github.io/Marstoy/"
echo
