const express = require('express');
const router = express.Router();
const OverlayImage = require('../../models/OverlayImage');

// Accès public (pas d'auth) : l'overlay OBS charge directement l'image en
// background-image sans passer par une session.
router.get('/:id', async (req, res) => {
  try {
    const image = await OverlayImage.findById(req.params.id);
    if (!image) return res.status(404).send('Image introuvable.');

    res.set('Content-Type', image.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(image.data);
  } catch (err) {
    res.status(404).send('Image introuvable.');
  }
});

module.exports = router;
