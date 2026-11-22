const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  name: { type: String, required: true, lowercase: true },
  value: { type: Number, default: 0 }
});

counterSchema.index({ channel: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
