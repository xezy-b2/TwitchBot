const Command = require('../models/Command');
const { getPoints, transferPoints, getLeaderboard } = require('../points/pointsManager');
const { gamble } = require('../points/gamble');
const { getStreamByLogin, getChannelInfo, setChannelGame, setChannelTitle, createClip, getClipInfo, getUserByLogin, getFollowDate } = require('../twitch/helixClient');
const { sendClipToDiscord } = require('../discord/discordWebhook');
const subathonManager = require('../subathon/subathonManager');
const statsManager = require('../points/statsManager');

const lastClipAt = new Map(); // channel -> timestamp, cooldown global pour éviter le spam
const CLIP_COOLDOWN_MS = 60 * 1000;

const lastFcAt = new Map(); // "channel:username" -> timestamp
const FC_COOLDOWN_MS = 15 * 1000;

/**
 * Chaque commande reçoit un contexte : { client, channel, tags, args, settings, broadcasterId, io }
 * et doit renvoyer une string à envoyer dans le chat (ou null pour ne rien dire).
 */
const builtins = {
  // --- Points ---
  async points(ctx) {
    const target = ctx.args[0]?.replace('@', '') || ctx.tags.username;
    const pts = await getPoints(ctx.channel, target);
    return `${target} a ${pts} ${ctx.settings.pointsName}.`;
  },

  async give(ctx) {
    const target = ctx.args[0]?.replace('@', '');
    const amount = parseInt(ctx.args[1], 10);
    if (!target || !Number.isInteger(amount) || amount <= 0) {
      return `Utilisation : !give @pseudo montant`;
    }
    const result = await transferPoints(ctx.channel, ctx.tags.username, target, amount);
    if (!result.ok) return result.error;
    return `${ctx.tags.username} a donné ${amount} ${ctx.settings.pointsName} à ${target} !`;
  },

  async gamble(ctx) {
    const amountArg = ctx.args[0];
    if (!amountArg) return `Utilisation : !gamble montant (ou "all")`;
    const result = await gamble(ctx.channel, ctx.tags.username, amountArg, ctx.settings);
    if (!result.ok) return result.error;
    if (result.won) {
      return `🎉 ${ctx.tags.username} a gagné son pari et remporte ${result.amount} ${ctx.settings.pointsName} ! Nouveau solde : ${result.newBalance}.`;
    }
    return `💀 ${ctx.tags.username} a perdu ${result.amount} ${ctx.settings.pointsName}. Nouveau solde : ${result.newBalance}.`;
  },

  async leaderboard(ctx) {
    const top = await getLeaderboard(ctx.channel, 5);
    if (top.length === 0) return `Aucun classement pour le moment.`;
    const list = top.map((u, i) => `${i + 1}. ${u.username} (${u.points})`).join(' | ');
    return `🏆 Classement ${ctx.settings.pointsName} : ${list}`;
  },

  // --- Info stream ---
  async uptime(ctx) {
    const stream = await getStreamByLogin(ctx.channel);
    if (!stream) return `${ctx.channel} n'est pas en live actuellement.`;
    const startedAt = new Date(stream.started_at);
    const diffMs = Date.now() - startedAt.getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${ctx.channel} est en live depuis ${h}h${m.toString().padStart(2, '0')}.`;
  },

  async title(ctx) {
    const info = await getChannelInfo(ctx.broadcasterId);
    return info ? `Titre actuel : ${info.title}` : `Impossible de récupérer le titre.`;
  },

  async game(ctx) {
    const info = await getChannelInfo(ctx.broadcasterId);
    return info ? `Jeu/catégorie actuel : ${info.game_name}` : `Impossible de récupérer le jeu.`;
  },

  async setgame(ctx) {
    if (!['moderator', 'broadcaster'].includes(ctx.userLevel)) {
      return `Seuls les modérateurs peuvent changer le jeu.`;
    }
    const gameName = ctx.args.join(' ');
    if (!gameName) return `Utilisation : !setgame Nom du jeu`;
    const result = await setChannelGame(ctx.channel, ctx.broadcasterId, gameName);
    if (!result.ok) return `❌ ${result.error}`;
    return `✅ Jeu changé pour : ${result.game}`;
  },

  async settitle(ctx) {
    if (!['moderator', 'broadcaster'].includes(ctx.userLevel)) {
      return `Seuls les modérateurs peuvent changer le titre.`;
    }
    const title = ctx.args.join(' ');
    if (!title) return `Utilisation : !settitle Nouveau titre`;
    const result = await setChannelTitle(ctx.channel, ctx.broadcasterId, title);
    if (!result.ok) return `❌ ${result.error}`;
    return `✅ Titre mis à jour : ${title}`;
  },

  // --- Commandes personnalisées (gestion) ---
  async commands(ctx) {
    const cmds = await Command.find({ channel: ctx.channel, enabled: true }).lean();
    if (cmds.length === 0) return `Aucune commande personnalisée pour le moment.`;
    const list = cmds.map((c) => `${ctx.settings.prefix}${c.name}`).join(', ');
    return `Commandes disponibles : ${list}`;
  },

  async addcommand(ctx) {
    if (!['moderator', 'broadcaster'].includes(ctx.userLevel)) {
      return `Seuls les modérateurs peuvent ajouter des commandes.`;
    }
    const name = ctx.args[0]?.replace(ctx.settings.prefix, '').toLowerCase();
    const response = ctx.args.slice(1).join(' ');
    const isVoice = ctx.rawArgs.includes('--voice');
    if (!name || !response) return `Utilisation : !addcommand nomdelacommande Le texte de réponse`;

    await Command.findOneAndUpdate(
      { channel: ctx.channel, name },
      { channel: ctx.channel, name, response, isVoice },
      { upsert: true, new: true }
    );
    return `✅ Commande !${name} ajoutée${isVoice ? ' (vocale/TTS)' : ''}.`;
  },

  async delcommand(ctx) {
    if (!['moderator', 'broadcaster'].includes(ctx.userLevel)) {
      return `Seuls les modérateurs peuvent supprimer des commandes.`;
    }
    const name = ctx.args[0]?.replace(ctx.settings.prefix, '').toLowerCase();
    if (!name) return `Utilisation : !delcommand nomdelacommande`;
    const res = await Command.findOneAndDelete({ channel: ctx.channel, name });
    return res ? `🗑️ Commande !${name} supprimée.` : `Commande !${name} introuvable.`;
  },

  // --- Subathon ---
  async subathon(ctx) {
    const state = await subathonManager.getState(ctx.channel);
    if (!state.isRunning && state.secondsRemaining <= 0) return `Aucun subathon en cours.`;
    const h = Math.floor(state.secondsRemaining / 3600);
    const m = Math.floor((state.secondsRemaining % 3600) / 60);
    const s = state.secondsRemaining % 60;
    return `⏱️ Subathon : ${h}h${m.toString().padStart(2, '0')}m${s.toString().padStart(2, '0')}s restantes${state.isRunning ? '' : ' (en pause)'}.`;
  },

  async addtime(ctx) {
    if (!['moderator', 'broadcaster'].includes(ctx.userLevel)) {
      return `Seuls les modérateurs peuvent ajouter du temps.`;
    }
    const minutes = parseInt(ctx.args[0], 10);
    if (!Number.isInteger(minutes)) return `Utilisation : !addtime minutes`;
    await subathonManager.addSeconds(ctx.channel, minutes * 60, ctx.settings);
    return `✅ ${minutes} minute(s) ajoutée(s) au subathon.`;
  },

  // --- Clips (création + envoi automatique sur Discord) ---
  async clip(ctx) {
    const now = Date.now();
    const last = lastClipAt.get(ctx.channel) || 0;
    if (now - last < CLIP_COOLDOWN_MS) {
      const remaining = Math.ceil((CLIP_COOLDOWN_MS - (now - last)) / 1000);
      return `⏳ Un clip vient d'être créé, réessaie dans ${remaining}s.`;
    }
    lastClipAt.set(ctx.channel, now);

    const result = await createClip(ctx.channel, ctx.broadcasterId);
    if (!result.ok) return `❌ Impossible de créer le clip : ${result.error}`;

    const clipUrl = `https://clips.twitch.tv/${result.id}`;
    const clipper = ctx.tags['display-name'] || ctx.tags.username;

    // Le clip met quelques secondes à être traité côté Twitch avant d'avoir sa miniature.
    setTimeout(async () => {
      try {
        const [clipInfo, channelInfo] = await Promise.all([
          getClipInfo(result.id),
          getChannelInfo(ctx.broadcasterId)
        ]);
        await sendClipToDiscord(ctx.settings.discord, {
          clipper,
          broadcaster: ctx.channel,
          game: channelInfo?.game_name || '',
          title: channelInfo?.title || '',
          clipUrl,
          thumbnailUrl: clipInfo?.thumbnail_url || null
        });
      } catch (err) {
        console.error('[Clip] Erreur envoi Discord différé :', err.message);
      }
    }, 8000);

    return `🎬 Clip créé par ${clipper} : ${clipUrl}`;
  },

  // --- Stats viewers (temps regardé / messages, par période) ---
  async myuptime(ctx) {
    const target = ctx.args[0]?.replace('@', '') || ctx.tags.username;
    const stats = await statsManager.getOrCreateUserStats(ctx.channel, target);

    const fmt = (minutes, messages) => {
      const hours = minutes / 60;
      const perHour = hours > 0 ? (messages / hours).toFixed(1) : '0';
      return `${minutes}m (${messages} msg (${perHour}msg/h))`;
    };

    return `⏱ ${target} [Semaine] ${fmt(stats.weekMinutes, stats.weekMessages)} [Mois] ${fmt(stats.monthMinutes, stats.monthMessages)} [Global] ${fmt(stats.allTimeMinutes, stats.allTimeMessages)}`;
  },

  // --- Date de follow d'un viewer précis ---
  async fc(ctx) {
    const key = `${ctx.channel}:${ctx.tags.username}`;
    const now = Date.now();
    const last = lastFcAt.get(key) || 0;
    if (now - last < FC_COOLDOWN_MS) return null; // cooldown silencieux, pas de message
    lastFcAt.set(key, now);

    const target = (ctx.args[0]?.replace('@', '') || ctx.tags.username).toLowerCase();

    const targetUser = await getUserByLogin(target);
    if (!targetUser) return `Utilisateur "${target}" introuvable.`;

    const followedAt = await getFollowDate(ctx.channel, ctx.broadcasterId, targetUser.id);
    if (!followedAt) return `👤 ${target} ne suit pas encore la chaîne.`;

    const followDate = new Date(followedAt);
    const days = Math.floor((Date.now() - followDate.getTime()) / (1000 * 60 * 60 * 24));

    const dateStr = followDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = followDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    return `👤 ${target} : Dernier follow le ${dateStr} ${timeStr} (${days} Jour(s))`;
  }
};

module.exports = builtins;
