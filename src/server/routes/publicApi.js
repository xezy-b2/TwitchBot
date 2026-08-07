const express = require('express');
const router = express.Router();
const subathonManager = require('../../subathon/subathonManager');
const longTermGoalManager = require('../../points/longTermGoalManager');
const LastEventState = require('../../models/LastEventState');
const AchievementState = require('../../models/AchievementState');
const Settings = require('../../models/Settings');
const { getCurrentlyPlaying } = require('../../spotify/spotifyClient');
const statsManager = require('../../points/statsManager');

const CHANNEL = process.env.TWITCH_CHANNEL.toLowerCase();

// Accès public (pas d'auth) : l'overlay OBS n'a pas de session, il a besoin
// de l'état initial du subathon + des objectifs au chargement de la page.
router.get('/subathon', async (req, res) => {
  const state = await subathonManager.getState(CHANNEL);
  const goals = await subathonManager.getGoals(CHANNEL);
  res.json({
    isRunning: state.isRunning,
    secondsRemaining: state.secondsRemaining,
    totalSecondsAdded: state.totalSecondsAdded,
    totalSubs: state.totalSubs,
    totalBits: state.totalBits,
    goals
  });
});

// État initial de l'overlay "dernier follower / dernier sub"
router.get('/lastevents', async (req, res) => {
  const state = await LastEventState.findOne({ channel: CHANNEL });
  res.json({
    lastFollowerName: state?.lastFollowerName || null,
    lastFollowerAt: state?.lastFollowerAt || null,
    lastSubName: state?.lastSubName || null,
    lastSubAt: state?.lastSubAt || null
  });
});

// État initial de l'overlay "objectif long terme"
router.get('/longtermgoal', async (req, res) => {
  const goal = await longTermGoalManager.getGoal(CHANNEL);
  res.json(goal);
});

// État initial de l'overlay "Now Playing" (les mises à jour suivantes arrivent par socket)
router.get('/nowplaying', async (req, res) => {
  const current = await getCurrentlyPlaying(CHANNEL);
  res.json(current || { isPlaying: false });
});

// État initial de l'overlay "succès Steam"
router.get('/achievements', async (req, res) => {
  const state = await AchievementState.findOne({ channel: CHANNEL });
  res.json(state || { hasAchievements: false });
});

// Overlay "stats viewers" : classement + réglages d'affichage pour la métrique/période demandées
router.get('/viewerstats', async (req, res) => {
  const metric = ['uptime', 'messages', 'level', 'currency', 'subs'].includes(req.query.metric) ? req.query.metric : 'uptime';
  const period = ['week', 'month', 'session', 'global'].includes(req.query.period) ? req.query.period : 'global';
  const settings = await Settings.findOne({ channel: CHANNEL });
  const leaderboard = await statsManager.getLeaderboard(CHANNEL, metric, period, settings?.statsOverlay?.topCount || 10);
  res.json({
    metric,
    period,
    pointsName: settings?.pointsName || 'points',
    settings: settings?.statsOverlay || {},
    leaderboard
  });
});

module.exports = router;
