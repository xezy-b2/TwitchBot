const LongTermGoal = require('../models/LongTermGoal');

let ioRef = null;

function init(io) {
  ioRef = io;
}

async function getGoal(channel) {
  channel = channel.toLowerCase();
  let goal = await LongTermGoal.findOne({ channel });
  if (!goal) goal = await LongTermGoal.create({ channel });
  return goal;
}

function broadcast(goal) {
  if (ioRef) ioRef.emit('longtermgoal:update', goal);
}

async function setGoal(channel, { label, type, target }) {
  const goal = await LongTermGoal.findOneAndUpdate(
    { channel: channel.toLowerCase() },
    { label, type, target },
    { upsert: true, new: true }
  );
  broadcast(goal);
  return goal;
}

async function setCurrent(channel, current) {
  const goal = await LongTermGoal.findOneAndUpdate(
    { channel: channel.toLowerCase() },
    { current: Math.max(0, current) },
    { upsert: true, new: true }
  );
  broadcast(goal);
  return goal;
}

/**
 * Incrémente l'objectif s'il est configuré pour suivre ce type d'événement
 * (subs/bits/follows). N'a aucun effet si le type de l'objectif ne correspond
 * pas, ou s'il est en mode "manuel".
 */
async function recordEvent(channel, eventType, amount = 1) {
  const goal = await getGoal(channel);
  if (goal.type !== eventType) return;

  goal.current += amount;
  await goal.save();
  broadcast(goal);
}

module.exports = { init, getGoal, setGoal, setCurrent, recordEvent };
