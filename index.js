require('dotenv').config();
const http = require('http');
const connectDB = require('./src/config/db');
const createApp = require('./src/server/app');
const { createSocketServer, sendAlert } = require('./src/sockets/io');
const { createBotClient, startPassivePointsLoop } = require('./src/bot/client');
const { attachHandlers: attachCommandHandlers } = require('./src/bot/commandHandler');
const { startEventSub } = require('./src/twitch/eventsub');
const { startFollowPolling } = require('./src/twitch/followPoller');
const { getUserByLogin } = require('./src/twitch/helixClient');
const subathonManager = require('./src/subathon/subathonManager');
const Settings = require('./src/models/Settings');

const CHANNEL = process.env.TWITCH_CHANNEL.toLowerCase();
const PORT = process.env.PORT || 3000;

async function main() {
  await connectDB();

  // S'assure qu'un document Settings existe pour la chaîne
  await Settings.findOneAndUpdate({ channel: CHANNEL }, {}, { upsert: true, setDefaultsOnInsert: true });

  // Récupère l'ID Twitch du broadcaster (nécessaire pour Helix + EventSub)
  const twitchUser = await getUserByLogin(CHANNEL);
  if (!twitchUser) {
    console.error(`[Erreur] Impossible de trouver l'utilisateur Twitch "${CHANNEL}". Vérifie TWITCH_CHANNEL et tes identifiants d'app.`);
    process.exit(1);
  }
  const broadcasterId = twitchUser.id;
  console.log(`[Twitch] Chaîne cible : ${CHANNEL} (id: ${broadcasterId})`);

  // --- Serveur HTTP + Express + Socket.io ---
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  subathonManager.init(io);

  // --- Bot Twitch (tmi.js) ---
  const client = createBotClient();
  await client.connect();
  attachCommandHandlers(client, io, broadcasterId);
  startPassivePointsLoop(CHANNEL);

  // --- EventSub (follow / sub / resub / gift sub / cheer) ---
  async function handleTwitchEvent(type, data) {
    const settings = await Settings.findOne({ channel: CHANNEL });
    let chatMessage = null;

    if (type === 'follow') {
      chatMessage = settings.alerts.followMessage.replace('{user}', data.user);
    } else if (type === 'sub') {
      chatMessage = settings.alerts.subMessage.replace('{user}', data.user).replace('{tier}', data.tier);
      if (settings.subathon.enabled) {
        const seconds = data.tier === '3' ? settings.subathon.secondsPerSubT3
          : data.tier === '2' ? settings.subathon.secondsPerSubT2
          : settings.subathon.secondsPerSub;
        await subathonManager.addProgress(CHANNEL, { seconds, subs: 1 }, settings);
      }
    } else if (type === 'resub') {
      chatMessage = settings.alerts.resubMessage
        .replace('{user}', data.user)
        .replace('{tier}', data.tier)
        .replace('{months}', data.months);
      if (settings.subathon.enabled) {
        const seconds = data.tier === '3' ? settings.subathon.secondsPerSubT3
          : data.tier === '2' ? settings.subathon.secondsPerSubT2
          : settings.subathon.secondsPerSub;
        await subathonManager.addProgress(CHANNEL, { seconds, subs: 1 }, settings);
      }
    } else if (type === 'giftsub') {
      chatMessage = settings.alerts.giftSubMessage
        .replace('{user}', data.user)
        .replace('{recipient}', `${data.total} viewer(s)`);
      if (settings.subathon.enabled) {
        await subathonManager.addProgress(
          CHANNEL,
          { seconds: settings.subathon.secondsPerGiftSub * data.total, subs: data.total },
          settings
        );
      }
    } else if (type === 'cheer') {
      chatMessage = settings.alerts.cheerMessage.replace('{user}', data.user).replace('{bits}', data.bits);
      if (settings.subathon.enabled) {
        const units = Math.floor(data.bits / 100);
        const seconds = units > 0 ? settings.subathon.secondsPer100Bits * units : 0;
        await subathonManager.addProgress(CHANNEL, { seconds, bits: data.bits }, settings);
      }
    }

    sendAlert(io, type, data); // notifie l'overlay (animation + son)
    if (chatMessage) client.say(`#${CHANNEL}`, chatMessage);
  }

  async function restartEventSub() {
    await startEventSub(CHANNEL, broadcasterId, handleTwitchEvent);
    await startFollowPolling(CHANNEL, broadcasterId, (data) => handleTwitchEvent('follow', data));
  }
  app.locals.restartEventSub = restartEventSub;

  // Démarre EventSub + le polling des follows immédiatement si un token existe déjà en base
  const TwitchToken = require('./src/models/TwitchToken');
  const existingToken = await TwitchToken.findOne({ channel: CHANNEL });
  if (existingToken) {
    await restartEventSub();
  } else {
    console.log('[EventSub] Aucun token Twitch trouvé. Connecte le compte depuis le dashboard (/dashboard) pour activer les alertes follow/sub.');
  }

  server.listen(PORT, () => {
    console.log(`[Dashboard] Disponible sur http://localhost:${PORT}/dashboard`);
    console.log(`[Overlay] Alertes  : http://localhost:${PORT}/overlay/alerts.html`);
    console.log(`[Overlay] Subathon : http://localhost:${PORT}/overlay/subathon.html`);
    console.log(`[Overlay] TTS      : http://localhost:${PORT}/overlay/tts.html`);
  });
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
