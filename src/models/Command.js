const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  name: { type: String, required: true, lowercase: true }, // sans le préfixe, ex: "discord"
  response: { type: String, default: '' }, // texte parlé (TTS) ou réponse chat ; inutile pour les commandes de type Son
  cooldown: { type: Number, default: 5 }, // secondes
  userLevel: {
    type: String,
    enum: ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'],
    default: 'everyone'
  },
  enabled: { type: Boolean, default: true },
  isVoice: { type: Boolean, default: false }, // commande vocale (TTS) ou non
  soundUrl: { type: String, default: null }, // legacy (une seule commande son) — conservé pour compatibilité
  soundUrls: { type: [String], default: [] }, // plusieurs sons possibles : un est choisi aléatoirement à chaque déclenchement
  volume: { type: Number, default: 100, min: 0, max: 100 }, // volume du son (0-100), utile pour les commandes de type Son
  restrictedToUser: { type: String, default: null, lowercase: true }, // si défini, seul ce pseudo peut utiliser la commande
  createdAt: { type: Date, default: Date.now }
});

commandSchema.index({ channel: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Command', commandSchema);
