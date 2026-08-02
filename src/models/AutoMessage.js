const mongoose = require('mongoose');

const autoMessageSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  text: { type: String, required: true },
  intervalMinutes: { type: Number, default: 30, min: 1 },
  enabled: { type: Boolean, default: true },
  lastSentAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('AutoMessage', autoMessageSchema);
