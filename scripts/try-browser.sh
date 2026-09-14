#!/usr/bin/env bash
#
# Installe Playwright, puis vérifie si un vrai navigateur passe le défi
# Cloudflare de marstoy.com.
#
# Un seul essai, quelques minutes, une réponse nette. Rien n'est collecté, rien
# n'est publié : on cherche uniquement à savoir si la porte s'ouvre.
#
# Se lance de n'importe où, avec ou sans clone préalable :
#   curl -fsSL <url de ce fichier> | bash
#
# Le téléchargement pèse ~150 Mo (un Chromium dédié) et reste dans le dépôt.
# Pour tout effacer ensuite : rm -rf ~/Marstoy/node_modules

set -euo pipefail

DEPOT="${MARSTOY_DIR:-$HOME/Marstoy}"
URL='https://github.com/molivierbergeron/Marstoy.git'
BRANCHE='claude/marstoy-iphone-lego-images-r7u3nd'

echo
echo "▸ Le défi Cloudflare cède-t-il devant un vrai navigateur ?"
echo

for outil in node git npm; do
  if ! command -v "$outil" > /dev/null 2>&1; then
    echo "✗ $outil est introuvable."
    exit 1
  fi
done

# --- Le dépôt, à jour ------------------------------------------------------

if [ -d "$DEPOT/.git" ]; then
  cd "$DEPOT"
  echo "▸ Mise à jour du dépôt"
  git fetch --quiet origin "$BRANCHE"

  # data/ et site/data/ sont entièrement dérivés d'un run : un rafraîchissement
  # précédent les a réécrits, et git refuserait d'avancer par-dessus. Les
  # réaligner ne perd rien — le prochain build les reproduit.
  git checkout --quiet -- data site/data 2> /dev/null || true

  if ! git merge --ff-only --quiet "origin/$BRANCHE" 2> /dev/null; then
    echo "  ⚠ Mise à jour impossible : des modifications locales bloquent."
    echo "    Le plus simple est de repartir d'un clone neuf :"
    echo "        rm -rf $DEPOT"
    echo "    puis relancer cette commande."
    exit 1
  fi
else
  echo "▸ Aucun dépôt dans $DEPOT — clonage"
  git clone --quiet --branch "$BRANCHE" "$URL" "$DEPOT"
  cd "$DEPOT"
fi

if [ ! -f scripts/probe-browser.mjs ]; then
  echo "✗ scripts/probe-browser.mjs est absent après mise à jour."
  echo "  Repars d'un clone neuf : rm -rf $DEPOT puis relance."
  exit 1
fi

# --- Playwright ------------------------------------------------------------

if [ ! -d node_modules/playwright ]; then
  echo
  echo "▸ Installation de Playwright (~150 Mo, quelques minutes)"
  echo
  npm install --no-save --no-audit --no-fund playwright
  echo
  echo "▸ Téléchargement du navigateur"
  echo
  npx --yes playwright install chromium
fi

echo
node scripts/probe-browser.mjs
