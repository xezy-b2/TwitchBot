const express = require('express');
const router = express.Router();
const SoundFile = require('../../models/SoundFile');

// Accès public (pas d'auth) : l'overlay OBS charge directement <audio src="...">
// sans passer par une session, comme pour les overlays et les fichiers uploadés.
router.get('/:id', async (req, res) => {
  try {
    const soundFile = await SoundFile.findById(req.params.id);
    if (!soundFile) return res.status(404).send('Son introuvable.');

    res.set('Content-Type', soundFile.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000'); // le contenu ne change jamais pour un id donné
    res.send(soundFile.data);
  } catch (err) {
    res.status(404).send('Son introuvable.');
  }
});

module.exports = router;
