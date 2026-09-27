const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  question: { type: String, default: '' },
  options: [{ text: String, votes: { type: Number, default: 0 } }],
  // { pseudo: indexDeLOption } — permet de changer de vote et empêche les doublons
  voters: { type: Object, default: {} },
  durationSeconds: { type: Number, default: 120 },
  startedAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  isActive: { type: Boolean, default: false }
}, { minimize: false });

module.exports = mongoose.model('Poll', pollSchema);
