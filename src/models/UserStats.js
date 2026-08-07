const mongoose = require('mongoose');

const userStatsSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  username: { type: String, required: true, lowercase: true },

  weekMinutes: { type: Number, default: 0 },
  weekMessages: { type: Number, default: 0 },

  monthMinutes: { type: Number, default: 0 },
  monthMessages: { type: Number, default: 0 },

  allTimeMinutes: { type: Number, default: 0 },
  allTimeMessages: { type: Number, default: 0 },

  isSubscriber: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: null }
});

userStatsSchema.index({ channel: 1, username: 1 }, { unique: true });
userStatsSchema.index({ channel: 1, weekMinutes: -1 });
userStatsSchema.index({ channel: 1, monthMinutes: -1 });
userStatsSchema.index({ channel: 1, allTimeMinutes: -1 });

module.exports = mongoose.model('UserStats', userStatsSchema);
