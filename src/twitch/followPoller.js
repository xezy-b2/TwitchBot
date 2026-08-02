const { getChannelFollowers } = require('./helixClient');
const FollowState = require('../models/FollowState');

const POLL_INTERVAL_MS = 30 * 1000; // toutes les 30 secondes

/**
 * Vérifie périodiquement la liste des abonnés (followers) de la chaîne et
 * appelle onNewFollow({ user, totalFollowers, followsThisStream }) pour chaque
 * nouveau follow détecté depuis le dernier check. Beaucoup plus fiable que
 * l'événement EventSub "channel.follow", qui est connu pour ne pas toujours
 * être délivré par Twitch en temps réel.
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
    const result = await getChannelFollowers(channel, broadcasterId, 1);
    if (result && result.followers.length > 0) {
      state.lastFollowedAt = new Date(result.followers[0].followed_at);
    } else {
      state.lastFollowedAt = new Date(0);
    }
    state.initialized = true;
    await state.save();
    console.log('[FollowPoller] Référence initiale enregistrée, prêt à détecter les nouveaux follows.');
  }

  const intervalId = setInterval(async () => {
    try {
      const result = await getChannelFollowers(channel, broadcasterId, 20);
      if (!result) return; // pas de token Twitch connecté
      const { followers, total } = result;

      const lastKnown = state.lastFollowedAt ? state.lastFollowedAt.getTime() : 0;
      // La liste est triée du plus récent au plus ancien : on prend les nouveaux
      const newOnes = followers.filter((f) => new Date(f.followed_at).getTime() > lastKnown);

      if (newOnes.length === 0) return;

      // Du plus ancien au plus récent pour annoncer dans le bon ordre
      const ordered = [...newOnes].reverse();
      for (const f of ordered) {
        state.followsThisStream += 1;
        onNewFollow({ user: f.user_name, totalFollowers: total, followsThisStream: state.followsThisStream });
      }

      const newest = newOnes[newOnes.length - 1];
      state.lastFollowedAt = new Date(newest.followed_at);
      await state.save();
    } catch (err) {
      console.error('[FollowPoller] Erreur lors de la vérification des followers :', err.response?.data || err.message);
    }
  }, POLL_INTERVAL_MS);

  activeIntervals.set(channel, intervalId);
}

/** Remet à zéro le compteur "follows pendant ce live" (à appeler quand un nouveau live démarre). */
async function resetStreamFollowCounter(channel) {
  channel = channel.toLowerCase();
  await FollowState.findOneAndUpdate({ channel }, { followsThisStream: 0 }, { upsert: true });
  console.log(`[FollowPoller] Compteur "follows pendant ce live" remis à zéro pour ${channel}.`);
}

module.exports = { startFollowPolling, resetStreamFollowCounter };
