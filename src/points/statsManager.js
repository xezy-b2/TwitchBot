const UserStats = require('../models/UserStats');
const StatsPeriodState = require('../models/StatsPeriodState');
const User = require('../models/User');

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

/** Remet à zéro les compteurs "session" (live en cours) — à appeler quand un nouveau live démarre. */
async function resetSession(channel) {
  channel = channel.toLowerCase();
  await UserStats.updateMany({ channel }, { sessionMinutes: 0, sessionMessages: 0 });
}

/** Incrémente le compteur de messages (semaine/mois/session/global) d'un viewer, à chaque message envoyé. */
async function recordMessage(channel, username) {
  channel = channel.toLowerCase();
  username = username.toLowerCase();
  await UserStats.findOneAndUpdate(
    { channel, username },
    {
      $inc: { weekMessages: 1, monthMessages: 1, sessionMessages: 1, allTimeMessages: 1 },
      $set: { lastMessageAt: new Date() }
    },
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
    { $inc: { weekMinutes: 1, monthMinutes: 1, sessionMinutes: 1, allTimeMinutes: 1 } }
  );
}

/** Calcule le niveau d'un viewer à partir de son temps de visionnage total (1 niveau / heure). */
function computeLevel(allTimeMinutes) {
  return Math.floor(allTimeMinutes / 60);
}

const PERIOD_FIELDS = {
  week: { minutes: 'weekMinutes', messages: 'weekMessages' },
  month: { minutes: 'monthMinutes', messages: 'monthMessages' },
  session: { minutes: 'sessionMinutes', messages: 'sessionMessages' },
  global: { minutes: 'allTimeMinutes', messages: 'allTimeMessages' }
};

/**
 * Classement unifié : metric = 'uptime' | 'messages' | 'level' | 'currency' | 'subs',
 * period = 'week' | 'month' | 'session' | 'global' (ignoré pour 'level' et 'currency',
 * qui sont toujours calculés sur l'ensemble de la période connue).
 */
async function getLeaderboard(channel, metric, period, limit = 10) {
  channel = channel.toLowerCase();
  const fields = PERIOD_FIELDS[period] || PERIOD_FIELDS.global;

  if (metric === 'currency') {
    const top = await User.find({ channel }).sort({ points: -1 }).limit(limit).lean();
    const entries = top.map((u) => ({ username: u.username, value: u.points, level: null, isSubscriber: null }));
    return attachAvatars(channel, entries);
  }

  const query = { channel };
  if (metric === 'subs') query.isSubscriber = true;

  const sortField = metric === 'messages' ? fields.messages
    : metric === 'level' ? 'allTimeMinutes'
    : fields.minutes; // 'uptime' et 'subs' se classent par temps regardé

  const users = await UserStats.find(query).sort({ [sortField]: -1 }).limit(limit).lean();

  const entries = users.map((u) => ({
    username: u.username,
    level: computeLevel(u.allTimeMinutes),
    isSubscriber: u.isSubscriber,
    value: metric === 'messages' ? u[fields.messages] : metric === 'level' ? computeLevel(u.allTimeMinutes) : u[fields.minutes]
  }));

  return attachAvatars(channel, entries, users);
}

/** Complète les entrées avec une photo de profil Twitch, en la mettant en cache (rafraîchie après 7 jours). */
async function attachAvatars(channel, entries, userStatsDocs) {
  const { getUsersInfo } = require('../twitch/helixClient'); // require tardif : évite une dépendance circulaire
  const now = Date.now();
  const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

  const docsByUsername = new Map((userStatsDocs || []).map((u) => [u.username, u]));
  const missing = entries.filter((e) => {
    const doc = docsByUsername.get(e.username);
    return !doc?.avatarUrl || !doc?.avatarUpdatedAt || now - new Date(doc.avatarUpdatedAt).getTime() > staleAfterMs;
  });

  if (missing.length > 0) {
    const infos = await getUsersInfo(missing.map((e) => e.username));
    for (const info of infos) {
      await UserStats.updateOne(
        { channel, username: info.login.toLowerCase() },
        { avatarUrl: info.profile_image_url, avatarUpdatedAt: new Date() },
        { upsert: true }
      );
    }
    const freshDocs = await UserStats.find({ channel, username: { $in: entries.map((e) => e.username) } }).lean();
    const freshByUsername = new Map(freshDocs.map((u) => [u.username, u]));
    entries.forEach((e) => { e.avatarUrl = freshByUsername.get(e.username)?.avatarUrl || null; });
  } else {
    entries.forEach((e) => { e.avatarUrl = docsByUsername.get(e.username)?.avatarUrl || null; });
  }

  return entries;
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
  resetSession,
  recordMessage,
  tickActiveWatchtime,
  computeLevel,
  getLeaderboard,
  syncSubscribers
};
