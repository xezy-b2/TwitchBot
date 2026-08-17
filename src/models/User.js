const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  username: { type: String, required: true, lowercase: true },
  points: { type: Number, default: 0 },
  watchTimeMinutes: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now },
  lastGamble: { type: Date, default: null }
});

userSchema.index({ channel: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
