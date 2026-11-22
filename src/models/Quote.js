const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  number: { type: Number, required: true },
  text: { type: String, required: true },
  addedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

quoteSchema.index({ channel: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('Quote', quoteSchema);
