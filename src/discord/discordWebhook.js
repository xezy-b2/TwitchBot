const axios = require('axios');

/** Convertit une couleur hex (#2E9A5C) en entier décimal attendu par l'API Discord. */
function hexToDecimal(hex) {
  if (!hex) return 0x2E9A5C;
  const clean = hex.replace('#', '');
  const parsed = parseInt(clean, 16);
  return Number.isNaN(parsed) ? 0x2E9A5C : parsed;
}

function fillPlaceholders(template, data) {
  return (template || '')
    .replace(/{clipper}/g, data.clipper || '')
    .replace(/{broadcaster}/g, data.broadcaster || '')
    .replace(/{game}/g, data.game || '')
    .replace(/{title}/g, data.title || '');
}

/**
 * Envoie un clip fraîchement créé vers Discord via webhook, avec un embed
 * dont le texte est personnalisable depuis le dashboard.
 */
async function sendClipToDiscord(discordSettings, data) {
  if (!discordSettings?.clipWebhookUrl) return;

  const embed = {
    title: fillPlaceholders(discordSettings.embedTitle, data) || 'Nouveau clip !',
    description: fillPlaceholders(discordSettings.embedDescription, data),
    url: data.clipUrl,
    color: hexToDecimal(discordSettings.embedColor)
  };

  if (data.thumbnailUrl) embed.image = { url: data.thumbnailUrl };
  if (discordSettings.embedFooter) embed.footer = { text: fillPlaceholders(discordSettings.embedFooter, data) };

  try {
    await axios.post(discordSettings.clipWebhookUrl, { embeds: [embed] });
  } catch (err) {
    console.error('[Discord] Erreur envoi webhook clip :', err.response?.data || err.message);
  }
}

module.exports = { sendClipToDiscord };
