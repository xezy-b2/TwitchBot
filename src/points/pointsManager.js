const User = require('../models/User');

async function getOrCreateUser(channel, username) {
  channel = channel.toLowerCase();
  username = username.toLowerCase();
  let user = await User.findOne({ channel, username });
  if (!user) {
    user = await User.create({ channel, username });
  }
  return user;
}

async function addPoints(channel, username, amount) {
  const user = await getOrCreateUser(channel, username);
  user.points = Math.max(0, user.points + amount);
  user.lastSeen = new Date();
  await user.save();
  return user.points;
}

async function getPoints(channel, username) {
  const user = await getOrCreateUser(channel, username);
  return user.points;
}

async function transferPoints(channel, from, to, amount) {
  const fromUser = await getOrCreateUser(channel, from);
  if (fromUser.points < amount) return { ok: false, error: 'Solde insuffisant.' };

  const toUser = await getOrCreateUser(channel, to);
  fromUser.points -= amount;
  toUser.points += amount;
  await fromUser.save();
  await toUser.save();
  return { ok: true };
}

async function getLeaderboard(channel, limit = 5) {
  return User.find({ channel: channel.toLowerCase() })
    .sort({ points: -1 })
    .limit(limit)
    .lean();
}

/**
 * Ajoute des points passifs à tous les chatteurs actifs récemment (tracking en mémoire
 * fait dans bot/client.js). Appelée périodiquement par un setInterval.
 */
async function grantPassivePoints(channel, activeUsernames, amount) {
  const channelLower = channel.toLowerCase();
  const ops = activeUsernames.map((username) => ({
    updateOne: {
      filter: { channel: channelLower, username: username.toLowerCase() },
      update: { $inc: { points: amount }, $set: { lastSeen: new Date() } },
      upsert: true
    }
  }));
  if (ops.length > 0) await User.bulkWrite(ops);
}

module.exports = {
  getOrCreateUser,
  addPoints,
  getPoints,
  transferPoints,
  getLeaderboard,
  grantPassivePoints
};
