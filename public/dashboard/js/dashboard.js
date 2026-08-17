const socket = io();

// ============ BARRE DU HAUT : repli sidebar, mode sombre/clair, couleurs personnalisées ============
const THEME_STORAGE_KEY = 'dashboardThemePrefs';

function loadThemePrefs() {
  try {
    return JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveThemePrefs(prefs) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
}

function rgbStringToHex(rgbStr) {
  const nums = (rgbStr || '').match(/\d+/g);
  if (!nums) return '#000000';
  return '#' + nums.slice(0, 3).map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
}

/** Assombrit une couleur hex vers le noir (factor proche de 1 = presque noir), pour le fond de page. */
function darkenHex(hex, factor = 0.78) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return '#' + [dr, dg, db].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function applyThemePrefs(prefs) {
  document.body.classList.toggle('light-theme', prefs.mode === 'light');
  document.getElementById('themeToggleIcon').textContent = prefs.mode === 'light' ? '☀️' : '🌙';
  document.body.classList.toggle('sidebar-collapsed', !!prefs.sidebarCollapsed);

  // Une seule couleur pilote à la fois : le mot "BOT", les icônes/accents, et une
  // version très assombrie de cette même couleur pour le fond de page (pas les
  // encadrés/cartes, qui restent sur --ink2/--track inchangés).
  if (prefs.themeColor) {
    document.body.style.setProperty('--brand-bot-color', prefs.themeColor);
    document.body.style.setProperty('--brg-bright', prefs.themeColor);
    document.body.style.setProperty('--ink', darkenHex(prefs.themeColor));
  } else {
    document.body.style.removeProperty('--brand-bot-color');
    document.body.style.removeProperty('--brg-bright');
    document.body.style.removeProperty('--ink');
  }

  const currentColor = prefs.themeColor || rgbStringToHex(getComputedStyle(document.body).getPropertyValue('--brg-bright'));
  document.getElementById('colorCustomSwatch').style.background = currentColor;
  document.getElementById('colorCustomHex').textContent = currentColor.toUpperCase();

  document.querySelectorAll('.swatch:not(.swatch-reset)').forEach((el) => {
    el.classList.toggle('selected', prefs.themeColor && el.dataset.color.toLowerCase() === prefs.themeColor.toLowerCase());
  });
}

let themePrefs = loadThemePrefs();
applyThemePrefs(themePrefs);

document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
  themePrefs.sidebarCollapsed = !themePrefs.sidebarCollapsed;
  saveThemePrefs(themePrefs);
  applyThemePrefs(themePrefs);
});

document.getElementById('themeToggleBtn').addEventListener('click', () => {
  themePrefs.mode = themePrefs.mode === 'light' ? 'dark' : 'light';
  saveThemePrefs(themePrefs);
  applyThemePrefs(themePrefs);
});

document.getElementById('paletteBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('colorPickerPanel').classList.toggle('show');
});

document.addEventListener('click', (e) => {
  const panel = document.getElementById('colorPickerPanel');
  const switcher = document.getElementById('themeSwitcher');
  if (!switcher.contains(e.target)) {
    panel.classList.remove('show');
    document.getElementById('customPickerPopup').classList.remove('show');
  }
});

/** Applique une couleur temporairement (aperçu au survol), sans la sauvegarder. */
function previewThemeColor(color) {
  document.body.style.setProperty('--brand-bot-color', color);
  document.body.style.setProperty('--brg-bright', color);
  document.body.style.setProperty('--ink', darkenHex(color));
}

document.querySelectorAll('.swatch:not(.swatch-reset)').forEach((swatch) => {
  swatch.addEventListener('mouseenter', () => previewThemeColor(swatch.dataset.color));
  swatch.addEventListener('mouseleave', () => applyThemePrefs(themePrefs)); // revient à l'état validé

  swatch.addEventListener('click', () => {
    themePrefs.themeColor = swatch.dataset.color;
    saveThemePrefs(themePrefs);
    applyThemePrefs(themePrefs);
  });
});

// ============ SÉLECTEUR DE COULEUR PERSONNALISÉ (carré SV + teinte + champs) ============
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s * 100, max * 100];
}

