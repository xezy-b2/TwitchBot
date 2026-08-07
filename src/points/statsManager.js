const UserStats = require('../models/UserStats');
const StatsPeriodState = require('../models/StatsPeriodState');

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche
  const diff = (day === 0 ? -6 : 1) - day; // recule jusqu'au lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getOrCreateUserStats(channel, username) {
  channel = channel.toLowerCase();
  username = username.toLowerCase();
  let stats = await UserStats.findOne({ channel, username });
  if (!stats) stats = await UserStats.create({ channel, username });
  return stats;
}

/**
 * Vérifie si une nouvelle semaine/un nouveau mois a commencé depuis la dernière
 * vérification, et réinitialise les compteurs concernés pour TOUS les viewers si besoin.
 * À appeler périodiquement (chaque minute suffit largement).
 */
async function checkAndResetPeriods(channel) {
  channel = channel.toLowerCase();
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentMonthStart = getMonthStart(now);

  let state = await StatsPeriodState.findOne({ channel });
  if (!state) {
    await StatsPeriodState.create({ channel, weekStart: currentWeekStart, monthStart: currentMonthStart });
    return;
  }

  const updates = {};
  if (!state.weekStart || currentWeekStart.getTime() !== new Date(state.weekStart).getTime()) {
    await UserStats.updateMany({ channel }, { weekMinutes: 0, weekMessages: 0 });
    updates.weekStart = currentWeekStart;
  }
  if (!state.monthStart || currentMonthStart.getTime() !== new Date(state.monthStart).getTime()) {
    await UserStats.updateMany({ channel }, { monthMinutes: 0, monthMessages: 0 });
    updates.monthStart = currentMonthStart;
  }
  if (Object.keys(updates).length > 0) {
    await StatsPeriodState.updateOne({ channel }, updates);
  }
}

/** Incrémente le compteur de messages (semaine/mois/global) d'un viewer, à chaque message envoyé. */
async function recordMessage(channel, username) {
  channel = channel.toLowerCase();
  username = username.toLowerCase();
  await UserStats.findOneAndUpdate(
    { channel, username },
    { $inc: { weekMessages: 1, monthMessages: 1, allTimeMessages: 1 }, $set: { lastMessageAt: new Date() } },
    { upsert: true }
  );
}

/**
 * Ajoute 1 minute de temps de visionnage à tous les viewers considérés "présents"
 * (ceux ayant envoyé un message dans les dernières `presenceWindowMinutes` minutes).
 * À appeler chaque minute, uniquement pendant que le stream est en live.
 */
async function tickActiveWatchtime(channel, presenceWindowMinutes = 15) {
  channel = channel.toLowerCase();
  const since = new Date(Date.now() - presenceWindowMinutes * 60 * 1000);
  await UserStats.updateMany(
    { channel, lastMessageAt: { $gte: since } },
    { $inc: { weekMinutes: 1, monthMinutes: 1, allTimeMinutes: 1 } }
  );
}

/** Calcule le niveau d'un viewer à partir de son temps de visionnage total (1 niveau / heure). */
function computeLevel(allTimeMinutes) {
  return Math.floor(allTimeMinutes / 60);
}

/** Classement des viewers pour une période donnée ('week' | 'month' | 'global'). */
async function getLeaderboard(channel, period, limit = 10) {
  channel = channel.toLowerCase();
  const sortField = period === 'week' ? 'weekMinutes' : period === 'month' ? 'monthMinutes' : 'allTimeMinutes';
  const users = await UserStats.find({ channel }).sort({ [sortField]: -1 }).limit(limit).lean();

  return users.map((u) => ({
    username: u.username,
    minutes: period === 'week' ? u.weekMinutes : period === 'month' ? u.monthMinutes : u.allTimeMinutes,
    messages: period === 'week' ? u.weekMessages : period === 'month' ? u.monthMessages : u.allTimeMessages,
    level: computeLevel(u.allTimeMinutes),
    isSubscriber: u.isSubscriber
  }));
}

/** Synchronise le statut d'abonné de tous les viewers connus, via la liste réelle des abonnés Twitch. */
async function syncSubscribers(channel, broadcasterId, getAllSubscribers) {
  channel = channel.toLowerCase();
  const logins = await getAllSubscribers(channel, broadcasterId);
  const loginSet = new Set(logins.map((l) => l.toLowerCase()));

  await UserStats.updateMany({ channel }, { isSubscriber: false });
  if (loginSet.size > 0) {
    await UserStats.updateMany({ channel, username: { $in: [...loginSet] } }, { isSubscriber: true });
  }
}

module.exports = {
  getOrCreateUserStats,
  checkAndResetPeriods,
  recordMessage,
  tickActiveWatchtime,
  computeLevel,
  getLeaderboard,
  syncSubscribers
};
