const express = require('express');
const router = express.Router();
const subathonManager = require('../../subathon/subathonManager');

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

module.exports = router;
