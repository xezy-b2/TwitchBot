const axios = require('axios');
const TwitchToken = require('../models/TwitchToken');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let appAccessToken = null;
let appTokenExpiresAt = 0;

/**
 * Récupère (et cache) un App Access Token (client_credentials).
 * Utilisé pour les appels publics (get users, get games, get streams).
 */
async function getAppAccessToken() {
  if (appAccessToken && Date.now() < appTokenExpiresAt - 60000) {
    return appAccessToken;
  }
  const { data } = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    }
  });
  appAccessToken = data.access_token;
  appTokenExpiresAt = Date.now() + data.expires_in * 1000;
  return appAccessToken;
}

/**
 * Récupère un user access token valide pour la chaîne (refresh si expiré).
 * Nécessaire pour EventSub (follow/sub) et pour modifier la chaîne (setgame).
 */
async function getUserAccessToken(channel) {
  const tokenDoc = await TwitchToken.findOne({ channel: channel.toLowerCase() });
  if (!tokenDoc) return null;

  if (Date.now() < new Date(tokenDoc.expiresAt).getTime() - 60000) {
    return tokenDoc.accessToken;
  }

  // Refresh
  const { data } = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokenDoc.refreshToken
    }
  });

  tokenDoc.accessToken = data.access_token;
  tokenDoc.refreshToken = data.refresh_token;
  tokenDoc.expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await tokenDoc.save();

  return tokenDoc.accessToken;
}

function helixHeaders(token) {
  return {
    'Client-Id': CLIENT_ID,
    Authorization: `Bearer ${token}`
  };
}

async function getUserByLogin(login) {
  const token = await getAppAccessToken();
  const { data } = await axios.get('https://api.twitch.tv/helix/users', {
    headers: helixHeaders(token),
    params: { login }
  });
  return data.data[0] || null;
}

async function getStreamByLogin(login) {
  const token = await getAppAccessToken();
  const { data } = await axios.get('https://api.twitch.tv/helix/streams', {
    headers: helixHeaders(token),
    params: { user_login: login }
  });
  return data.data[0] || null;
}

async function getChannelInfo(broadcasterId) {
  const token = await getAppAccessToken();
  const { data } = await axios.get('https://api.twitch.tv/helix/channels', {
    headers: helixHeaders(token),
    params: { broadcaster_id: broadcasterId }
  });
  return data.data[0] || null;
}

async function searchGame(gameName) {
  const token = await getAppAccessToken();
  const { data } = await axios.get('https://api.twitch.tv/helix/games', {
    headers: helixHeaders(token),
    params: { name: gameName }
  });
  return data.data[0] || null;
}

/**
 * Modifie le jeu/catégorie de la chaîne (!setgame).
 * Nécessite un user access token avec le scope "channel:manage:broadcast".
 */
async function setChannelGame(channel, broadcasterId, gameName) {
  const game = await searchGame(gameName);
  if (!game) return { ok: false, error: `Jeu "${gameName}" introuvable sur Twitch.` };

  const userToken = await getUserAccessToken(channel);
  if (!userToken) {
    return { ok: false, error: 'Compte Twitch non connecté au dashboard (bouton "Connecter Twitch").' };
  }

  await axios.patch(
    'https://api.twitch.tv/helix/channels',
    { game_id: game.id },
    {
      headers: helixHeaders(userToken),
      params: { broadcaster_id: broadcasterId }
    }
  );

  return { ok: true, game: game.name };
}

async function setChannelTitle(channel, broadcasterId, title) {
  const userToken = await getUserAccessToken(channel);
  if (!userToken) {
    return { ok: false, error: 'Compte Twitch non connecté au dashboard (bouton "Connecter Twitch").' };
  }
  await axios.patch(
    'https://api.twitch.tv/helix/channels',
    { title },
    {
      headers: helixHeaders(userToken),
      params: { broadcaster_id: broadcasterId }
    }
  );
  return { ok: true };
}

async function getChannelFollowers(channel, broadcasterId, first = 20) {
  const userToken = await getUserAccessToken(channel);
  if (!userToken) return null;
  const { data } = await axios.get('https://api.twitch.tv/helix/channels/followers', {
    headers: helixHeaders(userToken),
    params: { broadcaster_id: broadcasterId, first }
  });
  return data.data; // [{ user_id, user_login, user_name, followed_at }, ...] triés du plus récent au plus ancien
}

module.exports = {
  getAppAccessToken,
  getUserAccessToken,
  getUserByLogin,
  getStreamByLogin,
  getChannelInfo,
  searchGame,
  setChannelGame,
  setChannelTitle,
  getChannelFollowers
};
