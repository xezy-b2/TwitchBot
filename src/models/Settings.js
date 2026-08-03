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
