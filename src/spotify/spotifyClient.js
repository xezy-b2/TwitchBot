const axios = require('axios');
const SpotifyToken = require('../models/SpotifyToken');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

/** Récupère un access token Spotify valide pour la chaîne (refresh si expiré). */
async function getAccessToken(channel) {
  const tokenDoc = await SpotifyToken.findOne({ channel: channel.toLowerCase() });
  if (!tokenDoc) return null;

  if (Date.now() < new Date(tokenDoc.expiresAt).getTime() - 60000) {
    return tokenDoc.accessToken;
  }

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const { data } = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenDoc.refreshToken }),
    { headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  tokenDoc.accessToken = data.access_token;
  // Spotify ne renvoie pas toujours un nouveau refresh_token : on garde l'ancien si absent
  if (data.refresh_token) tokenDoc.refreshToken = data.refresh_token;
  tokenDoc.expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await tokenDoc.save();

  return tokenDoc.accessToken;
}

/**
 * Récupère le morceau en cours de lecture sur le compte Spotify connecté.
 * Renvoie null si rien ne joue, si Spotify est en pause, ou si aucun compte
 * n'est connecté.
 */
async function getCurrentlyPlaying(channel) {
  const token = await getAccessToken(channel);
  if (!token) return null;

  try {
    const { data, status } = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: (s) => s === 200 || s === 204
    });

    if (status === 204 || !data || !data.item) return { isPlaying: false };

    return {
      isPlaying: data.is_playing,
      title: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(', '),
      albumArt: data.item.album.images?.[0]?.url || null,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms,
      trackId: data.item.id
    };
  } catch (err) {
    console.error('[Spotify] Erreur récupération morceau en cours :', err.response?.data || err.message);
    return null;
  }
}

module.exports = { getAccessToken, getCurrentlyPlaying };
