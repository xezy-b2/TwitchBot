const mongoose = require('mongoose');

// Stocke le user access token obtenu via OAuth (nécessaire pour EventSub :
// follows/subs nécessitent un token utilisateur avec les bons scopes)
const twitchTokenSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  broadcasterId: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  scope: [String],
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('TwitchToken', twitchTokenSchema);
