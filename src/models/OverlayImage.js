const mongoose = require('mongoose');

// Comme pour les sons du soundboard : stocké en base (pas sur disque) pour
// survivre aux redéploiements sur un hébergeur comme Render.
const overlayImageSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true },
  mimeType: { type: String, required: true },
  data: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.model('OverlayImage', overlayImageSchema);
