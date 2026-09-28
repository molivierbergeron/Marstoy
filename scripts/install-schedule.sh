#!/usr/bin/env bash
#
# Remet le rafraîchissement du catalogue en automatique — sur ce Mac.
#
# Le workflow GitHub ne peut plus lire marstoy.com : Cloudflare défie tout ce
# qui n'est pas un navigateur, et un runner n'a pas de session graphique. La
# collecte doit donc tourner là où un Chrome peut s'ouvrir, c'est-à-dire ici.
#
# On installe un LaunchAgent : le planificateur de macOS, dans la session de
# l'utilisateur — ce qui est indispensable, un service système n'aurait pas
# d'écran où ouvrir Chrome. Si le Mac dort à l'heure dite, launchd lance la
# tâche au réveil plutôt que de sauter la semaine.
#
#   bash install-schedule.sh              # installe (lundi 9 h 17)
#   JOUR=3 HEURE=20 bash install-schedule.sh   # mercredi 20 h 00
#   bash install-schedule.sh --remove     # désinstalle
#
# Rien n'est envoyé à GitHub par ce script : il se contente de programmer
# refresh-local.sh, qui pousse lui-même quand la collecte aboutit.

set -euo pipefail

DEPOT="${MARSTOY_DIR:-$HOME/Marstoy}"
URL='https://github.com/molivierbergeron/Marstoy.git'
BRANCHE='claude/marstoy-iphone-lego-images-r7u3nd'

ETIQUETTE='com.marstoy.refresh'
PLIST="$HOME/Library/LaunchAgents/$ETIQUETTE.plist"
JOURNAL="$DEPOT/refresh.log"

# Lundi 9 h 17 par défaut : la boutique bouge peu, et l'heure évite le creux de
# la nuit où un portable est fermé. 0 = dimanche.
JOUR="${JOUR:-1}"
HEURE="${HEURE:-9}"
MINUTE="${MINUTE:-17}"

JOURS=(dimanche lundi mardi mercredi jeudi vendredi samedi)

# --- Désinstallation -------------------------------------------------------

if [ "${1:-}" = '--remove' ]; then
  if [ -f "$PLIST" ]; then
    launchctl bootout "gui/$(id -u)/$ETIQUETTE" 2> /dev/null ||
      launchctl unload "$PLIST" 2> /dev/null || true
    rm -f "$PLIST"
    echo "✓ Rafraîchissement automatique désinstallé."
    echo "  Le raccourci du Bureau et le dépôt restent en place."
  else
    echo "Rien à désinstaller : aucun rafraîchissement automatique n'est en place."
  fi
  exit 0
fi

echo
echo "▸ Rafraîchissement automatique du catalogue"
echo

if [ "$(uname)" != 'Darwin' ]; then
  echo "✗ Ce script installe un LaunchAgent : il est propre à macOS."
  exit 1
fi

# --- Le dépôt --------------------------------------------------------------

if [ ! -d "$DEPOT/.git" ]; then
  echo "▸ Aucun dépôt dans $DEPOT — clonage"
  git clone --quiet --branch "$BRANCHE" "$URL" "$DEPOT"
fi

if [ ! -f "$DEPOT/scripts/refresh-local.sh" ]; then
  echo "✗ $DEPOT/scripts/refresh-local.sh est introuvable."
  echo "  Repars d'un clone neuf : rm -rf $DEPOT puis relance."
  exit 1
fi

# --- Le PATH, qui est le piège habituel ------------------------------------
#
# launchd ne donne presque rien : sans ça, `node` et `git` sont introuvables et
# la tâche échoue chaque semaine en silence. On inscrit donc les dossiers réels
# des outils de cette machine, pas une liste devinée.

CHEMINS=''
ajouter() {
  case ":$CHEMINS:" in
    *":$1:"*) ;;
    *) CHEMINS="${CHEMINS:+$CHEMINS:}$1" ;;
  esac
}

for outil in node git npm; do
  emplacement=$(command -v "$outil" 2> /dev/null) || {
    echo "✗ $outil est introuvable. Installe-le, puis relance."
    exit 1
  }
  ajouter "$(dirname "$emplacement")"
done
for defaut in /usr/bin /bin /usr/sbin /sbin; do ajouter "$defaut"; done

# --- Le LaunchAgent --------------------------------------------------------

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_FIN
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ETIQUETTE</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DEPOT/scripts/refresh-local.sh</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$CHEMINS</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>MARSTOY_DIR</key>
    <string>$DEPOT</string>
  </dict>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>$JOUR</integer>
    <key>Hour</key>
    <integer>$HEURE</integer>
    <key>Minute</key>
    <integer>$MINUTE</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>$JOURNAL</string>
  <key>StandardErrorPath</key>
  <string>$JOURNAL</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST_FIN

# Recharger plutôt qu'empiler : une deuxième installation ne doit pas donner
# deux tâches qui se marchent dessus.
launchctl bootout "gui/$(id -u)/$ETIQUETTE" 2> /dev/null ||
  launchctl unload "$PLIST" 2> /dev/null || true

if ! launchctl bootstrap "gui/$(id -u)" "$PLIST" 2> /dev/null; then
  launchctl load "$PLIST"
fi

echo "✓ Le catalogue se rafraîchira tout seul chaque ${JOURS[$JOUR]} à ${HEURE}h$(printf '%02d' "$MINUTE")."
echo
echo "  Une fenêtre Chrome s'ouvrira le temps de la collecte — c'est elle qui"
echo "  passe le contrôle Cloudflare, elle ne peut pas être évitée."
echo
echo "  Si le Mac dort à cette heure-là, la tâche se lance au réveil."
echo "  Journal : $JOURNAL"
echo
echo "  Lancer tout de suite pour vérifier :  launchctl start $ETIQUETTE"
echo "  Arrêter l'automatisation           :  bash $DEPOT/scripts/install-schedule.sh --remove"
echo
