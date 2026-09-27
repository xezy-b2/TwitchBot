const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/twitch-bot';
  try {
    await mongoose.connect(uri);
    console.log('[MongoDB] Connecté avec succès à', uri);
  } catch (err) {
    console.error('[MongoDB] Erreur de connexion :', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
