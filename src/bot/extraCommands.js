/**
 * Commandes natives supplémentaires (fun, infos, stats, citations, compteurs, utilitaires).
 * Chaque commande est définie avec sa description (affichée dans le dashboard) au même endroit :
 * `define(nom, { group, usage, description, output, userLevel, cooldown }, async (ctx) => "réponse")`.
 */
const Quote = require('../models/Quote');
const Counter = require('../models/Counter');
const { getStreamByLogin, getChannelInfo, getChannelFollowers, getUserByLogin, getFollowDate } = require('../twitch/helixClient');
const statsManager = require('../points/statsManager');

const handlers = {};
const meta = {};

const cooldowns = new Map(); // "commande:channel:user" -> timestamp

/** Enregistre une commande. Le cooldown (secondes, par viewer) est silencieux : pas de message, on ignore juste. */
function define(name, info, fn) {
  const cooldown = info.cooldownSeconds ?? 5;
  meta[name] = {
    group: info.group,
    usage: info.usage,
    description: info.description,
    output: info.output,
    userLevel: info.userLevel || 'everyone',
    ...(cooldown ? { cooldown: `${cooldown} s` } : {})
  };
  handlers[name] = async (ctx) => {
    if (info.userLevel === 'moderator' && !isMod(ctx)) return `Seuls les modérateurs peuvent utiliser cette commande.`;
    if (cooldown && ctx.userLevel !== 'broadcaster') {
      const key = `${name}:${ctx.channel}:${ctx.tags.username}`;
      const now = Date.now();
      if (now - (cooldowns.get(key) || 0) < cooldown * 1000) return null;
      cooldowns.set(key, now);
    }
    return fn(ctx);
  };
}

const isMod = (ctx) => ['moderator', 'broadcaster'].includes(ctx.userLevel);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const display = (ctx) => ctx.tags['display-name'] || ctx.tags.username;
const targetArg = (ctx, i = 0) => ctx.args[i]?.replace('@', '') || null;

/** Durée lisible : "1 an 2 mois 3 jours" (ou heures/minutes pour les durées courtes). */
function humanDuration(ms) {
  const totalDays = Math.floor(ms / 86400000);
  if (totalDays < 1) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  }
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const days = (totalDays % 365) % 30;
  const parts = [];
  if (years) parts.push(`${years} an${years > 1 ? 's' : ''}`);
  if (months) parts.push(`${months} mois`);
  if (days || parts.length === 0) parts.push(`${days} jour${days > 1 ? 's' : ''}`);
  return parts.join(' ');
}

// ============================================================
// FUN
// ============================================================
define('dice', {
  group: 'Fun', usage: '!dice [faces]', cooldownSeconds: 3,
  description: 'Lance un dé (20 faces par défaut, jusqu\'à 1000).',
  output: '« 🎲 Pseudo lance un d20 : 14 »'
}, (ctx) => {
  const faces = Math.min(1000, Math.max(2, parseInt(ctx.args[0], 10) || 20));
  return `🎲 ${display(ctx)} lance un d${faces} : ${randInt(1, faces)}`;
});

define('random', {
  group: 'Fun', usage: '!random [min] [max]', cooldownSeconds: 3,
  description: 'Tire un nombre au hasard (entre 1 et 100 par défaut).',
  output: '« 🔢 Nombre tiré : 42 »'
}, (ctx) => {
  let a = parseInt(ctx.args[0], 10);
  let b = parseInt(ctx.args[1], 10);
  if (Number.isNaN(a)) { a = 1; b = 100; } else if (Number.isNaN(b)) { b = a; a = 1; }
  if (a > b) [a, b] = [b, a];
  return `🔢 Nombre tiré (${a}-${b}) : ${randInt(a, b)}`;
});

define('coinflip', {
  group: 'Fun', usage: '!coinflip',
  description: 'Lance une pièce : pile ou face.',
  output: '« 🪙 Pseudo lance une pièce… Face ! »'
}, (ctx) => `🪙 ${display(ctx)} lance une pièce… ${pick(['Pile', 'Face'])} !`);

define('8ball', {
  group: 'Fun', usage: '!8ball question',
  description: 'La boule magique répond à une question fermée.',
  output: '« 🎱 Oui, sans aucun doute. »'
}, (ctx) => {
  if (ctx.args.length === 0) return `Utilisation : !8ball ta question ?`;
  return `🎱 ${pick([
    'Oui, sans aucun doute.', 'C\'est certain.', 'Très probablement.', 'Les signes sont favorables.',
    'Demande-moi plus tard.', 'Je ne peux pas le dire maintenant.', 'Mieux vaut ne pas te le dire.',
    'N\'y compte pas.', 'Ma réponse est non.', 'Très improbable.', 'Absolument pas.'
  ])}`;
});

