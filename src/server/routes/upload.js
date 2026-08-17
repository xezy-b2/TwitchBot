const express = require('express');
const multer = require('multer');
const router = express.Router();
const SoundFile = require('../../models/SoundFile');

const CHANNEL = process.env.TWITCH_CHANNEL.toLowerCase();

// Stockage en mémoire (pas sur disque) : le fichier est ensuite sauvegardé
// directement dans MongoDB, qui persiste correctement même sur un hébergeur
// comme Render où le disque du service est effacé à chaque redéploiement.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new Error('Seuls les fichiers audio (mp3, wav, ogg...) sont acceptés.'));
    }
    cb(null, true);
  }
});

router.post('/sounds/upload', (req, res) => {
  upload.single('sound')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    const soundFile = await SoundFile.create({
      channel: CHANNEL,
      mimeType: req.file.mimetype,
      data: req.file.buffer
    });

    res.json({ url: `/sound-files/${soundFile._id}` });
  });
});

module.exports = router;
