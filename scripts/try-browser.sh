#!/usr/bin/env bash
#
# Installe Playwright dans le dépôt, puis vérifie si un vrai navigateur passe le
# défi Cloudflare de marstoy.com.
#
# Un seul essai, quelques minutes, et une réponse nette. Rien n'est collecté,
# rien n'est publié : on cherche uniquement à savoir si la porte s'ouvre.
#
#   bash try-browser.sh
#
# Le téléchargement pèse ~150 Mo (un Chromium dédié) et reste dans le dépôt.
# Pour tout effacer ensuite : rm -rf ~/Marstoy/node_modules

set -euo pipefail

DEPOT="${MARSTOY_DIR:-$HOME/Marstoy}"

echo
echo "▸ Le défi Cloudflare cède-t-il devant un vrai navigateur ?"
echo

if [ ! -d "$DEPOT/.git" ]; then
  echo "✗ Pas de dépôt dans $DEPOT."
  echo "  Lance d'abord le rafraîchissement habituel, qui le clonera."
  exit 1
fi

cd "$DEPOT"
git fetch --quiet origin claude/marstoy-iphone-lego-images-r7u3nd || true
git merge --ff-only --quiet origin/claude/marstoy-iphone-lego-images-r7u3nd 2> /dev/null || true

if [ ! -d node_modules/playwright ]; then
  echo "▸ Installation de Playwright (~150 Mo, quelques minutes)"
  echo
  npm install --no-save --no-audit --no-fund playwright
  echo
  echo "▸ Téléchargement du navigateur"
  echo
  npx playwright install chromium
fi

echo
node scripts/probe-browser.mjs
