const { getCurrentlyPlaying } = require('./spotifyClient');

const POLL_INTERVAL_MS = 5 * 1000;
const activeIntervals = new Map(); // channel -> intervalId

/**
 * Démarre le polling Spotify pour une chaîne : vérifie toutes les 5 secondes
 * ce qui joue, et ne diffuse une mise à jour que si quelque chose a changé
 * (nouveau morceau, pause/lecture) pour éviter de spammer les overlays.
 */
function startNowPlayingPolling(channel, io) {
  channel = channel.toLowerCase();

  if (activeIntervals.has(channel)) {
    clearInterval(activeIntervals.get(channel));
    activeIntervals.delete(channel);
  }

  let lastSignature = null;

  const intervalId = setInterval(async () => {
    const current = await getCurrentlyPlaying(channel);
    if (!current) return; // pas de compte Spotify connecté, ou erreur ponctuelle

    const signature = current.isPlaying ? `${current.trackId}:playing` : 'paused';
    if (signature === lastSignature) return; // rien de nouveau, on ne diffuse pas
    lastSignature = signature;

    io.emit('nowplaying:update', { channel, ...current });
  }, POLL_INTERVAL_MS);

  activeIntervals.set(channel, intervalId);
}

module.exports = { startNowPlayingPolling };
