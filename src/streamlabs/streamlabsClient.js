const { io } = require('socket.io-client');

const activeConnections = new Map(); // channel -> socket instance

/**
 * Se connecte à l'API Socket de Streamlabs avec le token du streamer (récupéré
 * depuis streamlabs.com/dashboard#/settings/api-settings, section "Socket API").
 * onDonation(channel, { amount, currency, from, message }) est appelé à chaque don reçu.
 */
function connectStreamlabs(channel, token, onDonation) {
  channel = channel.toLowerCase();
  disconnectStreamlabs(channel); // évite les connexions en double si on rebranche
  if (!token) return;

  const socket = io(`https://sockets.streamlabs.com?token=${token}`, {
    transports: ['websocket'],
    reconnection: true
  });

  socket.on('connect', () => {
    console.log(`[Streamlabs] Connecté pour ${channel}.`);
  });

  socket.on('event', (eventData) => {
    if (eventData?.type !== 'donation' || !Array.isArray(eventData.message)) return;
    for (const donation of eventData.message) {
      const amount = parseFloat(donation.amount);
      if (!Number.isNaN(amount)) {
        onDonation(channel, {
          amount,
          currency: donation.currency || 'EUR',
          from: donation.name || donation.from || '?',
          message: donation.message || ''
        });
      }
    }
  });

  socket.on('connect_error', (err) => {
    console.error(`[Streamlabs] Erreur de connexion pour ${channel} :`, err.message);
  });

  activeConnections.set(channel, socket);
}

function disconnectStreamlabs(channel) {
  channel = channel.toLowerCase();
  const existing = activeConnections.get(channel);
  if (existing) {
    existing.disconnect();
    activeConnections.delete(channel);
  }
}

module.exports = { connectStreamlabs, disconnectStreamlabs };
