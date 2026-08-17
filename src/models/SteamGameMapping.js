const mongoose = require('mongoose');

const steamGameMappingSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  twitchCategoryName: { type: String, required: true, lowercase: true },
  steamAppId: { type: Number, default: null }, // null = recherche déjà tentée mais aucun jeu Steam trouvé
  steamGameName: { type: String, default: null }
}, { timestamps: true });

steamGameMappingSchema.index({ channel: 1, twitchCategoryName: 1 }, { unique: true });

module.exports = mongoose.model('SteamGameMapping', steamGameMappingSchema);
