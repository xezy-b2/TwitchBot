const Poll = require('../models/Poll');

const endTimeouts = new Map(); // channel -> timeoutId, pour la fin automatique

function pollPublicState(poll) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
  return {
    isActive: poll.isActive,
    question: poll.question,
    options: poll.options.map((o) => ({
      text: o.text,
      votes: o.votes,
      percentage: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0
    })),
    totalVotes,
    endsAt: poll.endsAt
  };
}

/** Démarre un nouveau sondage (remplace un éventuel sondage en cours sur cette chaîne). */
async function startPoll(channel, question, optionTexts, durationSeconds, io, onEnd) {
  channel = channel.toLowerCase();
  if (optionTexts.length < 2 || optionTexts.length > 5) {
    throw new Error('Il faut entre 2 et 5 réponses.');
  }

  clearTimeout(endTimeouts.get(channel));

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  const poll = await Poll.findOneAndUpdate(
    { channel },
    {
      channel,
      question,
      options: optionTexts.map((text) => ({ text, votes: 0 })),
      voters: {},
      durationSeconds,
      startedAt,
      endsAt,
      isActive: true
    },
    { upsert: true, new: true }
  );

  io.emit('poll:start', pollPublicState(poll));

  const timeoutId = setTimeout(async () => {
    const ended = await endPoll(channel, io);
    if (ended && onEnd) onEnd(ended);
  }, durationSeconds * 1000);
  endTimeouts.set(channel, timeoutId);

  return poll;
}

/**
 * Enregistre (ou change) le vote d'un viewer. Renvoie l'état public à jour,
 * ou null si aucun sondage actif / numéro invalide.
 */
async function castVote(channel, username, optionNumber, io) {
  channel = channel.toLowerCase();
  username = username.toLowerCase();

  const poll = await Poll.findOne({ channel, isActive: true });
  if (!poll) return null;

  const optionIndex = optionNumber - 1;
  if (optionIndex < 0 || optionIndex >= poll.options.length) return null;

  const previousChoice = poll.voters[username];
  if (previousChoice === optionIndex) return pollPublicState(poll); // déjà voté pareil, rien à faire

  if (previousChoice !== undefined) {
    poll.options[previousChoice].votes = Math.max(0, poll.options[previousChoice].votes - 1);
  }
  poll.options[optionIndex].votes += 1;
  poll.voters[username] = optionIndex;
  poll.markModified('voters');
  await poll.save();

  const state = pollPublicState(poll);
  io.emit('poll:update', state);
  return state;
}

/** Termine le sondage en cours (automatiquement à l'échéance, ou manuellement depuis le dashboard). */
async function endPoll(channel, io) {
  channel = channel.toLowerCase();
  clearTimeout(endTimeouts.get(channel));
  endTimeouts.delete(channel);

  const poll = await Poll.findOneAndUpdate({ channel, isActive: true }, { isActive: false }, { new: true });
  if (!poll) return null;

  const state = pollPublicState(poll);
  io.emit('poll:end', state);
  return state;
}

async function getActivePoll(channel) {
  channel = channel.toLowerCase();
  const poll = await Poll.findOne({ channel });
  if (!poll) return { isActive: false, question: '', options: [], totalVotes: 0, endsAt: null };
  return pollPublicState(poll);
}

/** Annonce le résultat d'un sondage terminé dans le chat (gère le cas d'égalité). */
function announcePollResult(client, channel, result) {
  if (result.totalVotes === 0) {
    client.say(`#${channel}`, `📊 Sondage terminé : personne n'a voté.`);
    return;
  }

  const maxVotes = Math.max(...result.options.map((o) => o.votes));
  const winners = result.options.filter((o) => o.votes === maxVotes);

  if (winners.length > 1) {
    const names = winners.map((w) => w.text).join(' et ');
    client.say(`#${channel}`, `📊 Égalité entre ${names} (${maxVotes} vote${maxVotes > 1 ? 's' : ''} chacun) !`);
  } else {
    const winner = winners[0];
    const voteLabel = result.totalVotes > 1 ? 'votes' : 'vote';
    client.say(`#${channel}`, `📊 Résultat : ${winner.text} l'emporte avec ${winner.percentage} % (${result.totalVotes} ${voteLabel}) !`);
  }
}

module.exports = { startPoll, castVote, endPoll, getActivePoll, pollPublicState, announcePollResult };
