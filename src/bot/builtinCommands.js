const Command = require('../models/Command');
const { getPoints, transferPoints, getLeaderboard } = require('../points/pointsManager');
const { gamble } = require('../points/gamble');
const { getStreamByLogin, getChannelInfo, setChannelGame, setChannelTitle } = require('../twitch/helixClient');
const subathonManager = require('../subathon/subathonManager');

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
  }
};

module.exports = builtins;
