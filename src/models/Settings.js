const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },

  prefix: { type: String, default: '!' },
  pointsName: { type: String, default: 'points' },

  // --- Points passifs (donnés pendant que les gens chattent) ---
  pointsPerInterval: { type: Number, default: 5 },     // points gagnés
  intervalMinutes: { type: Number, default: 10 },      // toutes les X minutes

  // --- Gamble / Pari ---
  // winChance = chance de gagner en % (40 => ratio "60/40", 30 => ratio "70/30")
  gamble: {
    winChance: { type: Number, default: 40, min: 1, max: 99 },
    minBet: { type: Number, default: 10 },
    cooldownSeconds: { type: Number, default: 10 }
  },

  // --- Alertes follow / sub ---
  alerts: {
    followMessage: { type: String, default: '🎉 {user} vient de follow la chaîne ! Nous sommes désormais {totalFollowers} follows (+{followsThisStream} pendant ce live) !' },
    subMessage: { type: String, default: '⭐ {user} vient de s\'abonner (Tier {tier}) !' },
    resubMessage: { type: String, default: '⭐ {user} est abonné depuis {months} mois !' },
    giftSubMessage: { type: String, default: '🎁 {user} a offert un sub à {recipient} !' },
    cheerMessage: { type: String, default: '💎 {user} a envoyé {bits} bits !' },
    achievementMessage: { type: String, default: '🏆 Un trophée vient d\'être débloqué sur : {game} ! Nous sommes maintenant à {unlocked}/{total} succès.' },
    raidMessage: { type: String, default: '🎉 {raider} vient de vous raid avec {viewers} viewer(s) ! Iel jouait à {game} — allez lui faire un petit coucou : https://twitch.tv/{raider}' },
    hypeTrainBeginMessage: { type: String, default: '🚂 Le train de la hype démarre ! Objectif : {goal} points pour passer au niveau suivant !' },
    hypeTrainLevelUpMessage: { type: String, default: '🎉 Niveau {level} atteint sur le train de la hype !' },
    hypeTrainEndingSoonMessage: { type: String, default: '⏰ Plus que 15 secondes pour maintenir le train de la hype en vie !' },
    hypeTrainEndMessage: { type: String, default: '🏁 Train de la hype terminé au niveau {level} avec {total} points au total ! Merci à {topContributor} pour sa contribution !' },
    raidMessage: { type: String, default: '🚨 {raider} vient de nous raid avec {viewers} viewer(s) ! Allez faire un tour sur sa chaîne : {raiderUrl}' },
    soundEnabled: { type: Boolean, default: true },
    soundVolume: { type: Number, default: 100, min: 0, max: 100 },
    // Son personnalisé (MP3) joué sur l'overlay pour chaque type d'alerte, en plus du texte
    followSoundUrl: { type: String, default: null },
    subSoundUrl: { type: String, default: null },
    resubSoundUrl: { type: String, default: null },
    giftSubSoundUrl: { type: String, default: null },
    cheerSoundUrl: { type: String, default: null }
  },

  // --- Steam (suivi des succès selon la catégorie Twitch) ---
  steamId64: { type: String, default: null },

  // --- Discord (envoi automatique des clips via webhook) ---
  discord: {
    clipWebhookUrl: { type: String, default: null },
    embedTitle: { type: String, default: '🎬 Nouveau clip sur {broadcaster} !' },
    embedDescription: { type: String, default: 'Clippé par {clipper} — {title}' },
    embedColor: { type: String, default: '#2E9A5C' },
    embedFooter: { type: String, default: '' }
  },

  // --- Overlay stats viewers (onglets Level / Uptime / Msg / Currency / Subs, par période) ---
  statsOverlay: {
    title: { type: String, default: 'LeaderBoard' },
    topCount: { type: Number, default: 10, min: 3, max: 25 },
    defaultMetric: { type: String, enum: ['uptime', 'messages', 'level', 'currency', 'subs'], default: 'uptime' },
    showLevelTab: { type: Boolean, default: true },
    showUptimeTab: { type: Boolean, default: true },
    showMessagesTab: { type: Boolean, default: true },
    showCurrencyTab: { type: Boolean, default: true },
    showSubsTab: { type: Boolean, default: true },
    autoRotate: { type: Boolean, default: true },
    rotateSeconds: { type: Number, default: 15, min: 5 }
  },

  // --- Subathon ---
  subathon: {
    enabled: { type: Boolean, default: false },
    secondsPerSub: { type: Number, default: 300 },      // +5 min par sub tier 1
    secondsPerSubT2: { type: Number, default: 600 },
    secondsPerSubT3: { type: Number, default: 1800 },
    secondsPerGiftSub: { type: Number, default: 300 },
    secondsPer100Bits: { type: Number, default: 120 },
    maxSeconds: { type: Number, default: 0 } // 0 = pas de limite
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