function rgbToHexStr(r, g, b) {
  return '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

function hexToRgbArr(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const svSquare = document.getElementById('svSquare');
const svHandle = document.getElementById('svHandle');
const hueSlider = document.getElementById('hueSlider');
const hueHandle = document.getElementById('hueHandle');
const fieldHex = document.getElementById('fieldHex');
const fieldR = document.getElementById('fieldR');
const fieldG = document.getElementById('fieldG');
const fieldB = document.getElementById('fieldB');
const customPickerPopup = document.getElementById('customPickerPopup');

let pickerH = 145, pickerS = 80, pickerV = 60;

function refreshPickerUI(livePreview = true) {
  const [r, g, b] = hsvToRgb(pickerH, pickerS, pickerV);
  const hex = rgbToHexStr(r, g, b);

  svSquare.style.backgroundColor = `hsl(${pickerH}, 100%, 50%)`;
  svHandle.style.left = `${pickerS}%`;
  svHandle.style.top = `${100 - pickerV}%`;
  hueHandle.style.left = `${(pickerH / 360) * 100}%`;

  fieldHex.value = hex.toUpperCase();
  fieldR.value = r;
  fieldG.value = g;
  fieldB.value = b;

  if (livePreview) previewThemeColor(hex);
}

function setPickerFromHex(hex) {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return;
  if (!hex.startsWith('#')) hex = '#' + hex;
  const [r, g, b] = hexToRgbArr(hex);
  [pickerH, pickerS, pickerV] = rgbToHsv(r, g, b);
  refreshPickerUI();
}

function setPickerFromRgb() {
  const r = Math.max(0, Math.min(255, parseInt(fieldR.value, 10) || 0));
  const g = Math.max(0, Math.min(255, parseInt(fieldG.value, 10) || 0));
  const b = Math.max(0, Math.min(255, parseInt(fieldB.value, 10) || 0));
  [pickerH, pickerS, pickerV] = rgbToHsv(r, g, b);
  refreshPickerUI();
}

function dragSquare(e) {
  const rect = svSquare.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  pickerS = x * 100;
  pickerV = 100 - y * 100;
  refreshPickerUI();
}

function dragHue(e) {
  const rect = hueSlider.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  pickerH = x * 360;
  refreshPickerUI();
}

function bindDrag(el, onMove) {
  el.addEventListener('mousedown', (e) => {
    onMove(e);
    const move = (ev) => onMove(ev);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
bindDrag(svSquare, dragSquare);
bindDrag(hueSlider, dragHue);

fieldHex.addEventListener('change', () => setPickerFromHex(fieldHex.value));
[fieldR, fieldG, fieldB].forEach((f) => f.addEventListener('change', setPickerFromRgb));

document.getElementById('colorCustomToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = !customPickerPopup.classList.contains('show');
  customPickerPopup.classList.toggle('show', opening);
  if (opening) {
    const startColor = themePrefs.themeColor || rgbStringToHex(getComputedStyle(document.body).getPropertyValue('--brg-bright'));
    setPickerFromHex(startColor);
  }
});

document.getElementById('pickerCancelBtn').addEventListener('click', () => {
  customPickerPopup.classList.remove('show');
  applyThemePrefs(themePrefs); // annule l'aperçu, revient à l'état validé
});

document.getElementById('pickerChooseBtn').addEventListener('click', () => {
  themePrefs.themeColor = fieldHex.value;
  saveThemePrefs(themePrefs);
  applyThemePrefs(themePrefs);
  customPickerPopup.classList.remove('show');
});

document.getElementById('eyedropperBtn').addEventListener('click', async () => {
  if (!window.EyeDropper) {
    alert('La pipette n\'est pas prise en charge par ce navigateur (fonctionne sur Chrome/Edge).');
    return;
  }
  try {
    const result = await new window.EyeDropper().open();
    setPickerFromHex(result.sRGBHex);
  } catch (err) {
    // annulé par l'utilisateur, rien à faire
  }
});

document.getElementById('colorResetBtn').addEventListener('click', () => {
  delete themePrefs.themeColor;
  saveThemePrefs(themePrefs);
  applyThemePrefs(themePrefs);
});

// --- Navigation par onglets ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

async function loadTwitchAccountStatus() {
  const res = await fetch('/api/twitch/status');
  const data = await res.json();
  const container = document.getElementById('twitchAccountCard');

  if (!data.connected) {
    container.innerHTML = '<button id="twitchConnectBtn" class="btn-twitch">Connecter Twitch</button>';
    document.getElementById('twitchConnectBtn').addEventListener('click', () => {
      window.location.href = '/auth/twitch';
    });
    return;
  }

  const followerCount = data.followerCount !== null ? data.followerCount.toLocaleString('fr-FR') : '?';
  container.innerHTML = `
    <div class="twitch-profile">
      ${data.profileImageUrl ? `<img class="twitch-avatar" src="${data.profileImageUrl}" alt="" />` : ''}
      <div>
        <p class="twitch-name">${data.displayName}</p>
        <p class="twitch-followers">👥 ${followerCount}</p>
      </div>
    </div>
    <button id="twitchDisconnectBtn" class="twitch-disconnect-btn" title="Déconnecter uniquement Twitch (reste sur le dashboard)">Déconnecter Twitch</button>`;

  document.getElementById('twitchDisconnectBtn').addEventListener('click', async () => {
    if (!confirm('Déconnecter le compte Twitch ? Les alertes et !setgame ne fonctionneront plus jusqu\'à ce que tu reconnectes.')) return;
    await fetch('/api/twitch/disconnect', { method: 'POST' });
    loadTwitchAccountStatus();
  });
}

document.getElementById('spotifyConnectBtn').addEventListener('click', () => {
  window.location.href = '/auth/spotify';
});

// --- Affiche/masque le champ upload MP3 et le champ Réponse selon le type de réponse choisi ---
const cmdTypeSelect = document.getElementById('cmdType');
const cmdSoundWrapper = document.getElementById('cmdSoundWrapper');
const cmdVolumeWrapper = document.getElementById('cmdVolumeWrapper');
const cmdSoundListWrapper = document.getElementById('cmdSoundListWrapper');
const cmdResponseWrapper = document.getElementById('cmdResponseWrapper');
cmdTypeSelect.addEventListener('change', () => {
  const isSound = cmdTypeSelect.value === 'sound';
  cmdSoundWrapper.classList.toggle('hidden', !isSound);
  cmdVolumeWrapper.classList.toggle('hidden', !isSound);
  cmdSoundListWrapper.classList.toggle('hidden', !isSound);
  cmdResponseWrapper.classList.toggle('hidden', isSound);
});

document.getElementById('cmdVolume').addEventListener('input', (e) => {
  document.getElementById('cmdVolumeValue').textContent = e.target.value;
});

// ============ SONS MULTIPLES (soundboard aléatoire) ============
let currentSoundUrls = [];

function renderSoundList() {
  const list = document.getElementById('cmdSoundList');
  list.innerHTML = '';
  currentSoundUrls.forEach((url, index) => {
    const li = document.createElement('li');
    const shortName = url.split('/').pop();
    li.innerHTML = `<span>🎵 ${shortName}</span><button type="button" data-remove="${index}" class="btn-danger">✕</button>`;
    list.appendChild(li);
    li.querySelector('[data-remove]').addEventListener('click', () => {
      currentSoundUrls.splice(index, 1);
      renderSoundList();
    });
  });
}

document.getElementById('cmdSoundFile').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (files.length === 0) return;

  for (const file of files) {
    const formData = new FormData();
    formData.append('sound', file);
    const uploadRes = await fetch('/api/sounds/upload', { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      alert(`Erreur upload "${file.name}" : ${uploadData.error}`);
      continue;
    }
    currentSoundUrls.push(uploadData.url);
  }
  renderSoundList();
  e.target.value = ''; // permet de re-sélectionner les mêmes fichiers si besoin
});

// ============ COMMANDES ============
async function loadCommands() {
  const res = await fetch('/api/commands');
  const commands = await res.json();
  const tbody = document.querySelector('#commandsTable tbody');
  tbody.innerHTML = '';
  commands.forEach((cmd) => {
    const soundCount = cmd.soundUrls?.length || (cmd.soundUrl ? 1 : 0);
    const typeIcon = soundCount > 0
      ? `🎵 Son (${soundCount} son${soundCount > 1 ? 's' : ''}, ${cmd.volume ?? 100}%)`
      : cmd.isVoice ? '🔊 TTS' : '—';
    const restrictedLabel = cmd.restrictedToUser ? `@${cmd.restrictedToUser}` : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>!${cmd.name}</td>
      <td>${cmd.response.slice(0, 50)}${cmd.response.length > 50 ? '…' : ''}</td>
      <td>${cmd.userLevel}</td>
      <td>${restrictedLabel}</td>
      <td>${cmd.cooldown}s</td>
      <td>${typeIcon}</td>
      <td>${cmd.enabled ? '✅' : '⛔'}</td>
      <td>
        <button data-edit="${cmd._id}">✏️</button>
        <button data-del="${cmd._id}" class="btn-danger">🗑️</button>
      </td>`;
    tbody.appendChild(tr);

    tr.querySelector('[data-edit]').addEventListener('click', () => {
      document.getElementById('commandId').value = cmd._id;
      document.getElementById('cmdName').value = cmd.name;
      document.getElementById('cmdResponse').value = cmd.response;
      document.getElementById('cmdLevel').value = cmd.userLevel;
      document.getElementById('cmdCooldown').value = cmd.cooldown;
      document.getElementById('cmdRestrictedUser').value = cmd.restrictedToUser || '';

      currentSoundUrls = cmd.soundUrls?.length > 0 ? [...cmd.soundUrls] : (cmd.soundUrl ? [cmd.soundUrl] : []);
      renderSoundList();

      const type = currentSoundUrls.length > 0 ? 'sound' : cmd.isVoice ? 'voice' : 'text';
      cmdTypeSelect.value = type;
      cmdSoundWrapper.classList.toggle('hidden', type !== 'sound');
      cmdVolumeWrapper.classList.toggle('hidden', type !== 'sound');
      cmdSoundListWrapper.classList.toggle('hidden', type !== 'sound');
      cmdResponseWrapper.classList.toggle('hidden', type === 'sound');
      document.getElementById('cmdVolume').value = cmd.volume ?? 100;
      document.getElementById('cmdVolumeValue').textContent = cmd.volume ?? 100;
    });
    tr.querySelector('[data-del]').addEventListener('click', async () => {
      await fetch(`/api/commands/${cmd._id}`, { method: 'DELETE' });
      loadCommands();
    });
  });
}

document.getElementById('commandForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const type = cmdTypeSelect.value;
  const responseText = document.getElementById('cmdResponse').value;

  if (type !== 'sound' && !responseText) {
    alert('Le champ "Réponse" est requis pour ce type de commande.');
    return;
  }

  if (type === 'sound' && currentSoundUrls.length === 0) {
    alert('Ajoute au moins un fichier MP3 pour une commande de type "Son".');
    return;
  }

  const payload = {
    name: document.getElementById('cmdName').value,
    response: responseText,
    userLevel: document.getElementById('cmdLevel').value,
    cooldown: parseInt(document.getElementById('cmdCooldown').value, 10),
    isVoice: type === 'voice',
    soundUrls: type === 'sound' ? currentSoundUrls : [],
    volume: parseInt(document.getElementById('cmdVolume').value, 10),
    restrictedToUser: document.getElementById('cmdRestrictedUser').value.trim() || null
  };
  await fetch('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  e.target.reset();
  document.getElementById('commandId').value = '';
  currentSoundUrls = [];
  renderSoundList();
  document.getElementById('cmdVolume').value = 100;
  document.getElementById('cmdVolumeValue').textContent = '100';
  document.getElementById('cmdRestrictedUser').value = '';
  cmdSoundWrapper.classList.add('hidden');
  cmdVolumeWrapper.classList.add('hidden');
  cmdSoundListWrapper.classList.add('hidden');
  cmdResponseWrapper.classList.remove('hidden');
  loadCommands();
});

document.getElementById('cmdCancelBtn').addEventListener('click', () => {
  document.getElementById('commandForm').reset();
  document.getElementById('commandId').value = '';
  currentSoundUrls = [];
  renderSoundList();
  document.getElementById('cmdVolume').value = 100;
  document.getElementById('cmdVolumeValue').textContent = '100';
  document.getElementById('cmdRestrictedUser').value = '';
  cmdSoundWrapper.classList.add('hidden');
  cmdVolumeWrapper.classList.add('hidden');
  cmdSoundListWrapper.classList.add('hidden');
  cmdResponseWrapper.classList.remove('hidden');
});

// ============ SETTINGS (points/gamble) ============
let alertSoundUrls = { follow: null, sub: null, resub: null, giftsub: null, cheer: null };

function renderAlertSoundRow(type) {
  const row = document.querySelector(`.sound-row[data-alert-type="${type}"]`);
  const currentEl = row.querySelector('.alert-sound-current');
  const removeBtn = row.querySelector('.alert-sound-remove');
  const url = alertSoundUrls[type];
  currentEl.textContent = url ? `🎵 ${url.split('/').pop()}` : 'Aucun son attaché';
  removeBtn.classList.toggle('hidden', !url);
}

document.querySelectorAll('.sound-row').forEach((row) => {
  const type = row.dataset.alertType;

  row.querySelector('.alert-sound-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('sound', file);
    const uploadRes = await fetch('/api/sounds/upload', { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      alert(`Erreur upload : ${uploadData.error}`);
      return;
    }
    alertSoundUrls[type] = uploadData.url;
    renderAlertSoundRow(type);
    e.target.value = '';
  });

  row.querySelector('.alert-sound-remove').addEventListener('click', () => {
    alertSoundUrls[type] = null;
    renderAlertSoundRow(type);
  });
});

document.getElementById('alertVolume').addEventListener('input', (e) => {
  document.getElementById('alertVolumeValue').textContent = e.target.value;
});

async function loadSettings() {
  const res = await fetch('/api/settings');
  const s = await res.json();

  document.getElementById('pointsName').value = s.pointsName;
  document.getElementById('pointsPerInterval').value = s.pointsPerInterval;
  document.getElementById('intervalMinutes').value = s.intervalMinutes;
  document.getElementById('gambleWinChance').value = s.gamble.winChance;
  document.getElementById('gambleMinBet').value = s.gamble.minBet;
  document.getElementById('gambleCooldown').value = s.gamble.cooldownSeconds;

  document.getElementById('followMessage').value = s.alerts.followMessage;
  document.getElementById('subMessage').value = s.alerts.subMessage;
  document.getElementById('resubMessage').value = s.alerts.resubMessage;
  document.getElementById('giftSubMessage').value = s.alerts.giftSubMessage;
  document.getElementById('cheerMessage').value = s.alerts.cheerMessage;
  document.getElementById('achievementMessage').value = s.alerts.achievementMessage;
  document.getElementById('raidMessage').value = s.alerts.raidMessage;
  document.getElementById('hypeTrainBeginMessage').value = s.alerts.hypeTrainBeginMessage;
  document.getElementById('hypeTrainLevelUpMessage').value = s.alerts.hypeTrainLevelUpMessage;
  document.getElementById('hypeTrainEndingSoonMessage').value = s.alerts.hypeTrainEndingSoonMessage;
  document.getElementById('hypeTrainEndMessage').value = s.alerts.hypeTrainEndMessage;
  document.getElementById('soundEnabled').checked = s.alerts.soundEnabled;
  document.getElementById('alertVolume').value = s.alerts.soundVolume ?? 100;
  document.getElementById('alertVolumeValue').textContent = s.alerts.soundVolume ?? 100;

  alertSoundUrls = {
    follow: s.alerts.followSoundUrl || null,
    sub: s.alerts.subSoundUrl || null,
    resub: s.alerts.resubSoundUrl || null,
    giftsub: s.alerts.giftSubSoundUrl || null,
    cheer: s.alerts.cheerSoundUrl || null
  };
  Object.keys(alertSoundUrls).forEach(renderAlertSoundRow);

  document.getElementById('subathonEnabled').checked = s.subathon.enabled;
  document.getElementById('secondsPerSub').value = s.subathon.secondsPerSub;
  document.getElementById('secondsPerSubT2').value = s.subathon.secondsPerSubT2;
  document.getElementById('secondsPerSubT3').value = s.subathon.secondsPerSubT3;
  document.getElementById('secondsPerGiftSub').value = s.subathon.secondsPerGiftSub;
  document.getElementById('secondsPer100Bits').value = s.subathon.secondsPer100Bits;
  document.getElementById('maxSeconds').value = s.subathon.maxSeconds;
  document.getElementById('goalsPerPage').value = s.subathon.goalsPerPage ?? 4;
  document.getElementById('goalsRotateSeconds').value = s.subathon.goalsRotateSeconds ?? 8;

  document.getElementById('steamId64').value = s.steamId64 || '';

  document.getElementById('discordWebhookUrl').value = s.discord?.clipWebhookUrl || '';
  document.getElementById('discordEmbedTitle').value = s.discord?.embedTitle || '';
  document.getElementById('discordEmbedDescription').value = s.discord?.embedDescription || '';
  document.getElementById('discordEmbedColor').value = s.discord?.embedColor || '#2E9A5C';
  document.getElementById('discordEmbedFooter').value = s.discord?.embedFooter || '';
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pointsName: document.getElementById('pointsName').value,
      pointsPerInterval: parseInt(document.getElementById('pointsPerInterval').value, 10),
      intervalMinutes: parseInt(document.getElementById('intervalMinutes').value, 10),
      gamble: {
        winChance: parseInt(document.getElementById('gambleWinChance').value, 10),
        minBet: parseInt(document.getElementById('gambleMinBet').value, 10),
        cooldownSeconds: parseInt(document.getElementById('gambleCooldown').value, 10)
      }
    })
  });
  alert('Réglages enregistrés !');
});

document.getElementById('alertsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alerts: {
        followMessage: document.getElementById('followMessage').value,
        subMessage: document.getElementById('subMessage').value,
        resubMessage: document.getElementById('resubMessage').value,
        giftSubMessage: document.getElementById('giftSubMessage').value,
        cheerMessage: document.getElementById('cheerMessage').value,
        achievementMessage: document.getElementById('achievementMessage').value,
        raidMessage: document.getElementById('raidMessage').value,
        hypeTrainBeginMessage: document.getElementById('hypeTrainBeginMessage').value,
        hypeTrainLevelUpMessage: document.getElementById('hypeTrainLevelUpMessage').value,
        hypeTrainEndingSoonMessage: document.getElementById('hypeTrainEndingSoonMessage').value,
        hypeTrainEndMessage: document.getElementById('hypeTrainEndMessage').value,
        soundEnabled: document.getElementById('soundEnabled').checked,
        soundVolume: parseInt(document.getElementById('alertVolume').value, 10),
        followSoundUrl: alertSoundUrls.follow,
        subSoundUrl: alertSoundUrls.sub,
        resubSoundUrl: alertSoundUrls.resub,
        giftSubSoundUrl: alertSoundUrls.giftsub,
        cheerSoundUrl: alertSoundUrls.cheer
      }
    })
  });
  alert('Alertes enregistrées !');
});

document.getElementById('subathonConfigForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subathon: {
        enabled: document.getElementById('subathonEnabled').checked,
        secondsPerSub: parseInt(document.getElementById('secondsPerSub').value, 10),
        secondsPerSubT2: parseInt(document.getElementById('secondsPerSubT2').value, 10),
        secondsPerSubT3: parseInt(document.getElementById('secondsPerSubT3').value, 10),
        secondsPerGiftSub: parseInt(document.getElementById('secondsPerGiftSub').value, 10),
        secondsPer100Bits: parseInt(document.getElementById('secondsPer100Bits').value, 10),
        maxSeconds: parseInt(document.getElementById('maxSeconds').value, 10),
        goalsPerPage: Math.min(5, Math.max(3, parseInt(document.getElementById('goalsPerPage').value, 10) || 4)),
        goalsRotateSeconds: parseInt(document.getElementById('goalsRotateSeconds').value, 10) || 8
      }
    })
  });
  alert('Configuration subathon enregistrée !');
});

// ============ SUBATHON (contrôle + affichage temps réel) ============
function formatSeconds(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':');
}

async function loadSubathon() {
  const res = await fetch('/api/subathon');
  const state = await res.json();
  document.getElementById('subathonDisplay').textContent = formatSeconds(state.secondsRemaining);
}

document.getElementById('subathonStartBtn').addEventListener('click', async () => {
  await fetch('/api/subathon/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
});
document.getElementById('subathonPauseBtn').addEventListener('click', async () => {
  await fetch('/api/subathon/pause', { method: 'POST' });
});
document.getElementById('subathonResetBtn').addEventListener('click', async () => {
  if (confirm('Réinitialiser le subathon ?')) await fetch('/api/subathon/reset', { method: 'POST' });
});
document.getElementById('addMinutesBtn').addEventListener('click', async () => {
  const minutes = parseInt(document.getElementById('addMinutesInput').value, 10) || 0;
  await fetch('/api/subathon/addtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seconds: minutes * 60 })
  });
  document.getElementById('addMinutesInput').value = '';
});

function navigateGoalsPage(direction) {
  fetch('/api/subathon/goals/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction })
  });
}
document.getElementById('goalsPrevBtn').addEventListener('click', () => navigateGoalsPage('prev'));
document.getElementById('goalsNextBtn').addEventListener('click', () => navigateGoalsPage('next'));

socket.on('subathon:update', (data) => {
  document.getElementById('subathonDisplay').textContent = formatSeconds(data.secondsRemaining);
  currentTotals = { subs: data.totalSubs || 0, bits: data.totalBits || 0 };
  renderGoals(cachedGoals);
});

socket.on('subathon:goals', (data) => {
  cachedGoals = data.goals || [];
  renderGoals(cachedGoals);
});

// ============ OBJECTIFS (goals) DU SUBATHON ============
let currentTotals = { subs: 0, bits: 0 };
let cachedGoals = [];

async function loadGoals() {
  const stateRes = await fetch('/api/subathon');
  const state = await stateRes.json();
  currentTotals = { subs: state.totalSubs || 0, bits: state.totalBits || 0 };

  const goalsRes = await fetch('/api/subathon/goals');
  cachedGoals = await goalsRes.json();
  renderGoals(cachedGoals);
}

function renderGoals(goals) {
  const tbody = document.querySelector('#goalsTable tbody');
  tbody.innerHTML = '';
  goals.forEach((goal) => {
    const current = goal.type === 'subs' ? currentTotals.subs : currentTotals.bits;
    const pct = Math.min(100, Math.round((current / goal.target) * 100));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${goal.label}</td>
      <td>${goal.type === 'subs' ? 'Subs' : 'Bits'}</td>
      <td>${goal.target}</td>
      <td>${current}/${goal.target} (${pct}%)</td>
      <td><button data-del-goal="${goal._id}" class="btn-danger">🗑️</button></td>`;
    tbody.appendChild(tr);

    tr.querySelector('[data-del-goal]').addEventListener('click', async () => {
      await fetch(`/api/subathon/goals/${goal._id}`, { method: 'DELETE' });
      loadGoals();
    });
  });
}

document.getElementById('goalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/subathon/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: document.getElementById('goalLabel').value,
      type: document.getElementById('goalType').value,
      target: parseInt(document.getElementById('goalTarget').value, 10)
    })
  });
  e.target.reset();
  loadGoals();
});

