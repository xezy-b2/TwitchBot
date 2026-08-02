const Settings = require('../models/Settings');
const Command = require('../models/Command');
const builtins = require('./builtinCommands');
const { getUserLevel, hasPermission, trackChatter, markChatActivity } = require('./client');
const { sendTTS, sendAlert, sendSound } = require('../sockets/io');

const cooldowns = new Map(); // clé: "channel:command:username" -> timestamp

async function getSettings(channel) {
  channel = channel.toLowerCase();
  let settings = await Settings.findOne({ channel });
  if (!settings) settings = await Settings.create({ channel });
  return settings;
}

function isOnCooldown(channel, commandName, username, cooldownSeconds) {
  const key = `${channel}:${commandName}:${username}`;
  const last = cooldowns.get(key) || 0;
  const now = Date.now();
  if (now - last < cooldownSeconds * 1000) return true;
  cooldowns.set(key, now);
  return false;
}

/** Remplace les placeholders {user} {channel} {args} dans une réponse de commande. */
function fillPlaceholders(template, ctx) {
  return template
    .replace(/{user}/g, ctx.tags['display-name'] || ctx.tags.username)
    .replace(/{channel}/g, ctx.channel)
    .replace(/{args}/g, ctx.args.join(' '));
}

function attachHandlers(client, io, broadcasterId) {
  client.on('message', async (channelRaw, tags, message, self) => {
    if (self) return;
    const channel = channelRaw.replace('#', '').toLowerCase();
    trackChatter(tags.username);
    markChatActivity();

    const settings = await getSettings(channel);
    const prefix = settings.prefix || '!';
    if (!message.startsWith(prefix)) return;

    const rawArgs = message.slice(prefix.length).trim();
    const [commandName, ...args] = rawArgs.split(' ');
    const name = commandName.toLowerCase();
    const userLevel = getUserLevel(tags, channelRaw);

    const ctx = {
      client,
      channel,
      tags,
      args,
      rawArgs,
      settings,
      broadcasterId,
      userLevel,
      io
    };

    try {
      if (builtins[name]) {
        const reply = await builtins[name](ctx);
        if (reply) client.say(channelRaw, reply);
        return;
      }

      // Commande personnalisée en base
      const custom = await Command.findOne({ channel, name, enabled: true });
      if (!custom) return;

      if (!hasPermission(userLevel, custom.userLevel)) return;
      if (custom.restrictedToUser && tags.username.toLowerCase() !== custom.restrictedToUser) return;
      if (isOnCooldown(channel, name, tags.username, custom.cooldown)) return;

      const text = fillPlaceholders(custom.response, ctx);

      // Plusieurs sons possibles ? On en choisit un au hasard. Repli sur l'ancien
      // champ soundUrl (une seule commande son) pour les commandes créées avant cet ajout.
      const soundList = custom.soundUrls?.length > 0
        ? custom.soundUrls
        : (custom.soundUrl ? [custom.soundUrl] : []);

      if (soundList.length > 0) {
        const chosenSound = soundList[Math.floor(Math.random() * soundList.length)];
        // Soundboard : joue le MP3 associé sur l'overlay, sans message dans le chat
        sendSound(io, chosenSound, custom.volume);
      } else if (custom.isVoice) {
        // Commande vocale : lue par l'overlay TTS, sans message dans le chat
        sendTTS(io, text);
      } else {
        client.say(channelRaw, text);
      }
    } catch (err) {
      console.error(`[Bot] Erreur commande "${name}" :`, err.message);
    }
  });
}

module.exports = { attachHandlers, getSettings };
