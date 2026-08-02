const mongoose = require('mongoose');

const lastEventStateSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  lastFollowerName: { type: String, default: null },
  lastFollowerAt: { type: Date, default: null },
  lastSubName: { type: String, default: null },
  lastSubAt: { type: Date, default: null }
});

module.exports = mongoose.model('LastEventState', lastEventStateSchema);
