const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const SOUNDS_DIR = path.join(__dirname, '../../../public/uploads/sounds');
fs.mkdirSync(SOUNDS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SOUNDS_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new Error('Seuls les fichiers audio (mp3, wav, ogg...) sont acceptés.'));
    }
    cb(null, true);
  }
});

router.post('/sounds/upload', (req, res) => {
  upload.single('sound')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    res.json({ url: `/uploads/sounds/${req.file.filename}` });
  });
});

module.exports = router;
