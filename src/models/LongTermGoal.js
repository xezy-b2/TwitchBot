const mongoose = require('mongoose');

const longTermGoalSchema = new mongoose.Schema({
  channel: { type: String, required: true, unique: true, lowercase: true },
  label: { type: String, default: 'Objectif abonnés du mois' },
  type: { type: String, enum: ['subs', 'bits', 'follows', 'manual'], default: 'subs' },
  target: { type: Number, default: 100 },
  current: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('LongTermGoal', longTermGoalSchema);
