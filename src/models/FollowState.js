const mongoose = require('mongoose');

const followStateSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  lastFollowedAt: { type: Date, default: null },
  initialized: { type: Boolean, default: false }
});

module.exports = mongoose.model('FollowState', followStateSchema);
