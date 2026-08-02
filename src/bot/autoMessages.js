const AutoMessage = require('../models/AutoMessage');
const { isChatActive } = require('./client');

/**
 * Démarre la boucle des messages automatiques (ex: rappel Discord toutes les
 * 30 minutes). Un message n'est envoyé que si le chat a été actif récemment,
 * pour éviter de spammer un chat vide.
 */
function startAutoMessageLoop(channel, client) {
  channel = channel.toLowerCase();

  setInterval(async () => {
    try {
      const messages = await AutoMessage.find({ channel, enabled: true });
      const now = Date.now();

      for (const msg of messages) {
        const elapsedMs = msg.lastSentAt ? now - new Date(msg.lastSentAt).getTime() : Infinity;
        if (elapsedMs < msg.intervalMinutes * 60 * 1000) continue;
        if (!isChatActive(msg.intervalMinutes)) continue; // chat inactif, on ne dérange personne

        client.say(`#${channel}`, msg.text);
        msg.lastSentAt = new Date();
        await msg.save();
      }
    } catch (err) {
      console.error('[AutoMessages] Erreur :', err.message);
    }
  }, 60 * 1000); // vérification chaque minute
}

module.exports = { startAutoMessageLoop };
