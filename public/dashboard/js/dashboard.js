const socket = io();

// --- Navigation par onglets ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('twitchConnectBtn').addEventListener('click', () => {
  window.location.href = '/auth/twitch';
});

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
        maxSeconds: parseInt(document.getElementById('maxSeconds').value, 10)
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

// --- Init ---
loadCommands();
loadSettings();
loadSubathon();
loadGoals();
loadLeaderboard();
loadAutoMessages();
loadLongTermGoal();
loadSpotifyStatus();
setupOverlayLinks();
setInterval(loadLeaderboard, 30000);
