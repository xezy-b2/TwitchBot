const SteamGameMapping = require('../models/SteamGameMapping');
const AchievementState = require('../models/AchievementState');
const Settings = require('../models/Settings');
const { searchSteamAppId, getAchievements, getPlaytimeMinutes } = require('./steamClient');

const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // vérifie les succès du jeu en cours toutes les 2 minutes
const activeIntervals = new Map(); // channel -> intervalId

function broadcast(io, state) {
  io.emit('achievements:update', state);
}

/** Trouve (ou résout via recherche Steam) l'AppID correspondant à une catégorie Twitch. */
async function resolveAppId(channel, categoryName) {
  channel = channel.toLowerCase();
  const key = categoryName.toLowerCase();

  let mapping = await SteamGameMapping.findOne({ channel, twitchCategoryName: key });
  if (mapping) return mapping; // déjà résolu (avec ou sans succès) : on ne refait pas de recherche

  const result = await searchSteamAppId(categoryName);

  try {
    // upsert atomique : si un événement Twitch en double déclenche deux résolutions
    // en même temps pour la même catégorie, une seule création aboutit.
    mapping = await SteamGameMapping.findOneAndUpdate(
      { channel, twitchCategoryName: key },
      { $setOnInsert: { steamAppId: result?.appId || null, steamGameName: result?.name || null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      // L'autre requête concurrente a gagné la course : on relit simplement ce qu'elle a créé
      mapping = await SteamGameMapping.findOne({ channel, twitchCategoryName: key });
    } else {
      throw err;
    }
  }

  return mapping;
}

/**
 * Appelée quand la catégorie Twitch change (ou au démarrage du bot) : résout
 * le jeu Steam correspondant et met à jour l'état des succès affiché sur l'overlay.
 * Ne déclenche JAMAIS de message de chat (on ne veut pas annoncer tous les succès
 * déjà obtenus par le passé au moment où on bascule sur ce jeu).
 */
async function refreshForCategory(channel, categoryName, io) {
  channel = channel.toLowerCase();
  if (!categoryName) return;

  const settings = await Settings.findOne({ channel });
  const steamId64 = settings?.steamId64;

  const mapping = await resolveAppId(channel, categoryName);

  let stateUpdate = {
    channel,
    twitchCategoryName: categoryName,
    steamAppId: mapping.steamAppId || null,
    steamGameName: mapping.steamGameName,
    hasAchievements: false,
    unlocked: 0,
    total: 0,
    playtimeMinutes: null
  };

  if (mapping.steamAppId && steamId64) {
    const achievements = await getAchievements(mapping.steamAppId, steamId64);
    if (achievements) {
      stateUpdate.hasAchievements = true;
      stateUpdate.unlocked = achievements.unlocked;
      stateUpdate.total = achievements.total;
    }
    stateUpdate.playtimeMinutes = await getPlaytimeMinutes(mapping.steamAppId, steamId64);
  }

  const state = await AchievementState.findOneAndUpdate({ channel }, stateUpdate, { upsert: true, new: true });
  broadcast(io, state);
}

/**
 * Vérifie si de nouveaux succès ont été débloqués depuis la dernière vérification
 * pour le jeu actuellement suivi. Si oui, met à jour l'overlay ET appelle onUnlock
 * pour envoyer un message dans le chat (contrairement à refreshForCategory, qui reste silencieux).
 */
async function checkForNewAchievements(channel, io, onUnlock) {
  channel = channel.toLowerCase();
  const state = await AchievementState.findOne({ channel });
  if (!state || !state.hasAchievements || !state.steamAppId) return;

  const settings = await Settings.findOne({ channel });
  const steamId64 = settings?.steamId64;
  if (!steamId64) return;

  const achievements = await getAchievements(state.steamAppId, steamId64);
  if (!achievements) return;

  const previousUnlocked = state.unlocked;
  const playtimeMinutes = await getPlaytimeMinutes(state.steamAppId, steamId64);

  state.unlocked = achievements.unlocked;
  state.total = achievements.total;
  state.playtimeMinutes = playtimeMinutes;
  await state.save();
  broadcast(io, state);

  if (achievements.unlocked > previousUnlocked) {
    const unlockData = {
      gameName: state.steamGameName || state.twitchCategoryName,
      unlocked: achievements.unlocked,
      total: achievements.total
    };
    io.emit('achievement:unlocked', unlockData); // déclenche l'animation sur l'overlay
    if (onUnlock) onUnlock(unlockData); // déclenche le message de chat
  }
}

/**
 * Démarre une vérification périodique des succès du jeu actuellement suivi
 * (les succès se débloquent en cours de partie, pas seulement au changement de catégorie).
 * onUnlock({ gameName, unlocked, total }) est appelé à chaque nouveau succès détecté.
 */
function startPeriodicRefresh(channel, io, onUnlock) {
  channel = channel.toLowerCase();

  if (activeIntervals.has(channel)) {
    clearInterval(activeIntervals.get(channel));
    activeIntervals.delete(channel);
  }

  const intervalId = setInterval(() => {
    checkForNewAchievements(channel, io, onUnlock);
  }, REFRESH_INTERVAL_MS);

  activeIntervals.set(channel, intervalId);
}

/** Correction manuelle depuis le dashboard si la recherche automatique s'est trompée de jeu. */
async function setManualMapping(channel, categoryName, steamAppId, io) {
  channel = channel.toLowerCase();
  const key = categoryName.toLowerCase();

  await SteamGameMapping.findOneAndUpdate(
    { channel, twitchCategoryName: key },
    { steamAppId, steamGameName: null },
    { upsert: true }
  );

  await refreshForCategory(channel, categoryName, io);
}

module.exports = { refreshForCategory, startPeriodicRefresh, setManualMapping };
