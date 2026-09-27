const { getOrCreateUser } = require('./pointsManager');

// cooldown en mémoire : Map("channel:username" -> timestamp du dernier gamble)
const lastGambleAt = new Map();

/**
 * Fait parier un montant à un utilisateur.
 * winChance est un pourcentage (ex: 40 => ratio "60/40", l'utilisateur gagne 40% du temps).
 */
async function gamble(channel, username, amountRaw, settings) {
  const key = `${channel.toLowerCase()}:${username.toLowerCase()}`;
  const now = Date.now();
  const cooldownMs = (settings.gamble.cooldownSeconds || 10) * 1000;

  const last = lastGambleAt.get(key) || 0;
  if (now - last < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - last)) / 1000);
    return { ok: false, error: `Attends encore ${remaining}s avant de repariser.` };
  }

  const user = await getOrCreateUser(channel, username);

  let amount = amountRaw;
  if (amountRaw === 'all' || amountRaw === 'tout') {
    amount = user.points;
  } else {
    amount = parseInt(amountRaw, 10);
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: `Montant invalide. Utilise un nombre ou "all".` };
  }
  if (amount < settings.gamble.minBet) {
    return { ok: false, error: `Mise minimum : ${settings.gamble.minBet} ${settings.pointsName}.` };
  }
  if (amount > user.points) {
    return { ok: false, error: `Solde insuffisant (tu as ${user.points} ${settings.pointsName}).` };
  }

  lastGambleAt.set(key, now);

  const winChance = settings.gamble.winChance; // ex: 40
  const won = Math.random() * 100 < winChance;

  if (won) {
    user.points += amount;
  } else {
    user.points -= amount;
  }
  await user.save();

  return {
    ok: true,
    won,
    amount,
    newBalance: user.points
  };
}

module.exports = { gamble };
