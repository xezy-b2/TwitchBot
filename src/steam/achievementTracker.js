const SteamGameMapping = require('../models/SteamGameMapping');
const AchievementState = require('../models/AchievementState');
const Settings = require('../models/Settings');
const { searchSteamAppId, getAchievements } = require('./steamClient');

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
  mapping = await SteamGameMapping.create({
    channel,
    twitchCategoryName: key,
    steamAppId: result?.appId || null,
    steamGameName: result?.name || null
  });
  return mapping;
}

/**
 * Appelée quand la catégorie Twitch change (ou au démarrage du bot) : résout
 * le jeu Steam correspondant et met à jour l'état des succès affiché sur l'overlay.
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
    steamGameName: mapping.steamGameName,
    hasAchievements: false,
    unlocked: 0,
    total: 0
  };

  if (mapping.steamAppId && steamId64) {
    const achievements = await getAchievements(mapping.steamAppId, steamId64);
    if (achievements) {
      stateUpdate.hasAchievements = true;
      stateUpdate.unlocked = achievements.unlocked;
      stateUpdate.total = achievements.total;
    }
  }

  const state = await AchievementState.findOneAndUpdate({ channel }, stateUpdate, { upsert: true, new: true });
  broadcast(io, state);
}

/**
 * Démarre une vérification périodique des succès du jeu actuellement suivi
 * (les succès se débloquent en cours de partie, pas seulement au changement de catégorie).
 */
function startPeriodicRefresh(channel, io) {
  channel = channel.toLowerCase();

  if (activeIntervals.has(channel)) {
    clearInterval(activeIntervals.get(channel));
    activeIntervals.delete(channel);
  }

  const intervalId = setInterval(async () => {
    const state = await AchievementState.findOne({ channel });
    if (!state || !state.hasAchievements || !state.twitchCategoryName) return;

    await refreshForCategory(channel, state.twitchCategoryName, io);
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
