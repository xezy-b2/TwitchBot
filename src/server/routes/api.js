const express = require('express');
const router = express.Router();

const Command = require('../../models/Command');
const Settings = require('../../models/Settings');
const TwitchToken = require('../../models/TwitchToken');
const SpotifyToken = require('../../models/SpotifyToken');
const AutoMessage = require('../../models/AutoMessage');
const AchievementState = require('../../models/AchievementState');
const { getLeaderboard } = require('../../points/pointsManager');
const subathonManager = require('../../subathon/subathonManager');
const longTermGoalManager = require('../../points/longTermGoalManager');
const achievementTracker = require('../../steam/achievementTracker');
const statsManager = require('../../points/statsManager');

const CHANNEL = process.env.TWITCH_CHANNEL.toLowerCase();

router.use(require('./upload'));

// --- Commandes personnalisées ---
router.get('/commands', async (req, res) => {
  const commands = await Command.find({ channel: CHANNEL }).sort({ name: 1 });
  res.json(commands);
});

router.post('/commands', async (req, res) => {
  const { name, response, cooldown, userLevel, isVoice, soundUrls, volume, restrictedToUser } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });

  const cleanSoundUrls = Array.isArray(soundUrls) ? soundUrls.filter(Boolean) : [];
  if (cleanSoundUrls.length === 0 && !response) {
    return res.status(400).json({ error: 'response requis (sauf pour une commande de type Son)' });
  }

  const cmd = await Command.findOneAndUpdate(
    { channel: CHANNEL, name: name.toLowerCase().replace(/^!/, '') },
    {
      channel: CHANNEL,
      name: name.toLowerCase().replace(/^!/, ''),
      response: response || '',
      cooldown: cooldown ?? 5,
      userLevel: userLevel ?? 'everyone',
      isVoice: !!isVoice,
      soundUrls: cleanSoundUrls,
      soundUrl: null, // on n'utilise plus le champ legacy pour les nouvelles sauvegardes
      volume: volume !== undefined ? Math.max(0, Math.min(100, parseInt(volume, 10))) : 100,
      restrictedToUser: restrictedToUser ? restrictedToUser.trim().toLowerCase().replace(/^@/, '') : null,
      enabled: true
    },
    { upsert: true, new: true }
  );
  res.json(cmd);
});

router.put('/commands/:id', async (req, res) => {
  const cmd = await Command.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(cmd);
});

