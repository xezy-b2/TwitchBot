const mongoose = require('mongoose');

// Les fichiers son du soundboard sont stockés directement en base (et non sur
// le disque du serveur) car le disque de services comme Render est éphémère :
// tout fichier écrit dessus disparaît à chaque redéploiement/redémarrage.
// MongoDB, lui, conserve les données de façon persistante.
const soundFileSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  mimeType: { type: String, required: true },
  data: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.model('SoundFile', soundFileSchema);
