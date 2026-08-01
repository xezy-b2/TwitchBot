# 🎮 Bot Twitch + Dashboard

Bot Twitch complet en Node.js avec :
- Commandes de base (`!points`, `!give`, `!gamble`, `!leaderboard`, `!uptime`, `!title`, `!game`, `!setgame`, `!settitle`, `!commands`, `!addcommand`, `!delcommand`, `!subathon`, `!addtime`)
- Système de points avec pari (**gamble**) à ratio configurable (60/40, 70/30, ou autre)
- Alertes **follow** et **sub/resub/gift sub/cheer** en temps réel (Twitch EventSub via WebSocket — aucun serveur public requis)
- **Subathon** : timer qui s'allonge automatiquement sur sub/resub/gift/bits, pilotable depuis le dashboard
- Commandes vocales personnalisées (**TTS**) via la Web Speech API du navigateur (gratuit, aucune clé API)
- **Dashboard web** (Express + Socket.io + MongoDB) pour tout gérer sans toucher au code
- 3 overlays prêts à l'emploi pour OBS : alertes, subathon, TTS

---

## 1. Prérequis

- Node.js 18+
- MongoDB (local ou Atlas)
- Un VPS Linux (recommandé, pour tourner 24/7)
- Un compte Twitch pour le bot (peut être ton propre compte ou un compte dédié)

## 2. Créer une application Twitch

1. Va sur https://dev.twitch.tv/console/apps → **Register Your Application**
2. Nom : ce que tu veux
3. **OAuth Redirect URLs** : `http://TON_IP_OU_DOMAINE:3000/auth/twitch/callback`
   (remplace par l'URL réelle de ton VPS)
4. Category : `Chat Bot`
5. Récupère le **Client ID** et génère un **Client Secret**

## 3. Récupérer le token de chat du bot

Va sur https://twitchtokengenerator.com, connecte-toi avec le compte du bot, coche les scopes `chat:read` et `chat:edit`, puis récupère le token (`oauth:xxxxx...`).

## 4. Configuration

```bash
cp .env.example .env
```

Remplis toutes les variables dans `.env` :
- `MONGO_URI` : ton URI MongoDB
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` : depuis l'app Twitch créée à l'étape 2
- `TWITCH_REDIRECT_URI` : doit correspondre EXACTEMENT à celle déclarée sur Twitch
- `TWITCH_BOT_USERNAME` / `TWITCH_BOT_OAUTH_TOKEN` : le compte et le token du bot
- `TWITCH_CHANNEL` : la chaîne à rejoindre (ton pseudo Twitch)
- `DASHBOARD_PASSWORD` : mot de passe pour accéder au dashboard
- `SESSION_SECRET` : une chaîne aléatoire longue

## 5. Installation & lancement

```bash
npm install
npm start
```

Le serveur affiche les liens utiles au démarrage :
```
[Dashboard] Disponible sur http://localhost:3000/dashboard
[Overlay] Alertes  : http://localhost:3000/overlay/alerts.html
[Overlay] Subathon : http://localhost:3000/overlay/subathon.html
[Overlay] TTS      : http://localhost:3000/overlay/tts.html
```

Pour tourner en permanence sur un VPS, utilise **pm2** :
```bash
npm install -g pm2
pm2 start index.js --name twitch-bot
pm2 save
pm2 startup
```

## 6. Connecter ton compte Twitch (obligatoire pour les alertes + setgame)

1. Ouvre le dashboard : `http://TON_IP:3000/dashboard` (login avec `DASHBOARD_PASSWORD`)
2. Clique sur **"Connecter Twitch"** en haut à droite
3. Autorise l'application → tu es redirigé vers le dashboard, les alertes follow/sub et `!setgame`/`!settitle` sont maintenant actifs

> Sans cette étape, le bot répond quand même aux commandes de base et points, mais **les alertes follow/sub ne fonctionneront pas** et `!setgame`/`!settitle` renverront une erreur.

## 7. Ajouter les overlays dans OBS

Dans OBS, ajoute une **source Navigateur (Browser Source)** pour chacun :

| Overlay | URL | Taille conseillée |
|---|---|---|
| Alertes | `http://TON_IP:3000/overlay/alerts.html` | 800x300 |
| Subathon | `http://TON_IP:3000/overlay/subathon.html` | 500x150 |
| TTS (invisible) | `http://TON_IP:3000/overlay/tts.html` | 200x50 |

⚠️ Coche **"Control audio via OBS"** et **"Interagir"** une fois sur la source TTS (certains navigateurs bloquent l'audio tant qu'il n'y a pas eu d'interaction) pour être sûr que le son sorte.

## 8. Utilisation

### Commandes personnalisées (onglet "Commandes" du dashboard)
Tu peux utiliser les variables `{user}`, `{channel}`, `{args}` dans les réponses.
Coche **"Vocale (TTS)"** pour qu'une commande soit aussi lue à voix haute sur l'overlay TTS.

Exemple en chat : `!addcommand discord Rejoins mon Discord : https://discord.gg/xxx`

### Gamble (ratio 60/40, 70/30...)
Dans l'onglet **"Points & Gamble"**, le champ **"Chance de gagner (%)"** définit le ratio :
- `40` → ratio **60/40** (le viewer gagne 40% du temps)
- `30` → ratio **70/30** (le viewer gagne 30% du temps)

En chat : `!gamble 100` ou `!gamble all`

### Subathon
Active-le dans l'onglet **"Subathon"**, configure le temps ajouté par type d'événement (sub, resub, gift, bits), puis démarre le timer. Il s'incrémente automatiquement à chaque sub/gift/cheer reçu, et tu peux aussi ajouter du temps manuellement (`!addtime 10` en chat, ou depuis le dashboard).

## 9. Structure du projet

```
twitch-bot/
├── index.js                  # point d'entrée
├── src/
│   ├── bot/                  # client tmi.js + dispatch des commandes
│   ├── points/                # points + gamble
│   ├── subathon/              # timer subathon
│   ├── twitch/                 # Helix API + EventSub WebSocket
│   ├── models/                 # schémas MongoDB (Mongoose)
│   ├── sockets/                # Socket.io (alertes, TTS, subathon live)
│   └── server/                 # Express : dashboard + API + auth
└── public/
    ├── dashboard/               # interface de gestion
    └── overlay/                  # pages à ajouter dans OBS
```

## 10. Dépannage

- **"Impossible de trouver l'utilisateur Twitch"** au démarrage → vérifie `TWITCH_CHANNEL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.
- **Les alertes ne se déclenchent pas** → vérifie que tu as bien cliqué sur "Connecter Twitch" dans le dashboard (étape 6).
- **`!setgame` renvoie une erreur** → même cause, ou le nom du jeu ne correspond à rien sur Twitch.
- **Le bot ne répond pas dans le chat** → vérifie que `TWITCH_BOT_OAUTH_TOKEN` est valide et commence bien par `oauth:`.