define('choose', {
  group: 'Fun', usage: '!choose a, b, c',
  description: 'Choisit au hasard parmi plusieurs options séparées par des virgules (ou « ou »).',
  output: '« 🤔 Je choisis : b »'
}, (ctx) => {
  const options = ctx.args.join(' ').split(/,| ou /i).map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) return `Utilisation : !choose pizza, burger, sushi`;
  return `🤔 Je choisis : ${pick(options)}`;
});

define('pfc', {
  group: 'Fun', usage: '!pfc pierre|feuille|ciseaux',
  description: 'Pierre-feuille-ciseaux contre le bot.',
  output: '« ✊ Pseudo : pierre — Bot : ciseaux → Pseudo gagne ! »'
}, (ctx) => {
  const icons = { pierre: '✊', feuille: '✋', ciseaux: '✌️' };
  const beats = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
  const mine = (ctx.args[0] || '').toLowerCase();
  if (!icons[mine]) return `Utilisation : !pfc pierre | feuille | ciseaux`;
  const bot = pick(Object.keys(icons));
  const result = mine === bot ? 'égalité !' : beats[mine] === bot ? `${display(ctx)} gagne !` : 'le bot gagne !';
  return `${icons[mine]} ${display(ctx)} : ${mine} — ${icons[bot]} Bot : ${bot} → ${result}`;
});

define('hug', {
  group: 'Fun', usage: '!hug @pseudo',
  description: 'Fait un câlin à quelqu\'un.',
  output: '« 🤗 Pseudo fait un gros câlin à Autre ! »'
}, (ctx) => {
  const t = targetArg(ctx);
  return t ? `🤗 ${display(ctx)} fait un gros câlin à ${t} !` : `Utilisation : !hug @pseudo`;
});

define('slap', {
  group: 'Fun', usage: '!slap @pseudo',
  description: 'Met une claque (pour rire) à quelqu\'un avec un objet au hasard.',
  output: '« 👋 Pseudo met une claque à Autre avec une baguette ! »'
}, (ctx) => {
  const t = targetArg(ctx);
  if (!t) return `Utilisation : !slap @pseudo`;
  const item = pick(['une baguette', 'un poisson', 'une pantoufle', 'un oreiller', 'un clavier mécanique', 'une raclette', 'un canard en plastique']);
  return `👋 ${display(ctx)} met une claque à ${t} avec ${item} !`;
});

define('love', {
  group: 'Fun', usage: '!love @pseudo',
  description: 'Calcule un pourcentage d\'amour (aléatoire) entre toi et quelqu\'un.',
  output: '« 💘 Pseudo ❤ Autre : 87% »'
}, (ctx) => {
  const t = targetArg(ctx);
  return t ? `💘 ${display(ctx)} ❤ ${t} : ${randInt(0, 100)}%` : `Utilisation : !love @pseudo`;
});

define('rate', {
  group: 'Fun', usage: '!rate quelque chose',
  description: 'Donne une note sur 10 (au hasard) à ce que tu veux.',
  output: '« ⭐ J\'ai noté "pizza ananas" : 7/10 »'
}, (ctx) => {
  const what = ctx.args.join(' ').trim();
  return what ? `⭐ J'ai noté "${what.slice(0, 80)}" : ${randInt(0, 10)}/10` : `Utilisation : !rate quelque chose`;
});

define('lurk', {
  group: 'Fun', usage: '!lurk',
  description: 'Prévient le chat que tu passes en mode lurk (tu regardes sans parler).',
  output: '« 👀 Pseudo passe en mode lurk, merci pour le soutien ! »', cooldownSeconds: 30
}, (ctx) => `👀 ${display(ctx)} passe en mode lurk, merci pour le soutien !`);

define('unlurk', {
  group: 'Fun', usage: '!unlurk',
  description: 'Signale ton retour après un lurk.',
  output: '« 👋 Pseudo est de retour ! »', cooldownSeconds: 30
}, (ctx) => `👋 ${display(ctx)} est de retour !`);

