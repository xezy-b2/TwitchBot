require('dotenv').config();
const http = require('http');
const connectDB = require('./src/config/db');
const createApp = require('./src/server/app');
const { createSocketServer, sendAlert } = require('./src/sockets/io');
const { createBotClient, startPassivePointsLoop } = require('./src/bot/client');
const { attachHandlers: attachCommandHandlers } = require('./src/bot/commandHandler');
const { startAutoMessageLoop } = require('./src/bot/autoMessages');
const { startEventSub } = require('./src/twitch/eventsub');
const { startFollowPolling, resetStreamFollowCounter } = require('./src/twitch/followPoller');
const { getUserByLogin, getChannelInfo, getStreamByLogin, getAllSubscribers } = require('./src/twitch/helixClient');
const { startNowPlayingPolling } = require('./src/spotify/nowPlayingPoller');
const achievementTracker = require('./src/steam/achievementTracker');
const subathonManager = require('./src/subathon/subathonManager');
const longTermGoalManager = require('./src/points/longTermGoalManager');
const statsManager = require('./src/points/statsManager');
const Settings = require('./src/models/Settings');
const LastEventState = require('./src/models/LastEventState');

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

  // Statut live initial (utile si le bot redémarre pendant que le stream tourne déjà)
  let isLive = !!(await getStreamByLogin(CHANNEL));

  // --- Serveur HTTP + Express + Socket.io ---
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  app.locals.io = io;
  subathonManager.init(io);
  longTermGoalManager.init(io);

  // --- Bot Twitch (tmi.js) ---
  const client = createBotClient();
  await client.connect();
  attachCommandHandlers(client, io, broadcasterId);
  startPassivePointsLoop(CHANNEL);
  startAutoMessageLoop(CHANNEL, client);

  /** Met à jour l'état persistant "dernier follower / dernier sub" (overlay permanent). */
  async function updateLastEventState(updates) {
    await LastEventState.findOneAndUpdate({ channel: CHANNEL }, updates, { upsert: true });
    io.emit('lastevents:update', updates);
  }

  // --- Hype Train : suivi du niveau + avertissement dynamique 15s avant la fin du délai en cours ---
  let hypeTrainLevel = 0;
  let hypeTrainEndingSoonTimeout = null;

  function scheduleHypeTrainWarning(expiresAt) {
    clearTimeout(hypeTrainEndingSoonTimeout);
    if (!expiresAt) return;
    const msUntilWarning = new Date(expiresAt).getTime() - Date.now() - 15000;
    if (msUntilWarning <= 0) return; // déjà trop tard pour prévenir 15s avant

    hypeTrainEndingSoonTimeout = setTimeout(async () => {
      const settings = await Settings.findOne({ channel: CHANNEL });
      client.say(`#${CHANNEL}`, settings.alerts.hypeTrainEndingSoonMessage);
    }, msUntilWarning);
  }

  // --- EventSub (sub / resub / gift sub / cheer) + polling des follows ---
  async function handleTwitchEvent(type, data) {
    const settings = await Settings.findOne({ channel: CHANNEL });
    let chatMessage = null;

    if (type === 'follow') {
      chatMessage = settings.alerts.followMessage
        .replace('{user}', data.user)
        .replace('{totalFollowers}', data.totalFollowers ?? '?')
        .replace('{followsThisStream}', data.followsThisStream ?? '?');
      await updateLastEventState({ lastFollowerName: data.user, lastFollowerAt: new Date() });
      await longTermGoalManager.recordEvent(CHANNEL, 'follows', 1);
    } else if (type === 'streamonline') {
      isLive = true;
      await resetStreamFollowCounter(CHANNEL);
      return; // pas d'alerte visuelle ni de message de chat pour cet événement technique
    } else if (type === 'streamoffline') {
      isLive = false;
      return; // pas d'alerte visuelle ni de message de chat pour cet événement technique
    } else if (type === 'categorychange') {
      await achievementTracker.refreshForCategory(CHANNEL, data.categoryName, io);
      return; // pas d'alerte visuelle ni de message de chat pour cet événement technique
    } else if (type === 'raid') {
      const raiderInfo = await getChannelInfo(data.raiderBroadcasterId);
      const message = settings.alerts.raidMessage
        .replace(/{raider}/g, data.raider)
        .replace(/{viewers}/g, data.viewers)
        .replace(/{game}/g, raiderInfo?.game_name || '?');
      client.say(`#${CHANNEL}`, message);
      return; // message de chat uniquement, pas d'alerte visuelle/son pour l'instant
    } else if (type === 'hypetrainbegin') {
      hypeTrainLevel = data.level;
      const message = settings.alerts.hypeTrainBeginMessage
        .replace(/{level}/g, data.level)
        .replace(/{goal}/g, data.goal);
      client.say(`#${CHANNEL}`, message);
      scheduleHypeTrainWarning(data.expiresAt);
      return;
    } else if (type === 'hypetrainprogress') {
      if (data.level > hypeTrainLevel) {
        hypeTrainLevel = data.level;
        const message = settings.alerts.hypeTrainLevelUpMessage.replace(/{level}/g, data.level);
        client.say(`#${CHANNEL}`, message);
      }
      scheduleHypeTrainWarning(data.expiresAt);
      return;
    } else if (type === 'hypetrainend') {
      clearTimeout(hypeTrainEndingSoonTimeout);
      hypeTrainLevel = 0;
      const message = settings.alerts.hypeTrainEndMessage
        .replace(/{level}/g, data.level)
        .replace(/{total}/g, data.total)
        .replace(/{topContributor}/g, data.topContributor || '?')
        .replace(/{topContributorTotal}/g, data.topContributorTotal ?? '?');
      client.say(`#${CHANNEL}`, message);
      return;
    } else if (type === 'sub') {
      chatMessage = settings.alerts.subMessage.replace('{user}', data.user).replace('{tier}', data.tier);
      await updateLastEventState({ lastSubName: data.user, lastSubAt: new Date() });
      await longTermGoalManager.recordEvent(CHANNEL, 'subs', 1);
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
      await updateLastEventState({ lastSubName: data.user, lastSubAt: new Date() });
      await longTermGoalManager.recordEvent(CHANNEL, 'subs', 1);
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
      await updateLastEventState({ lastSubName: `${data.user} (cadeau x${data.total})`, lastSubAt: new Date() });
      await longTermGoalManager.recordEvent(CHANNEL, 'subs', data.total);
      if (settings.subathon.enabled) {
        await subathonManager.addProgress(
          CHANNEL,
          { seconds: settings.subathon.secondsPerGiftSub * data.total, subs: data.total },
          settings
        );
      }
    } else if (type === 'cheer') {
      chatMessage = settings.alerts.cheerMessage.replace('{user}', data.user).replace('{bits}', data.bits);
      await longTermGoalManager.recordEvent(CHANNEL, 'bits', data.bits);
      if (settings.subathon.enabled) {
        const units = Math.floor(data.bits / 100);
        const seconds = units > 0 ? settings.subathon.secondsPer100Bits * units : 0;
        await subathonManager.addProgress(CHANNEL, { seconds, bits: data.bits }, settings);
      }
    }

    sendAlert(io, type, data, getAlertSound(settings, type)); // notifie l'overlay (animation + son)
    if (chatMessage) client.say(`#${CHANNEL}`, chatMessage);
  }

  /** Renvoie { soundUrl, soundVolume } pour un type d'alerte, selon les réglages du dashboard. */
  function getAlertSound(settings, type) {
    if (!settings.alerts.soundEnabled) return null;
    const fieldByType = {
      follow: 'followSoundUrl',
      sub: 'subSoundUrl',
      resub: 'resubSoundUrl',
      giftsub: 'giftSubSoundUrl',
      cheer: 'cheerSoundUrl'
    };
    const soundUrl = settings.alerts[fieldByType[type]];
    if (!soundUrl) return null;
    return { soundUrl, soundVolume: settings.alerts.soundVolume };
  }

  async function restartEventSub() {
    await startEventSub(CHANNEL, broadcasterId, handleTwitchEvent);
    await startFollowPolling(CHANNEL, broadcasterId, (data) => handleTwitchEvent('follow', data));
  }
  app.locals.restartEventSub = restartEventSub;

  // Appelé après qu'un compte Spotify vient d'être connecté depuis le dashboard
  app.locals.onSpotifyConnected = async () => {
    startNowPlayingPolling(CHANNEL, io);
  };

  // Démarre EventSub + le polling des follows immédiatement si un token existe déjà en base
  const TwitchToken = require('./src/models/TwitchToken');
  const existingToken = await TwitchToken.findOne({ channel: CHANNEL });
  if (existingToken) {
    await restartEventSub();
  } else {
    console.log('[EventSub] Aucun token Twitch trouvé. Connecte le compte depuis le dashboard (/dashboard) pour activer les alertes follow/sub.');
  }

  // Démarre le polling Spotify immédiatement si un token existe déjà en base
  const SpotifyToken = require('./src/models/SpotifyToken');
  const existingSpotifyToken = await SpotifyToken.findOne({ channel: CHANNEL });
  if (existingSpotifyToken) {
    startNowPlayingPolling(CHANNEL, io);
  } else {
    console.log('[Spotify] Aucun compte connecté. Connecte-le depuis le dashboard pour activer l\'overlay "Now Playing".');
  }

  // Suivi des succès Steam : récupère la catégorie actuelle au démarrage, puis
  // vérifie périodiquement la progression pendant que le jeu tourne.
  const channelInfo = await getChannelInfo(broadcasterId);
  if (channelInfo?.game_name) {
    await achievementTracker.refreshForCategory(CHANNEL, channelInfo.game_name, io);
  }
  achievementTracker.startPeriodicRefresh(CHANNEL, io, async ({ gameName, unlocked, total }) => {
    const settings = await Settings.findOne({ channel: CHANNEL });
    const message = settings.alerts.achievementMessage
      .replace('{game}', gameName || '?')
      .replace('{unlocked}', unlocked)
      .replace('{total}', total);
    client.say(`#${CHANNEL}`, message);
  });

  // --- Stats viewers : temps regardé (uniquement en live) + reset hebdo/mensuel automatique ---
  setInterval(async () => {
    await statsManager.checkAndResetPeriods(CHANNEL);
    if (isLive) await statsManager.tickActiveWatchtime(CHANNEL);
  }, 60 * 1000);

  // --- Synchronisation du statut abonné (toutes les 10 minutes + une fois au démarrage) ---
  async function syncSubs() {
    const token = await TwitchToken.findOne({ channel: CHANNEL });
    if (!token) return;
    await statsManager.syncSubscribers(CHANNEL, broadcasterId, getAllSubscribers);
  }
  await syncSubs();
  setInterval(syncSubs, 10 * 60 * 1000);

  server.listen(PORT, () => {
    console.log(`[Dashboard] Disponible sur http://localhost:${PORT}/dashboard`);
    console.log(`[Overlay] Alertes         : http://localhost:${PORT}/overlay/alerts.html`);
    console.log(`[Overlay] Subathon        : http://localhost:${PORT}/overlay/subathon.html`);
    console.log(`[Overlay] TTS             : http://localhost:${PORT}/overlay/tts.html`);
    console.log(`[Overlay] Dernier follow/sub : http://localhost:${PORT}/overlay/lastevents.html`);
    console.log(`[Overlay] Objectif        : http://localhost:${PORT}/overlay/goal.html`);
    console.log(`[Overlay] Now Playing     : http://localhost:${PORT}/overlay/nowplaying.html`);
    console.log(`[Overlay] Succès Steam    : http://localhost:${PORT}/overlay/achievements.html`);
    console.log(`[Overlay] Stats Viewers   : http://localhost:${PORT}/overlay/viewerstats.html`);
  });
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
