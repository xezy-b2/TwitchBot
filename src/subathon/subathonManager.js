const SubathonState = require('../models/SubathonState');
const SubathonGoal = require('../models/SubathonGoal');

let ioRef = null;
let tickInterval = null;

function init(io) {
  ioRef = io;
  // Tick global toutes les secondes : décrémente le temps restant de chaque
  // subathon en cours et diffuse la mise à jour à l'overlay + dashboard.
  tickInterval = setInterval(async () => {
    const running = await SubathonState.find({ isRunning: true });
    for (const state of running) {
      if (state.secondsRemaining > 0) {
        state.secondsRemaining -= 1;
        state.lastTickAt = new Date();
        await state.save();
      } else {
        state.isRunning = false;
        await state.save();
      }
      broadcast(state.channel, state);
    }
  }, 1000);
}

function broadcast(channel, state) {
  if (ioRef) {
    ioRef.emit('subathon:update', {
      channel,
      isRunning: state.isRunning,
      secondsRemaining: state.secondsRemaining,
      totalSecondsAdded: state.totalSecondsAdded,
      totalSubs: state.totalSubs,
      totalBits: state.totalBits
    });
  }
}

/** Diffuse la liste des objectifs à jour (appelé après ajout/édition/suppression depuis le dashboard). */
async function broadcastGoals(channel) {
  if (!ioRef) return;
  const goals = await SubathonGoal.find({ channel: channel.toLowerCase() }).sort({ type: 1, target: 1 });
  ioRef.emit('subathon:goals', { channel, goals });
}

async function getState(channel) {
  channel = channel.toLowerCase();
  let state = await SubathonState.findOne({ channel });
  if (!state) state = await SubathonState.create({ channel });
  return state;
}

/**
 * Ajoute du temps au subathon, et éventuellement des subs/bits comptabilisés
 * pour la progression des objectifs (goals).
 */
async function addProgress(channel, { seconds = 0, subs = 0, bits = 0 } = {}, settings) {
  const state = await getState(channel);
  state.secondsRemaining += seconds;
  state.totalSecondsAdded += seconds;
  state.totalSubs += subs;
  state.totalBits += bits;

  if (settings?.subathon?.maxSeconds > 0) {
    state.secondsRemaining = Math.min(state.secondsRemaining, settings.subathon.maxSeconds);
  }
  await state.save();
  broadcast(channel, state);
  return state;
}

/** Conservé pour la compatibilité (ajout manuel de temps depuis le chat/dashboard, sans subs/bits). */
async function addSeconds(channel, seconds, settings) {
  return addProgress(channel, { seconds }, settings);
}

async function start(channel, initialSeconds = 0) {
  const state = await getState(channel);
  state.isRunning = true;
  if (!state.startedAt) state.startedAt = new Date();
  if (initialSeconds > 0) {
    state.secondsRemaining += initialSeconds;
    state.totalSecondsAdded += initialSeconds;
  }
  await state.save();
  broadcast(channel, state);
  return state;
}

async function pause(channel) {
  const state = await getState(channel);
  state.isRunning = false;
  await state.save();
  broadcast(channel, state);
  return state;
}

async function reset(channel) {
  const state = await getState(channel);
  state.isRunning = false;
  state.secondsRemaining = 0;
  state.totalSecondsAdded = 0;
  state.totalSubs = 0;
  state.totalBits = 0;
  state.startedAt = null;
  await state.save();
  broadcast(channel, state);
  return state;
}

// --- Gestion des objectifs (goals) ---

async function getGoals(channel) {
  return SubathonGoal.find({ channel: channel.toLowerCase() }).sort({ type: 1, target: 1 });
}

async function createGoal(channel, { label, type, target }) {
  const goal = await SubathonGoal.create({ channel: channel.toLowerCase(), label, type, target });
  await broadcastGoals(channel);
  return goal;
}

async function updateGoal(channel, id, updates) {
  const goal = await SubathonGoal.findOneAndUpdate({ _id: id, channel: channel.toLowerCase() }, updates, { new: true });
  await broadcastGoals(channel);
  return goal;
}

async function deleteGoal(channel, id) {
  await SubathonGoal.findOneAndDelete({ _id: id, channel: channel.toLowerCase() });
  await broadcastGoals(channel);
}

module.exports = {
  init,
  getState,
  addSeconds,
  addProgress,
  start,
  pause,
  reset,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal
};
