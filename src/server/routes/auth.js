const express = require('express');
const axios = require('axios');
const router = express.Router();
const TwitchToken = require('../../models/TwitchToken');
const SpotifyToken = require('../../models/SpotifyToken');

const SCOPES = [
  'moderator:read:followers',
  'channel:read:subscriptions',
  'channel:manage:broadcast',
  'bits:read'
].join(' ');

const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

// --- Login simple au dashboard (mot de passe défini dans .env) ---
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

router.get('/status', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

// --- OAuth Twitch : nécessaire pour EventSub (follow/sub) et setgame/settitle ---
router.get('/twitch', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: process.env.TWITCH_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES
  });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

router.get('/twitch/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Code OAuth manquant.');

  try {
    const { data: tokenData } = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TWITCH_REDIRECT_URI
      }
    });

    const { data: userData } = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const twitchUser = userData.data[0];
    const channel = process.env.TWITCH_CHANNEL.toLowerCase();

    await TwitchToken.findOneAndUpdate(
      { channel },
      {
        channel,
        broadcasterId: twitchUser.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        scope: tokenData.scope,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
      },
      { upsert: true }
    );

    // Démarre (ou redémarre) la connexion EventSub maintenant qu'on a un token valide
    if (req.app.locals.restartEventSub) {
      await req.app.locals.restartEventSub();
    }

    res.redirect('/dashboard?twitch=connected');
  } catch (err) {
    console.error('[OAuth Twitch] Erreur :', err.response?.data || err.message);
    res.status(500).send('Erreur lors de la connexion à Twitch.');
  }
});

// --- OAuth Spotify : nécessaire pour l'overlay "Now Playing" ---
router.get('/spotify', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    response_type: 'code',
    scope: SPOTIFY_SCOPES
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

router.get('/spotify/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Code OAuth Spotify manquant.');

  try {
    const basicAuth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const { data: tokenData } = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI
      }),
      { headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const channel = process.env.TWITCH_CHANNEL.toLowerCase();

    await SpotifyToken.findOneAndUpdate(
      { channel },
      {
        channel,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
      },
      { upsert: true }
    );

    if (req.app.locals.onSpotifyConnected) {
      await req.app.locals.onSpotifyConnected();
    }

    res.redirect('/dashboard?spotify=connected');
  } catch (err) {
    console.error('[OAuth Spotify] Erreur :', err.response?.data || err.message);
    res.status(500).send('Erreur lors de la connexion à Spotify.');
  }
});

module.exports = router;
