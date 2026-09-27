#!/bin/bash
# ==============================================================
# À LANCER UNE SEULE FOIS, à la racine du dossier twitch-bot.
#
# Avant de lancer ce script :
#  1. Va sur https://github.com/new
#  2. Choisis un nom (ex: twitch-bot), laisse-le en "Private" si tu veux
#  3. NE COCHE RIEN (pas de README, pas de .gitignore, pas de licence)
#  4. Clique "Create repository"
#  5. Copie l'URL du repo (bouton vert "Code" > HTTPS), ex :
#     https://github.com/ton-pseudo/twitch-bot.git
#
# Utilisation :
#   chmod +x setup-git.sh
#   ./setup-git.sh https://github.com/ton-pseudo/twitch-bot.git
# ==============================================================

set -e

REPO_URL="$1"

if [ -z "$REPO_URL" ]; then
  echo "❌ Utilisation : ./setup-git.sh https://github.com/ton-pseudo/twitch-bot.git"
  exit 1
fi

if [ -d ".git" ]; then
  echo "⚠️  Ce dossier est déjà un repo git. Utilise plutôt deploy.sh pour pousser tes changements."
  exit 1
fi

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin "$REPO_URL"
git push -u origin main

echo ""
echo "✅ Projet poussé sur GitHub : $REPO_URL"
echo "Tu peux maintenant connecter ce repo à Render (New + > Web Service)."
echo "Pour les prochains push, utilise : ./deploy.sh \"message de commit\""
