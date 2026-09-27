const express = require('express');
const multer = require('multer');
const router = express.Router();
const SoundFile = require('../../models/SoundFile');
const OverlayImage = require('../../models/OverlayImage');
const Settings = require('../../models/Settings');

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

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Seuls les fichiers image (jpg, png, webp...) sont acceptés.'));
    }
    cb(null, true);
  }
});

const VALID_TARGETS = ['subathon', 'goal', 'lastEvents'];

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

// Upload d'une image de fond pour un overlay précis (subathon, goal, lastEvents).
// Remplace/nettoie automatiquement l'ancienne image de ce même emplacement.
router.post('/overlay-backgrounds/upload', (req, res) => {
  uploadImage.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    const target = req.body.target;
    if (!VALID_TARGETS.includes(target)) {
      return res.status(400).json({ error: 'Cible invalide (subathon, goal ou lastEvents attendu).' });
    }

    // Nettoie l'ancienne image de ce même emplacement si elle existe, pour ne pas
    // accumuler des données orphelines en base à chaque remplacement.
    const existingSettings = await Settings.findOne({ channel: CHANNEL });
    const oldUrl = existingSettings?.overlayBackgrounds?.[target];
    if (oldUrl) {
      const oldId = oldUrl.split('/').pop();
      await OverlayImage.findByIdAndDelete(oldId).catch(() => {});
    }

    const image = await OverlayImage.create({
      channel: CHANNEL,
      mimeType: req.file.mimetype,
      data: req.file.buffer
    });
    const url = `/overlay-images/${image._id}`;

    const settings = await Settings.findOneAndUpdate(
      { channel: CHANNEL },
      { $set: { [`overlayBackgrounds.${target}`]: url } },
      { upsert: true, new: true }
    );

    res.json({ url, target });
  });
});

router.delete('/overlay-backgrounds/:target', async (req, res) => {
  const target = req.params.target;
  if (!VALID_TARGETS.includes(target)) {
    return res.status(400).json({ error: 'Cible invalide.' });
  }
  const settings = await Settings.findOne({ channel: CHANNEL });
  const oldUrl = settings?.overlayBackgrounds?.[target];
  if (oldUrl) {
    const oldId = oldUrl.split('/').pop();
    await OverlayImage.findByIdAndDelete(oldId).catch(() => {});
  }
  await Settings.findOneAndUpdate(
    { channel: CHANNEL },
    { $set: { [`overlayBackgrounds.${target}`]: null } }
  );
  res.json({ ok: true });
});

module.exports = router;
