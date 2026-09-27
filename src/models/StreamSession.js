const mongoose = require('mongoose');

const streamSessionSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },

  startedAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
  isLive: { type: Boolean, default: true },

  // Viewers : échantillonnés périodiquement pendant le live pour calculer le pic et la moyenne
  peakViewers: { type: Number, default: 0 },
  viewerSampleSum: { type: Number, default: 0 },
  viewerSampleCount: { type: Number, default: 0 },

  // Engagement
  followersAtStart: { type: Number, default: 0 },
  followersAtEnd: { type: Number, default: 0 }, // mis à jour en continu, figé à la fin du live
  newSubs: { type: Number, default: 0 },
  bitsReceived: { type: Number, default: 0 },
  donationsTotal: { type: Number, default: 0 },
  donationsCurrency: { type: String, default: 'EUR' },

  // Catégories jouées pendant la session, avec le temps passé sur chacune
  categories: [{
    name: String,
    startedAt: Date,
    secondsSpent: { type: Number, default: 0 } // figé quand on change de catégorie ou que le live se termine
  }]
});

streamSessionSchema.index({ channel: 1, startedAt: -1 });

module.exports = mongoose.model('StreamSession', streamSessionSchema);
