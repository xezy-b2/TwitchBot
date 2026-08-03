const axios = require('axios');

const STEAM_API_KEY = process.env.STEAM_API_KEY;

/**
 * Cherche un jeu Steam par son nom (ex: le nom de la catégorie Twitch) et
 * renvoie le meilleur résultat trouvé, ou null si rien de pertinent.
 * Recherche automatique : peut se tromper sur des titres ambigus/génériques.
 */
async function searchSteamAppId(gameName) {
  try {
    const { data } = await axios.get('https://store.steampowered.com/api/storesearch/', {
      params: { term: gameName, cc: 'us', l: 'english' }
    });
    if (!data.items || data.items.length === 0) return null;
    return { appId: data.items[0].id, name: data.items[0].name };
  } catch (err) {
    console.error('[Steam] Erreur recherche jeu :', err.message);
    return null;
  }
}

/**
 * Récupère les succès débloqués/totaux pour un joueur sur un jeu donné.
 * Renvoie null si le jeu n'a pas de succès, si le profil est privé, ou en cas d'erreur.
 */
async function getAchievements(appId, steamId64) {
  if (!STEAM_API_KEY || !steamId64) return null;

  try {
    const { data } = await axios.get('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/', {
      params: { appid: appId, key: STEAM_API_KEY, steamid: steamId64, l: 'english' }
    });

    const stats = data.playerstats;
    if (!stats || !stats.success || !stats.achievements) return null;

    const total = stats.achievements.length;
    const unlocked = stats.achievements.filter((a) => a.achieved === 1).length;
    return { total, unlocked, gameName: stats.gameName };
  } catch (err) {
    // 400/403 fréquents si le jeu n'a pas de succès ou si le profil est privé : pas une vraie erreur
    return null;
  }
}

module.exports = { searchSteamAppId, getAchievements };
