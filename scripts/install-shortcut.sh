#!/usr/bin/env bash
#
# Pose sur le Bureau un raccourci « Rafraîchir le catalogue Marstoy.command ».
# Un double-clic ouvre le Terminal et lance le rafraîchissement.
#
# À lancer une seule fois :
#   curl -fsSL <url de ce fichier> | bash
#
# macOS traite un fichier .command comme un exécutable : double-clic = Terminal
# qui s'ouvre et exécute son contenu. Rien à installer, aucune application tierce.

set -euo pipefail

BUREAU="${HOME}/Desktop"
RACCOURCI="${BUREAU}/Rafraîchir le catalogue Marstoy.command"
SOURCE='https://raw.githubusercontent.com/molivierbergeron/Marstoy/refs/heads/claude/marstoy-iphone-lego-images-r7u3nd/scripts/refresh-local.sh'

if [ ! -d "$BUREAU" ]; then
  echo "✗ Pas de dossier Bureau dans $HOME — je ne sais pas où poser le raccourci."
  exit 1
fi

cat > "$RACCOURCI" <<COMMANDE
#!/bin/bash
#
# Raccourci de Bureau — rafraîchit le catalogue Marstoy.
# Va chercher la dernière version du script à chaque lancement : les
# corrections arrivent toutes seules, rien à réinstaller ici.

cd "\$HOME"

echo
echo "  Catalogue Marstoy — rafraîchissement"
echo "  ────────────────────────────────────"

SCRIPT="\$(mktemp -t marstoy-refresh)"

# Télécharger d'abord, exécuter ensuite. Un « curl | bash » dont le
# téléchargement échoue ne lance rien *et ne signale rien* : bash reçoit un
# fichier vide et sort avec succès. Le silence passerait pour une réussite.
if curl -fsSL "$SOURCE" -o "\$SCRIPT" && [ -s "\$SCRIPT" ]; then
  bash "\$SCRIPT"
  code=\$?
elif [ -f "\$HOME/Marstoy/scripts/refresh-local.sh" ]; then
  echo
  echo "  ⚠ Téléchargement impossible (pas de réseau ?) — j'utilise la copie"
  echo "    déjà présente dans ~/Marstoy."
  echo
  bash "\$HOME/Marstoy/scripts/refresh-local.sh"
  code=\$?
else
  echo
  echo "  ✗ Impossible de récupérer le script, et aucune copie locale."
  echo "    Vérifie ta connexion Internet, puis réessaie."
  code=1
fi

rm -f "\$SCRIPT"

echo
if [ "\$code" = '0' ]; then
  echo "  Terminé. Tu peux fermer cette fenêtre."
else
  echo "  Ça s'est arrêté avant la fin — le détail est au-dessus."
fi
echo "  (Appuie sur une touche pour fermer.)"
read -n 1 -s
COMMANDE

chmod +x "$RACCOURCI"

echo
echo "✓ Raccourci posé sur ton Bureau :"
echo "    Rafraîchir le catalogue Marstoy"
echo
echo "  Double-clique dessus quand tu veux rafraîchir le catalogue."
echo "  Le Terminal s'ouvrira et te dira ce qui s'est passé."
echo
