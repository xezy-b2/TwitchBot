const express = require('express');
const router = express.Router();

const Command = require('../../models/Command');
const Settings = require('../../models/Settings');
const TwitchToken = require('../../models/TwitchToken');
const { getLeaderboard } = require('../../points/pointsManager');
const subathonManager = require('../../subathon/subathonManager');

const CHANNEL = process.env.TWITCH_CHANNEL.toLowerCase();

router.use(require('./upload'));

// --- Commandes personnalisées ---
router.get('/commands', async (req, res) => {
  const commands = await Command.find({ channel: CHANNEL }).sort({ name: 1 });
  res.json(commands);
});

router.post('/commands', async (req, res) => {
  const { name, response, cooldown, userLevel, isVoice, soundUrl, volume, restrictedToUser } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  if (!soundUrl && !response) return res.status(400).json({ error: 'response requis (sauf pour une commande de type Son)' });

  const cmd = await Command.findOneAndUpdate(
    { channel: CHANNEL, name: name.toLowerCase().replace(/^!/, '') },
    {
      channel: CHANNEL,
      name: name.toLowerCase().replace(/^!/, ''),
      response: response || '',
      cooldown: cooldown ?? 5,
      userLevel: userLevel ?? 'everyone',
      isVoice: !!isVoice,
      soundUrl: soundUrl || null,
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

module.exports = router;
