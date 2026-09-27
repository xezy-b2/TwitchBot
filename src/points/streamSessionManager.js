const StreamSession = require('../models/StreamSession');

/** Démarre une nouvelle session au début d'un live. */
async function startSession(channel, { followersAtStart, initialCategory }) {
  channel = channel.toLowerCase();

  // Sécurité : si une session était restée "en direct" par erreur (ex: crash du
  // bot en plein live), on la referme proprement avant d'en ouvrir une nouvelle.
  const dangling = await StreamSession.findOne({ channel, isLive: true });
  if (dangling) await endSession(channel);

  const now = new Date();
  const session = await StreamSession.create({
    channel,
    startedAt: now,
    isLive: true,
    followersAtStart,
    followersAtEnd: followersAtStart,
    categories: initialCategory ? [{ name: initialCategory, startedAt: now, secondsSpent: 0 }] : []
  });
  return session;
}

/** Échantillonne le nombre de viewers actuel (à appeler périodiquement pendant le live). */
async function sampleViewers(channel, viewerCount) {
  channel = channel.toLowerCase();
  const session = await StreamSession.findOne({ channel, isLive: true });
  if (!session) return;

  session.viewerSampleSum += viewerCount;
  session.viewerSampleCount += 1;
  if (viewerCount > session.peakViewers) session.peakViewers = viewerCount;
  await session.save();
}

/** Change de catégorie : referme le temps passé sur la précédente, en ouvre une nouvelle. */
async function changeCategory(channel, newCategoryName) {
  channel = channel.toLowerCase();
  const session = await StreamSession.findOne({ channel, isLive: true });
  if (!session) return;

  const now = new Date();
  const last = session.categories[session.categories.length - 1];
  if (last && !last.secondsSpent) {
    last.secondsSpent = Math.round((now - last.startedAt) / 1000);
  }
  if (!last || last.name !== newCategoryName) {
    session.categories.push({ name: newCategoryName, startedAt: now, secondsSpent: 0 });
  }
  await session.save();
}

/** Incrémente un compteur d'engagement (followers/subs/bits/dons) sur la session en cours. */
async function recordEngagement(channel, { followersAtEnd, newSubs, bitsReceived, donationsTotal }) {
  channel = channel.toLowerCase();
  const update = {};
  if (followersAtEnd !== undefined) update.followersAtEnd = followersAtEnd;
  if (newSubs) update.$inc = { ...(update.$inc || {}), newSubs };
  if (bitsReceived) update.$inc = { ...(update.$inc || {}), bitsReceived };
  if (donationsTotal) update.$inc = { ...(update.$inc || {}), donationsTotal };
  if (Object.keys(update).length === 0) return;

  await StreamSession.findOneAndUpdate({ channel, isLive: true }, update);
}

/** Termine la session en cours (referme la dernière catégorie, fige les stats). */
async function endSession(channel) {
  channel = channel.toLowerCase();
  const session = await StreamSession.findOne({ channel, isLive: true });
  if (!session) return null;

  const now = new Date();
  const last = session.categories[session.categories.length - 1];
  if (last && !last.secondsSpent) {
    last.secondsSpent = Math.round((now - last.startedAt) / 1000);
  }
  session.endedAt = now;
  session.isLive = false;
  await session.save();
  return session;
}

/** Session en cours (null si hors ligne). */
async function getLiveSession(channel) {
  channel = channel.toLowerCase();
  return StreamSession.findOne({ channel, isLive: true });
}

/** Historique des sessions passées (les plus récentes en premier), paginé. */
async function getHistory(channel, limit = 20, skip = 0) {
  channel = channel.toLowerCase();
  return StreamSession.find({ channel, isLive: false })
    .sort({ startedAt: -1 })
    .skip(skip)
    .limit(limit);
}

/** Met en forme une session (en cours ou passée) pour l'affichage dashboard/overlay. */
function formatSession(session) {
  if (!session) return null;
  const now = new Date();
  const endedAt = session.endedAt || now;
  const durationSeconds = Math.round((endedAt - session.startedAt) / 1000);
  const avgViewers = session.viewerSampleCount > 0
    ? Math.round(session.viewerSampleSum / session.viewerSampleCount)
    : 0;
  const followersGained = Math.max(0, (session.followersAtEnd || 0) - (session.followersAtStart || 0));

  return {
    id: session._id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    isLive: session.isLive,
    durationSeconds,
    peakViewers: session.peakViewers,
    avgViewers,
    followersGained,
    newSubs: session.newSubs,
    bitsReceived: session.bitsReceived,
    donationsTotal: session.donationsTotal,
    donationsCurrency: session.donationsCurrency,
    categories: session.categories.map((c) => ({
      name: c.name,
      secondsSpent: c.secondsSpent || Math.round((now - c.startedAt) / 1000)
    }))
  };
}

module.exports = {
  startSession,
  sampleViewers,
  changeCategory,
  recordEngagement,
  endSession,
  getLiveSession,
  getHistory,
  formatSession
};