router.delete('/commands/:id', async (req, res) => {
  await Command.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// --- Settings (points, gamble, alertes, subathon config) ---
router.get('/settings', async (req, res) => {
  let settings = await Settings.findOne({ channel: CHANNEL });
  if (!settings) settings = await Settings.create({ channel: CHANNEL });
  res.json(settings);
});

router.put('/settings', async (req, res) => {
  const settings = await Settings.findOneAndUpdate(
    { channel: CHANNEL },
    { $set: req.body },
    { upsert: true, new: true }
  );
  res.json(settings);
});

// --- Subathon ---
router.get('/subathon', async (req, res) => {
  const state = await subathonManager.getState(CHANNEL);
  res.json(state);
});

router.post('/subathon/start', async (req, res) => {
  const { initialSeconds } = req.body;
  const state = await subathonManager.start(CHANNEL, initialSeconds || 0);
  res.json(state);
});

router.post('/subathon/pause', async (req, res) => {
  const state = await subathonManager.pause(CHANNEL);
  res.json(state);
});

router.post('/subathon/addtime', async (req, res) => {
  const { seconds } = req.body;
  const settings = await Settings.findOne({ channel: CHANNEL });
  const state = await subathonManager.addSeconds(CHANNEL, parseInt(seconds, 10) || 0, settings);
  res.json(state);
});

router.post('/subathon/reset', async (req, res) => {
  const state = await subathonManager.reset(CHANNEL);
  res.json(state);
});

// --- Objectifs (goals) du subathon ---
router.get('/subathon/goals', async (req, res) => {
  const goals = await subathonManager.getGoals(CHANNEL);
  res.json(goals);
});

router.post('/subathon/goals', async (req, res) => {
  const { label, type, target } = req.body;
  if (!label || !['subs', 'bits'].includes(type) || !target) {
    return res.status(400).json({ error: 'label, type (subs|bits) et target requis' });
  }
  const goal = await subathonManager.createGoal(CHANNEL, { label, type, target: parseInt(target, 10) });
  res.json(goal);
});

router.put('/subathon/goals/:id', async (req, res) => {
  const goal = await subathonManager.updateGoal(CHANNEL, req.params.id, req.body);
  res.json(goal);
});

router.delete('/subathon/goals/:id', async (req, res) => {
  await subathonManager.deleteGoal(CHANNEL, req.params.id);
  res.json({ ok: true });
});

// Navigation manuelle des pages d'objectifs sur l'overlay (flèches du dashboard)
router.post('/subathon/goals/navigate', (req, res) => {
  const direction = req.body.direction === 'prev' ? 'prev' : 'next';
  if (req.app.locals.io) req.app.locals.io.emit('subathon:goals:navigate', { direction });
  res.json({ ok: true });
});

// --- Stats ---
router.get('/stats/leaderboard', async (req, res) => {
  const top = await getLeaderboard(CHANNEL, 20);
  res.json(top);
});

// --- Statut de connexion Twitch (OAuth) ---
router.get('/twitch/status', async (req, res) => {
  const token = await TwitchToken.findOne({ channel: CHANNEL });
  res.json({ connected: !!token, broadcasterId: token?.broadcasterId || null });
});

// --- Statut de connexion Spotify (OAuth) ---
router.get('/spotify/status', async (req, res) => {
  const token = await SpotifyToken.findOne({ channel: CHANNEL });
  res.json({ connected: !!token });
});

// --- Messages automatiques (rappels Discord/réseaux) ---
router.get('/automessages', async (req, res) => {
  const messages = await AutoMessage.find({ channel: CHANNEL }).sort({ createdAt: 1 });
  res.json(messages);
});

router.post('/automessages', async (req, res) => {
  const { text, intervalMinutes } = req.body;
  if (!text) return res.status(400).json({ error: 'text requis' });
  const msg = await AutoMessage.create({
    channel: CHANNEL,
    text,
    intervalMinutes: parseInt(intervalMinutes, 10) || 30
  });
  res.json(msg);
});

router.put('/automessages/:id', async (req, res) => {
  const msg = await AutoMessage.findOneAndUpdate({ _id: req.params.id, channel: CHANNEL }, req.body, { new: true });
  res.json(msg);
});

router.delete('/automessages/:id', async (req, res) => {
  await AutoMessage.findOneAndDelete({ _id: req.params.id, channel: CHANNEL });
  res.json({ ok: true });
});

// --- Objectif long terme (indépendant du subathon) ---
router.get('/longtermgoal', async (req, res) => {
  const goal = await longTermGoalManager.getGoal(CHANNEL);
  res.json(goal);
});

router.put('/longtermgoal', async (req, res) => {
  const { label, type, target } = req.body;
  const goal = await longTermGoalManager.setGoal(CHANNEL, {
    label,
    type,
    target: parseInt(target, 10) || 1
  });
  res.json(goal);
});

router.put('/longtermgoal/current', async (req, res) => {
  const { current } = req.body;
  const goal = await longTermGoalManager.setCurrent(CHANNEL, parseInt(current, 10) || 0);
  res.json(goal);
});

// --- Steam (suivi des succès selon la catégorie Twitch) ---
router.get('/steam/current', async (req, res) => {
  const state = await AchievementState.findOne({ channel: CHANNEL });
  res.json(state || { hasAchievements: false });
});

router.put('/steam/mapping', async (req, res) => {
  const { twitchCategoryName, steamAppId } = req.body;
  if (!twitchCategoryName || !steamAppId) {
    return res.status(400).json({ error: 'twitchCategoryName et steamAppId requis' });
  }
  await achievementTracker.setManualMapping(CHANNEL, twitchCategoryName, parseInt(steamAppId, 10), req.app.locals.io);
  const state = await AchievementState.findOne({ channel: CHANNEL });
  res.json(state);
});

// --- Stats viewers (aperçu depuis le dashboard) ---
router.get('/viewerstats/leaderboard', async (req, res) => {
  const metric = ['uptime', 'messages', 'level', 'currency', 'subs'].includes(req.query.metric) ? req.query.metric : 'uptime';
  const period = ['week', 'month', 'session', 'global'].includes(req.query.period) ? req.query.period : 'global';
  const leaderboard = await statsManager.getLeaderboard(CHANNEL, metric, period, 25);
  res.json(leaderboard);
});

module.exports = router;
