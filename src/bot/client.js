const tmi = require('tmi.js');
const { grantPassivePoints } = require('../points/pointsManager');
const Settings = require('../models/Settings');

const activeChatters = new Set();
let lastChatActivityAt = 0;

function createBotClient() {
  const client = new tmi.Client({
    options: { debug: false },
    identity: {
      username: process.env.TWITCH_BOT_USERNAME,
      password: process.env.TWITCH_BOT_OAUTH_TOKEN
    },
    channels: [process.env.TWITCH_CHANNEL]
  });

  return client;
}

/** Détermine le niveau de permission d'un utilisateur à partir des tags tmi.js. */
function getUserLevel(tags, channel) {
  const username = tags.username?.toLowerCase();
  const channelName = channel.replace('#', '').toLowerCase();

  if (username === channelName) return 'broadcaster';
  if (tags.mod) return 'moderator';
  if (tags.badges?.vip) return 'vip';
  if (tags.subscriber) return 'subscriber';
  return 'everyone';
}

const LEVEL_RANK = { everyone: 0, subscriber: 1, vip: 2, moderator: 3, broadcaster: 4 };

function hasPermission(userLevel, requiredLevel) {
  return LEVEL_RANK[userLevel] >= LEVEL_RANK[requiredLevel];
}

/** Démarre le tracking des points passifs : toutes les X minutes (settings.intervalMinutes), crédite les chatteurs actifs. */
function startPassivePointsLoop(channel) {
  let elapsedMinutes = 0;
  setInterval(async () => {
    elapsedMinutes += 1;
    const settings = await Settings.findOne({ channel: channel.toLowerCase() });
    const intervalMinutes = settings?.intervalMinutes ?? 10;
    if (elapsedMinutes < intervalMinutes) return;
    elapsedMinutes = 0;

    if (activeChatters.size === 0) return;
    const amount = settings?.pointsPerInterval ?? 5;
    await grantPassivePoints(channel, [...activeChatters], amount);
    activeChatters.clear();
  }, 60 * 1000); // vérification chaque minute
}

function trackChatter(username) {
  activeChatters.add(username.toLowerCase());
}

/** Marque le chat comme actif à l'instant présent (appelé à chaque message reçu). */
function markChatActivity() {
  lastChatActivityAt = Date.now();
}

/** Le chat est considéré "actif" si un message a été envoyé dans les X dernières minutes. */
function isChatActive(withinMinutes = 10) {
  return Date.now() - lastChatActivityAt < withinMinutes * 60 * 1000;
}

module.exports = {
  createBotClient,
  getUserLevel,
  hasPermission,
  startPassivePointsLoop,
  trackChatter,
  markChatActivity,
  isChatActive
};
