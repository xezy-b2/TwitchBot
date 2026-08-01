const { Server } = require('socket.io');

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('[Socket.io] Client connecté :', socket.id);
    socket.on('disconnect', () => {
      console.log('[Socket.io] Client déconnecté :', socket.id);
    });
  });

  return io;
}

/** Envoie une alerte (follow/sub/resub/giftsub/cheer) à tous les overlays connectés. */
function sendAlert(io, type, data) {
  io.emit('alert', { type, ...data, timestamp: Date.now() });
}

/** Envoie un texte à faire lire par l'overlay TTS (Web Speech API côté navigateur). */
function sendTTS(io, text, voiceName) {
  io.emit('tts', { text, voiceName, timestamp: Date.now() });
}

/** Envoie une URL de fichier audio (mp3) à jouer sur l'overlay (soundboard), avec un volume 0-100. */
function sendSound(io, url, volume = 100) {
  io.emit('sound', { url, volume, timestamp: Date.now() });
}

module.exports = { createSocketServer, sendAlert, sendTTS, sendSound };
