#!/bin/bash
# ==============================================================
# À utiliser à chaque fois que tu veux pousser tes changements sur GitHub
# (et donc déclencher un redéploiement automatique sur Render, si activé).
#
# Utilisation :
#   chmod +x deploy.sh
#   ./deploy.sh "message décrivant ce que tu as changé"
#
# Si tu ne mets pas de message, un message avec la date/heure sera utilisé.
# ==============================================================

set -e

if [ ! -d ".git" ]; then
  echo "❌ Ce dossier n'est pas encore un repo git. Lance d'abord : ./setup-git.sh https://github.com/ton-pseudo/twitch-bot.git"
  exit 1
fi

MSG="${1:-Update $(date '+%Y-%m-%d %H:%M')}"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

git add .

if git diff --cached --quiet; then
  echo "ℹ️  Rien à pousser, aucun changement détecté."
  exit 0
fi

git commit -m "$MSG"
git push origin "$BRANCH"

echo ""
echo "✅ Poussé sur GitHub (branche $BRANCH) avec le message : \"$MSG\""
echo "Si l'auto-deploy est activé sur Render, le redéploiement démarre automatiquement."