// ============================================================
// INFOS CHAÎNE
// ============================================================
define('followers', {
  group: 'Infos chaîne', usage: '!followers', cooldownSeconds: 15,
  description: 'Affiche le nombre de followers de la chaîne.',
  output: '« 👥 La chaîne compte 1 234 followers. »'
}, async (ctx) => {
  const res = await getChannelFollowers(ctx.channel, ctx.broadcasterId, 1);
  return res ? `👥 La chaîne compte ${res.total.toLocaleString('fr-FR')} followers.` : `Impossible de récupérer les followers (compte Twitch non connecté ?).`;
});

define('viewers', {
  group: 'Infos chaîne', usage: '!viewers', cooldownSeconds: 15,
  description: 'Affiche le nombre de viewers actuellement en direct.',
  output: '« 👀 42 viewers en ce moment. »'
}, async (ctx) => {
  const stream = await getStreamByLogin(ctx.channel);
  return stream ? `👀 ${stream.viewer_count} viewer${stream.viewer_count > 1 ? 's' : ''} en ce moment.` : `${ctx.channel} n'est pas en live actuellement.`;
});

define('heure', {
  group: 'Infos chaîne', usage: '!heure', cooldownSeconds: 10,
  description: 'Affiche l\'heure et la date actuelles (fuseau de Paris).',
  output: '« 🕐 Il est 21:34 (Europe/Paris) — samedi 22 novembre 2026 »'
}, () => {
  const now = new Date();
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  return `🕐 Il est ${time} (Europe/Paris) — ${date}`;
});

define('followage', {
  group: 'Infos chaîne', usage: '!followage [@pseudo]', cooldownSeconds: 10,
  description: 'Indique depuis combien de temps un viewer suit la chaîne.',
  output: '« 💚 Pseudo suit la chaîne depuis 1 an 2 mois 3 jours. »'
}, async (ctx) => {
  const target = (targetArg(ctx) || ctx.tags.username).toLowerCase();
  const user = await getUserByLogin(target);
  if (!user) return `Utilisateur "${target}" introuvable.`;
  const followedAt = await getFollowDate(ctx.channel, ctx.broadcasterId, user.id);
  if (!followedAt) return `👤 ${target} ne suit pas la chaîne.`;
  return `💚 ${target} suit la chaîne depuis ${humanDuration(Date.now() - new Date(followedAt).getTime())}.`;
});

define('accountage', {
  group: 'Infos chaîne', usage: '!accountage [@pseudo]', cooldownSeconds: 10,
  description: 'Indique l\'âge du compte Twitch d\'un viewer.',
  output: '« 📅 Le compte de Pseudo a été créé il y a 5 ans 3 mois. »'
}, async (ctx) => {
  const target = (targetArg(ctx) || ctx.tags.username).toLowerCase();
  const user = await getUserByLogin(target);
  if (!user) return `Utilisateur "${target}" introuvable.`;
  return `📅 Le compte de ${user.display_name} a été créé il y a ${humanDuration(Date.now() - new Date(user.created_at).getTime())}.`;
});

// ============================================================
// STATS VIEWERS
// ============================================================
define('watchtime', {
  group: 'Stats viewers', usage: '!watchtime [@pseudo]',
  description: 'Affiche le temps total passé sur la chaîne par un viewer.',
  output: '« ⏳ Pseudo a passé 12h30 sur la chaîne. »'
}, async (ctx) => {
  const target = targetArg(ctx) || ctx.tags.username;
  const stats = await statsManager.getOrCreateUserStats(ctx.channel, target);
  const h = Math.floor(stats.allTimeMinutes / 60);
  return `⏳ ${target} a passé ${h}h${String(stats.allTimeMinutes % 60).padStart(2, '0')} sur la chaîne.`;
});

define('messages', {
  group: 'Stats viewers', usage: '!messages [@pseudo]',
  description: 'Affiche le nombre total de messages envoyés par un viewer.',
  output: '« 💬 Pseudo a envoyé 1 234 messages. »'
}, async (ctx) => {
  const target = targetArg(ctx) || ctx.tags.username;
  const stats = await statsManager.getOrCreateUserStats(ctx.channel, target);
  return `💬 ${target} a envoyé ${stats.allTimeMessages.toLocaleString('fr-FR')} messages.`;
});

