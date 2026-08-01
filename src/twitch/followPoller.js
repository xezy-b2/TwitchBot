const { getChannelFollowers } = require('./helixClient');
const FollowState = require('../models/FollowState');

const POLL_INTERVAL_MS = 30 * 1000; // toutes les 30 secondes

/**
 * Vérifie périodiquement la liste des abonnés (followers) de la chaîne et
 * appelle onNewFollow({ user }) pour chaque nouveau follow détecté depuis le
 * dernier check. Beaucoup plus fiable que l'événement EventSub "channel.follow",
 * qui est connu pour ne pas toujours être délivré par Twitch en temps réel.
 */
const activeIntervals = new Map(); // channel -> intervalId, pour éviter les doublons

async function startFollowPolling(channel, broadcasterId, onNewFollow) {
  channel = channel.toLowerCase();

  // Si un polling tourne déjà pour cette chaîne (ex: relance après connexion OAuth), on l'arrête d'abord
  if (activeIntervals.has(channel)) {
    clearInterval(activeIntervals.get(channel));
    activeIntervals.delete(channel);
  }

  let state = await FollowState.findOne({ channel });
  if (!state) state = await FollowState.create({ channel });

  // Premier lancement : on prend une photo de référence sans déclencher d'alertes,
  // pour ne pas annoncer tous les followers existants au premier démarrage.
  if (!state.initialized) {
    const followers = await getChannelFollowers(channel, broadcasterId, 1);
    if (followers && followers.length > 0) {
      state.lastFollowedAt = new Date(followers[0].followed_at);
    } else {
      state.lastFollowedAt = new Date(0);
    }
    state.initialized = true;
    await state.save();
    console.log('[FollowPoller] Référence initiale enregistrée, prêt à détecter les nouveaux follows.');
  }

  const intervalId = setInterval(async () => {
    try {
      const followers = await getChannelFollowers(channel, broadcasterId, 20);
      if (!followers) return; // pas de token Twitch connecté

      const lastKnown = state.lastFollowedAt ? state.lastFollowedAt.getTime() : 0;
      // La liste est triée du plus récent au plus ancien : on prend les nouveaux
      const newOnes = followers.filter((f) => new Date(f.followed_at).getTime() > lastKnown);

      if (newOnes.length === 0) return;

      // Du plus ancien au plus récent pour annoncer dans le bon ordre
      newOnes.reverse().forEach((f) => onNewFollow({ user: f.user_name }));

      const newest = newOnes[newOnes.length - 1];
      state.lastFollowedAt = new Date(newest.followed_at);
      await state.save();
    } catch (err) {
      console.error('[FollowPoller] Erreur lors de la vérification des followers :', err.response?.data || err.message);
    }
  }, POLL_INTERVAL_MS);

  activeIntervals.set(channel, intervalId);
}

module.exports = { startFollowPolling };
