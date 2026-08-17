const mongoose = require('mongoose');

const subathonStateSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  isRunning: { type: Boolean, default: false },
  secondsRemaining: { type: Number, default: 0 },
  totalSecondsAdded: { type: Number, default: 0 },
  totalSubs: { type: Number, default: 0 },
  totalBits: { type: Number, default: 0 },
  startedAt: { type: Date, default: null },
  lastTickAt: { type: Date, default: null }
});

module.exports = mongoose.model('SubathonState', subathonStateSchema);