define('level', {
  group: 'Stats viewers', usage: '!level [@pseudo]',
  description: 'Affiche le niveau d\'un viewer (1 niveau par heure regardée) et son rang.',
  output: '« ⭐ Pseudo : niveau 12 (rang #5) »'
}, async (ctx) => {
  const target = targetArg(ctx) || ctx.tags.username;
  const stats = await statsManager.getOrCreateUserStats(ctx.channel, target);
  const UserStats = require('../models/UserStats');
  const ahead = await UserStats.countDocuments({ channel: ctx.channel, allTimeMinutes: { $gt: stats.allTimeMinutes } });
  return `⭐ ${target} : niveau ${statsManager.computeLevel(stats.allTimeMinutes)} (rang #${ahead + 1})`;
});

define('top', {
  group: 'Stats viewers', usage: '!top [temps|messages]', cooldownSeconds: 15,
  description: 'Affiche le top 5 des viewers (temps regardé par défaut, ou messages).',
  output: '« 🏆 Top temps regardé : 1. Pseudo (52h) | 2. … »'
}, async (ctx) => {
  const byMessages = ['messages', 'msg'].includes((ctx.args[0] || '').toLowerCase());
  const top = await statsManager.getLeaderboard(ctx.channel, byMessages ? 'messages' : 'uptime', 'global', 5);
  if (!top.length) return `Aucun classement pour le moment.`;
  const fmt = (v) => (byMessages ? `${v} msg` : v >= 60 ? `${Math.floor(v / 60)}h` : `${v}m`);
  return `🏆 Top ${byMessages ? 'messages' : 'temps regardé'} : ${top.map((u, i) => `${i + 1}. ${u.username} (${fmt(u.value)})`).join(' | ')}`;
});

// ============================================================
// CITATIONS & COMPTEURS
// ============================================================
define('quote', {
  group: 'Citations & compteurs', usage: '!quote [numéro]',
  description: 'Affiche une citation enregistrée (au hasard, ou par son numéro).',
  output: '« 💬 Citation #7 : "texte" »'
}, async (ctx) => {
  const n = parseInt(ctx.args[0], 10);
  let q;
  if (Number.isInteger(n)) {
    q = await Quote.findOne({ channel: ctx.channel, number: n }).lean();
    if (!q) return `Citation #${n} introuvable.`;
  } else {
    const count = await Quote.countDocuments({ channel: ctx.channel });
    if (!count) return `Aucune citation enregistrée. Un modo peut en ajouter avec !addquote.`;
    q = await Quote.findOne({ channel: ctx.channel }).skip(randInt(0, count - 1)).lean();
  }
  return `💬 Citation #${q.number} : "${q.text}"`;
});

define('addquote', {
  group: 'Citations & compteurs', usage: '!addquote texte', userLevel: 'moderator',
  description: 'Ajoute une citation (modérateurs).',
  output: '« ✅ Citation #8 ajoutée. »'
}, async (ctx) => {
  const text = ctx.args.join(' ').trim();
  if (!text) return `Utilisation : !addquote texte de la citation`;
  const last = await Quote.findOne({ channel: ctx.channel }).sort({ number: -1 }).lean();
  const number = (last?.number || 0) + 1;
  await Quote.create({ channel: ctx.channel, number, text: text.slice(0, 300), addedBy: ctx.tags.username });
  return `✅ Citation #${number} ajoutée.`;
});

define('delquote', {
  group: 'Citations & compteurs', usage: '!delquote numéro', userLevel: 'moderator',
  description: 'Supprime une citation (modérateurs).',
  output: '« 🗑️ Citation #8 supprimée. »'
}, async (ctx) => {
  const n = parseInt(ctx.args[0], 10);
  if (!Number.isInteger(n)) return `Utilisation : !delquote numéro`;
  const res = await Quote.deleteOne({ channel: ctx.channel, number: n });
  return res.deletedCount ? `🗑️ Citation #${n} supprimée.` : `Citation #${n} introuvable.`;
});

