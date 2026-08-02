const mongoose = require('mongoose');

// Stocke le user access token Spotify (OAuth), nécessaire pour interroger
// "ce qui joue actuellement" sur le compte du streamer.
const spotifyTokenSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('SpotifyToken', spotifyTokenSchema);
