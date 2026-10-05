/**
 * Descriptions des commandes natives (celles codées dans builtinCommands.js),
 * uniquement pour l'affichage dans le dashboard. Elles n'influencent pas le
 * comportement du bot.
 *
 * Quand tu ajoutes une commande dans builtinCommands.js, ajoute-la aussi ici
 * (un contrôle automatique au démarrage signale les oublis dans la console).
 */
const meta = {
  // --- Points ---
  points: {
    group: 'Points',
    usage: '!points [@pseudo]',
    description: 'Affiche le solde de points d\'un viewer (le sien par défaut).',
    output: '« Pseudo a 120 points. »',
    userLevel: 'everyone'
  },
  give: {
    group: 'Points',
    usage: '!give @pseudo montant',
    description: 'Donne une partie de ses points à un autre viewer.',
    output: '« Pseudo a donné 50 points à Autre ! » (ou un message d\'erreur si le solde est insuffisant)',
    userLevel: 'everyone'
  },
  gamble: {
    group: 'Points',
    usage: '!gamble montant | all',
    description: 'Parie des points : le viewer gagne ou perd sa mise selon les réglages de pari.',
    output: '« 🎉 Pseudo a gagné son pari… » ou « 💀 Pseudo a perdu… », avec le nouveau solde',
    userLevel: 'everyone'
  },
  leaderboard: {
    group: 'Points',
    usage: '!leaderboard',
    description: 'Affiche le top 5 des viewers ayant le plus de points.',
    output: '« 🏆 Classement points : 1. Pseudo (500) | 2. … »',
    userLevel: 'everyone'
  },

  // --- Infos stream ---
  uptime: {
    group: 'Infos stream',
    usage: '!uptime',
    description: 'Indique depuis combien de temps le live est en cours.',
    output: '« chaîne est en live depuis 2h05. » (ou « n\'est pas en live actuellement »)',
    userLevel: 'everyone'
  },
  title: {
    group: 'Infos stream',
    usage: '!title',
    description: 'Affiche le titre actuel du stream.',
    output: '« Titre actuel : … »',
    userLevel: 'everyone'
  },
  game: {
    group: 'Infos stream',
    usage: '!game',
    description: 'Affiche la catégorie/le jeu actuel du stream.',
    output: '« Jeu/catégorie actuel : … »',
    userLevel: 'everyone'
  },
  fc: {
    group: 'Infos stream',
    usage: '!fc [@pseudo]',
    description: 'Donne la date à laquelle un viewer a suivi la chaîne (follow check).',
    output: '« 👤 pseudo : Dernier follow le 12/03/2025 18:42:10 (210 Jour(s)) »',
    userLevel: 'everyone',
    cooldown: '15 s par viewer (silencieux)'
  },

  // --- Gestion du stream (modération) ---
  setgame: {
    group: 'Gestion du stream',
    usage: '!setgame Nom du jeu',
    description: 'Change la catégorie du stream directement depuis le chat.',
    output: '« ✅ Jeu changé pour : … »',
    userLevel: 'moderator'
  },
  settitle: {
    group: 'Gestion du stream',
    usage: '!settitle Nouveau titre',
    description: 'Change le titre du stream directement depuis le chat.',
    output: '« ✅ Titre mis à jour : … »',
    userLevel: 'moderator'
  },

  // --- Commandes personnalisées (gestion depuis le chat) ---
  commands: {
    group: 'Commandes',
    usage: '!commands',
    description: 'Liste les commandes personnalisées actuellement actives (les commandes en pause n\'apparaissent pas).',
    output: '« Commandes disponibles : !discord, !insta, … »',
    userLevel: 'everyone'
  },
  addcommand: {
    group: 'Commandes',
    usage: '!addcommand nom Texte de réponse [--voice]',
    description: 'Crée ou modifie une commande personnalisée depuis le chat. Ajoute --voice pour qu\'elle soit lue par le TTS.',
    output: '« ✅ Commande !nom ajoutée. »',
    userLevel: 'moderator'
  },
  delcommand: {
    group: 'Commandes',
    usage: '!delcommand nom',
    description: 'Supprime définitivement une commande personnalisée.',
    output: '« 🗑️ Commande !nom supprimée. »',
    userLevel: 'moderator'
  },

  // --- Subathon ---
  subathon: {
    group: 'Subathon',
    usage: '!subathon',
    description: 'Affiche le temps restant du subathon.',
    output: '« ⏱️ Subathon : 3h12m40s restantes. » (ou « Aucun subathon en cours »)',
    userLevel: 'everyone'
  },
  addtime: {
    group: 'Subathon',
    usage: '!addtime minutes',
    description: 'Ajoute manuellement du temps au subathon.',
    output: '« ✅ 10 minute(s) ajoutée(s) au subathon. »',
    userLevel: 'moderator'
  },

  // --- Clips ---
  clip: {
    group: 'Clips',
    usage: '!clip',
    description: 'Crée un clip du moment et l\'envoie automatiquement sur Discord (si le webhook est configuré).',
    output: '« 🎬 Clip créé par Pseudo : https://clips.twitch.tv/… »',
    userLevel: 'everyone',
    cooldown: '60 s (global)'
  },

  // --- Stats viewers ---
  myuptime: {
    group: 'Stats viewers',
    usage: '!myuptime [@pseudo]',
    description: 'Affiche le temps passé sur la chaîne et le nombre de messages d\'un viewer (semaine, mois, total).',
    output: '« ⏱ Pseudo [Semaine] 120m (45 msg (22.5msg/h)) [Mois] … [Global] … »',
    userLevel: 'everyone'
  },

  // --- Sondage ---
  sondage: {
    group: 'Sondage',
    usage: '!sondage "Question ?", "Réponse 1", "Réponse 2"[, … jusqu\'à 5][, durée en secondes]',
    description: 'Lance un sondage : les viewers votent en tapant 1, 2, 3… dans le chat. Durée par défaut : 2 minutes. Le résultat est annoncé automatiquement à la fin.',
    output: '« 📊 Question ? 1. Réponse 1 · 2. Réponse 2 ➡ Tapez le numéro dans le chat pour voter (2 min) »',
    userLevel: 'moderator'
  }
};

/** Liste à plat, prête à être envoyée au dashboard. */
function listBuiltinCommands() {
  return Object.entries(meta).map(([name, info]) => ({ name, ...info }));
}

/**
 * Signale dans la console les commandes natives sans description (oubli après
 * l'ajout d'une nouvelle commande) et les descriptions orphelines.
 */
function checkMetaConsistency(builtins) {
  const missing = Object.keys(builtins).filter((name) => !meta[name]);
  const orphan = Object.keys(meta).filter((name) => !builtins[name]);
  if (missing.length) console.warn(`[Commandes] Sans description dans builtinCommandsMeta.js : ${missing.join(', ')}`);
  if (orphan.length) console.warn(`[Commandes] Description sans commande native : ${orphan.join(', ')}`);
  return { missing, orphan };
}

module.exports = { meta, listBuiltinCommands, checkMetaConsistency };