define('counter', {
  group: 'Citations & compteurs', usage: '!counter nom [+ | - | reset | nombre]', cooldownSeconds: 2,
  description: 'Compteurs libres (morts, fails, victoires…). Tout le monde peut lire ; seuls les modérateurs peuvent modifier (+, -, reset, valeur).',
  output: '« 🔢 deaths : 12 »'
}, async (ctx) => {
  const name = (ctx.args[0] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  if (!name) return `Utilisation : !counter nom [+ | - | reset | nombre]`;
  const action = ctx.args[1];
  if (!action) {
    const c = await Counter.findOne({ channel: ctx.channel, name }).lean();
    return `🔢 ${name} : ${c?.value ?? 0}`;
  }
  if (!isMod(ctx)) return `Seuls les modérateurs peuvent modifier un compteur.`;
  let update;
  if (action === '+') update = { $inc: { value: 1 } };
  else if (action === '-') update = { $inc: { value: -1 } };
  else if (action === 'reset') update = { $set: { value: 0 } };
  else if (/^-?\d+$/.test(action)) update = { $set: { value: parseInt(action, 10) } };
  else return `Utilisation : !counter ${name} + | - | reset | nombre`;
  const c = await Counter.findOneAndUpdate({ channel: ctx.channel, name }, update, { upsert: true, new: true });
  return `🔢 ${name} : ${c.value}`;
});

// ============================================================
// UTILITAIRES
// ============================================================
define('calc', {
  group: 'Utilitaires', usage: '!calc 2*(3+4)', cooldownSeconds: 3,
  description: 'Calculatrice : + - * / % ^ et parenthèses.',
  output: '« 🧮 2*(3+4) = 14 »'
}, (ctx) => {
  const expr = ctx.args.join(' ').trim();
  if (!expr || expr.length > 60 || !/^[0-9+\-*/().%\s^,]+$/.test(expr)) return `Utilisation : !calc 2*(3+4)`;
  try {
    const result = Function(`"use strict"; return (${expr.replace(/\^/g, '**').replace(/,/g, '.')});`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return `🧮 Résultat impossible.`;
    return `🧮 ${expr} = ${Math.round(result * 1e6) / 1e6}`;
  } catch {
    return `🧮 Expression invalide.`;
  }
});

define('remind', {
  group: 'Utilitaires', usage: '!remind minutes message', cooldownSeconds: 10,
  description: 'Te rappelle un message dans X minutes (max 180). Perdu si le bot redémarre.',
  output: '« ⏰ Rappel dans 10 min enregistré. » puis « ⏰ @Pseudo : message »'
}, (ctx) => {
  const minutes = parseInt(ctx.args[0], 10);
  const text = ctx.args.slice(1).join(' ').trim();
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180 || !text) return `Utilisation : !remind 10 message (1 à 180 min)`;
  const channelRaw = `#${ctx.channel}`;
  setTimeout(() => ctx.client.say(channelRaw, `⏰ @${display(ctx)} : ${text.slice(0, 200)}`), minutes * 60000);
  return `⏰ Rappel dans ${minutes} min enregistré.`;
});

define('ping', {
  group: 'Utilitaires', usage: '!ping', cooldownSeconds: 10,
  description: 'Vérifie que le bot est en ligne et indique depuis quand il tourne.',
  output: '« 🏓 Pong ! Bot en ligne depuis 3h12. »'
}, () => `🏓 Pong ! Bot en ligne depuis ${humanDuration(process.uptime() * 1000)}.`);

define('help', {
  group: 'Utilitaires', usage: '!help', cooldownSeconds: 20,
  description: 'Liste les commandes natives du bot accessibles à tout le monde.',
  output: '« 📖 Commandes : !dice !coinflip !followage … (+ !commands pour les commandes de la chaîne) »'
}, (ctx) => {
  const prefix = ctx.settings.prefix || '!';
  const names = Object.keys(meta).filter((n) => meta[n].userLevel === 'everyone');
  return `📖 Commandes : ${names.map((n) => prefix + n).join(' ')} — et ${prefix}commands pour celles de la chaîne.`;
});

// ============================================================
// MODÉRATION
// ============================================================
define('so', {
  group: 'Modération', usage: '!so @pseudo', userLevel: 'moderator', cooldownSeconds: 5,
  description: 'Shoutout : met en avant une chaîne (affiche le dernier jeu joué). Message dans le chat uniquement.',
  output: '« 📣 Allez voir Pseudo sur https://twitch.tv/pseudo — dernier jeu : Just Chatting ! »'
}, async (ctx) => {
  const target = targetArg(ctx);
  if (!target) return `Utilisation : !so @pseudo`;
  const user = await getUserByLogin(target.toLowerCase());
  if (!user) return `Utilisateur "${target}" introuvable.`;
  const info = await getChannelInfo(user.id);
  const game = info?.game_name ? ` — dernier jeu : ${info.game_name}` : '';
  return `📣 Allez voir ${user.display_name} sur https://twitch.tv/${user.login}${game} !`;
});

module.exports = { handlers, meta };
