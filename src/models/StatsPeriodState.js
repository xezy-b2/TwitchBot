const mongoose = require('mongoose');

const statsPeriodStateSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  weekStart: { type: Date, default: null },
  monthStart: { type: Date, default: null }
});

module.exports = mongoose.model('StatsPeriodState', statsPeriodStateSchema);
