const mongoose = require('mongoose');

const subathonGoalSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['subs', 'bits'], required: true },
  target: { type: Number, required: true, min: 1 },
  order: { type: Number, default: 0 }
}, { timestamps: true });

subathonGoalSchema.index({ channel: 1, type: 1, target: 1 });

module.exports = mongoose.model('SubathonGoal', subathonGoalSchema);
