const mongoose = require('mongoose');

const achievementStateSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  twitchCategoryName: { type: String, default: null },
  steamAppId: { type: Number, default: null },
  steamGameName: { type: String, default: null },
  hasAchievements: { type: Boolean, default: false },
  unlocked: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  playtimeMinutes: { type: Number, default: null }
}, { timestamps: true });

module.exports = mongoose.model('AchievementState', achievementStateSchema);