// ============ CLASSEMENT ============
async function loadLeaderboard() {
  const res = await fetch('/api/stats/leaderboard');
  const users = await res.json();
  const tbody = document.querySelector('#leaderboardTable tbody');
  tbody.innerHTML = '';
  users.forEach((u, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${u.username}</td><td>${u.points}</td>`;
    tbody.appendChild(tr);
  });
}

// ============ OVERLAYS ============
function setupOverlayLinks() {
  const base = window.location.origin;
  document.getElementById('overlayAlertsUrl').textContent = `${base}/overlay/alerts.html`;
  document.getElementById('overlaySubathonUrl').textContent = `${base}/overlay/subathon.html`;
  document.getElementById('overlayTtsUrl').textContent = `${base}/overlay/tts.html`;
  document.getElementById('overlayLastEventsUrl').textContent = `${base}/overlay/lastevents.html`;
  document.getElementById('overlayGoalUrl').textContent = `${base}/overlay/goal.html`;
  document.getElementById('overlayNowPlayingUrl').textContent = `${base}/overlay/nowplaying.html`;
  document.getElementById('overlayAchievementsUrl').textContent = `${base}/overlay/achievements.html`;
  document.getElementById('overlayViewerStatsUrl').textContent = `${base}/overlay/viewerstats.html`;
}

// ============ MESSAGES AUTOMATIQUES ============
async function loadAutoMessages() {
  const res = await fetch('/api/automessages');
  const messages = await res.json();
  const tbody = document.querySelector('#autoMessagesTable tbody');
  tbody.innerHTML = '';
  messages.forEach((msg) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${msg.text}</td>
      <td>${msg.intervalMinutes} min</td>
      <td><input type="checkbox" ${msg.enabled ? 'checked' : ''} data-toggle="${msg._id}" /></td>
      <td><button data-del-auto="${msg._id}" class="btn-danger">🗑️</button></td>`;
    tbody.appendChild(tr);

    tr.querySelector('[data-toggle]').addEventListener('change', async (e) => {
      await fetch(`/api/automessages/${msg._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: e.target.checked })
      });
    });
    tr.querySelector('[data-del-auto]').addEventListener('click', async () => {
      await fetch(`/api/automessages/${msg._id}`, { method: 'DELETE' });
      loadAutoMessages();
    });
  });
}

document.getElementById('autoMessageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/automessages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: document.getElementById('autoMessageText').value,
      intervalMinutes: parseInt(document.getElementById('autoMessageInterval').value, 10)
    })
  });
  e.target.reset();
  document.getElementById('autoMessageInterval').value = 30;
  loadAutoMessages();
});

// ============ OBJECTIF LONG TERME ============
async function loadLongTermGoal() {
  const res = await fetch('/api/longtermgoal');
  const goal = await res.json();
  document.getElementById('ltgLabel').value = goal.label;
  document.getElementById('ltgType').value = goal.type;
  document.getElementById('ltgTarget').value = goal.target;
  document.getElementById('ltgCurrentDisplay').textContent = `${goal.current} / ${goal.target}`;
  document.getElementById('ltgCurrentInput').value = goal.current;
}

document.getElementById('longTermGoalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/longtermgoal', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: document.getElementById('ltgLabel').value,
      type: document.getElementById('ltgType').value,
      target: parseInt(document.getElementById('ltgTarget').value, 10)
    })
  });
  loadLongTermGoal();
});

document.getElementById('ltgCurrentSaveBtn').addEventListener('click', async () => {
  await fetch('/api/longtermgoal/current', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current: parseInt(document.getElementById('ltgCurrentInput').value, 10) })
  });
  loadLongTermGoal();
});

// ============ SPOTIFY ============
async function loadSpotifyStatus() {
  const res = await fetch('/api/spotify/status');
  const data = await res.json();
  document.getElementById('spotifyStatus').textContent = data.connected
    ? '✅ Compte Spotify connecté'
    : '⛔ Aucun compte Spotify connecté';
}

// ============ STEAM (suivi des succès) ============
async function loadSteamCurrent() {
  const res = await fetch('/api/steam/current');
  const state = await res.json();
  document.getElementById('steamCurrentGame').textContent = state.hasAchievements
    ? (state.steamGameName || state.twitchCategoryName || '—')
    : 'Aucun jeu avec succès détecté actuellement';
  document.getElementById('steamCurrentCount').textContent = state.hasAchievements
    ? `${state.unlocked}/${state.total}`
    : '—';
  if (state.twitchCategoryName) {
    document.getElementById('steamCorrectCategory').value = state.twitchCategoryName;
  }
}

document.getElementById('steamSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steamId64: document.getElementById('steamId64').value.trim() })
  });
  alert('SteamID64 enregistré !');
});

document.getElementById('steamCorrectBtn').addEventListener('click', async () => {
  const twitchCategoryName = document.getElementById('steamCorrectCategory').value.trim();
  const steamAppId = document.getElementById('steamCorrectAppId').value.trim();
  if (!twitchCategoryName || !steamAppId) {
    alert('Renseigne la catégorie Twitch et l\'AppID Steam.');
    return;
  }
  await fetch('/api/steam/mapping', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ twitchCategoryName, steamAppId })
  });
  document.getElementById('steamCorrectAppId').value = '';
  loadSteamCurrent();
});

// ============ DISCORD (webhook clips) ============
document.getElementById('discordSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      discord: {
        clipWebhookUrl: document.getElementById('discordWebhookUrl').value.trim() || null,
        embedTitle: document.getElementById('discordEmbedTitle').value,
        embedDescription: document.getElementById('discordEmbedDescription').value,
        embedColor: document.getElementById('discordEmbedColor').value,
        embedFooter: document.getElementById('discordEmbedFooter').value
      }
    })
  });
  alert('Configuration Discord enregistrée !');
});

// ============ STATS VIEWERS (overlay Niveau/Temps/Messages/Monnaie/Abonnés) ============
async function loadStatsOverlaySettings() {
  const res = await fetch('/api/settings');
  const s = await res.json();
  const cfg = s.statsOverlay || {};
  document.getElementById('statsTitle').value = cfg.title ?? 'LeaderBoard';
  document.getElementById('statsTopCount').value = cfg.topCount ?? 10;
  document.getElementById('statsDefaultMetric').value = cfg.defaultMetric ?? 'uptime';
  document.getElementById('statsShowLevelTab').checked = cfg.showLevelTab !== false;
  document.getElementById('statsShowUptimeTab').checked = cfg.showUptimeTab !== false;
  document.getElementById('statsShowMessagesTab').checked = cfg.showMessagesTab !== false;
  document.getElementById('statsShowCurrencyTab').checked = cfg.showCurrencyTab !== false;
  document.getElementById('statsShowSubsTab').checked = cfg.showSubsTab !== false;
  document.getElementById('statsAutoRotate').checked = cfg.autoRotate !== false;
  document.getElementById('statsRotateSeconds').value = cfg.rotateSeconds ?? 15;
}

document.getElementById('statsOverlayForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statsOverlay: {
        title: document.getElementById('statsTitle').value,
        topCount: parseInt(document.getElementById('statsTopCount').value, 10) || 10,
        defaultMetric: document.getElementById('statsDefaultMetric').value,
        showLevelTab: document.getElementById('statsShowLevelTab').checked,
        showUptimeTab: document.getElementById('statsShowUptimeTab').checked,
        showMessagesTab: document.getElementById('statsShowMessagesTab').checked,
        showCurrencyTab: document.getElementById('statsShowCurrencyTab').checked,
        showSubsTab: document.getElementById('statsShowSubsTab').checked,
        autoRotate: document.getElementById('statsAutoRotate').checked,
        rotateSeconds: parseInt(document.getElementById('statsRotateSeconds').value, 10) || 15
      }
    })
  });
  alert('Réglages de l\'overlay enregistrés !');
});

function formatStatsPreviewValue(metric, value) {
  if (metric === 'level') return `Lv.${value}`;
  if (metric === 'messages') return `${value} msg`;
  if (metric === 'currency') return `${value} pts`;
  return value >= 60 ? `${Math.floor(value / 60)}h${(value % 60).toString().padStart(2, '0')}` : `${value}m`;
}

async function loadStatsPreview() {
  const metric = document.getElementById('statsPreviewMetric').value;
  const period = document.getElementById('statsPreviewPeriod').value;
  const res = await fetch(`/api/viewerstats/leaderboard?metric=${metric}&period=${period}`);
  const leaderboard = await res.json();
  const tbody = document.querySelector('#statsPreviewTable tbody');
  tbody.innerHTML = '';
  leaderboard.forEach((v, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>#${i + 1}</td><td>${v.username}</td><td>${formatStatsPreviewValue(metric, v.value)}</td><td>${v.isSubscriber ? '⭐' : '—'}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('statsPreviewBtn').addEventListener('click', loadStatsPreview);

// --- Init ---
loadTwitchAccountStatus();
loadCommands();
loadSettings();
loadSubathon();
loadGoals();
loadLeaderboard();
loadAutoMessages();
loadLongTermGoal();
loadSpotifyStatus();
loadSteamCurrent();
loadStatsOverlaySettings();
loadStatsPreview();
setupOverlayLinks();
setInterval(loadLeaderboard, 30000);
