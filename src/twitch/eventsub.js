const WebSocket = require('ws');
const axios = require('axios');
const { getUserAccessToken } = require('./helixClient');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

/**
 * Ouvre une connexion EventSub WebSocket pour la chaîne donnée et s'abonne
 * aux événements subscribe / resub / gift sub / cheer.
 * Pas besoin d'URL publique ni de certificat : parfait pour un VPS.
 *
 * onEvent(type, payload) est appelé pour chaque notification reçue.
 */
async function startEventSub(channel, broadcasterId, onEvent) {
  let ws;
  let keepaliveTimeout;
  let reconnecting = false;

  function connect(url) {
    ws = new WebSocket(url || EVENTSUB_WS_URL);

    ws.on('open', () => {
      console.log('[EventSub] WebSocket connecté');
    });

    ws.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());
      const type = msg.metadata?.message_type;

      if (type === 'session_welcome') {
        const sessionId = msg.payload.session.id;
        resetKeepalive(msg.payload.session.keepalive_timeout_seconds);
        await subscribeAll(channel, broadcasterId, sessionId);
      } else if (type === 'session_keepalive') {
        resetKeepalive();
      } else if (type === 'session_reconnect') {
        const newUrl = msg.payload.session.reconnect_url;
        reconnecting = true;
        ws.close();
        connect(newUrl);
      } else if (type === 'notification') {
        resetKeepalive();
        handleNotification(msg.payload, onEvent);
      }
    });

    ws.on('close', () => {
      console.log('[EventSub] Connexion fermée');
      clearTimeout(keepaliveTimeout);
      if (!reconnecting) {
        // reconnexion simple après 5s si la coupure n'était pas planifiée
        setTimeout(() => connect(), 5000);
      }
      reconnecting = false;
    });

    ws.on('error', (err) => {
      console.error('[EventSub] Erreur WebSocket :', err.message);
    });
  }

  function resetKeepalive(seconds = 30) {
    clearTimeout(keepaliveTimeout);
    keepaliveTimeout = setTimeout(() => {
      console.warn('[EventSub] Keepalive expiré, reconnexion...');
      ws.close();
    }, (seconds + 10) * 1000);
  }

  connect();
}

/**
 * Liste tous les abonnements EventSub existants (avec pagination) pour ce Client-Id.
 */
async function listAllSubscriptions(headers) {
  let all = [];
  let cursor;
  do {
    const params = cursor ? { after: cursor } : {};
    const { data } = await axios.get('https://api.twitch.tv/helix/eventsub/subscriptions', { headers, params });
    all = all.concat(data.data);
    cursor = data.pagination?.cursor;
  } while (cursor);
  return all;
}

/**
 * Supprime les abonnements existants dont le "type" fait partie de ceux qu'on
 * s'apprête à recréer. Évite l'erreur 429 quand le bot est redémarré plusieurs
 * fois (les anciens abonnements websocket ne sont pas toujours nettoyés automatiquement).
 */
async function cleanupExistingSubscriptions(headers, types) {
  try {
    const existing = await listAllSubscriptions(headers);
    const toDelete = existing.filter((s) => types.includes(s.type));

    for (const sub of toDelete) {
      try {
        await axios.delete('https://api.twitch.tv/helix/eventsub/subscriptions', {
          headers,
          params: { id: sub.id }
        });
      } catch (err) {
        console.error(`[EventSub] Échec suppression ancien abonnement ${sub.id} :`, err.response?.data || err.message);
      }
    }
    if (toDelete.length > 0) {
      console.log(`[EventSub] ${toDelete.length} ancien(s) abonnement(s) nettoyé(s).`);
    }
  } catch (err) {
    console.error('[EventSub] Échec listing des abonnements existants :', err.response?.data || err.message);
  }
}

async function subscribeAll(channel, broadcasterId, sessionId) {
  const userToken = await getUserAccessToken(channel);
  if (!userToken) {
    console.warn('[EventSub] Aucun token utilisateur : connecte le compte Twitch depuis le dashboard pour activer les alertes.');
    return;
  }

  const headers = {
    'Client-Id': CLIENT_ID,
    Authorization: `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  };

  // Note : "channel.follow" a été volontairement retiré d'ici. Cet événement
  // EventSub est connu pour être peu fiable côté Twitch (souvent non délivré
  // même avec un abonnement actif). Les follows sont désormais détectés par
  // polling de l'API Helix (voir src/twitch/followPoller.js), qui est fiable à 100%.
  const subs = [
    {
      type: 'channel.subscribe',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId }
    },
    {
      type: 'channel.subscription.message', // resub avec message
      version: '1',
      condition: { broadcaster_user_id: broadcasterId }
    },
    {
      type: 'channel.subscription.gift',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId }
    },
    {
      type: 'channel.cheer',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId }
    },
    {
      type: 'stream.online', // utilisé pour remettre à zéro le compteur "follows pendant ce live"
      version: '1',
      condition: { broadcaster_user_id: broadcasterId }
    },
    {
      type: 'channel.update', // utilisé pour détecter les changements de catégorie (suivi des succès Steam)
      version: '2',
      condition: { broadcaster_user_id: broadcasterId }
    }
  ];

  // Nettoie les abonnements déjà existants pour ces types (ex: laissés par un
  // précédent lancement du bot) afin d'éviter l'erreur 429 "maximum subscriptions
  // with type and condition exceeded" lors des redémarrages.
  await cleanupExistingSubscriptions(headers, subs.map((s) => s.type));

  for (const sub of subs) {
    try {
      const { data } = await axios.post(
        'https://api.twitch.tv/helix/eventsub/subscriptions',
        {
          type: sub.type,
          version: sub.version,
          condition: sub.condition,
          transport: { method: 'websocket', session_id: sessionId }
        },
        { headers }
      );
      const status = data.data?.[0]?.status;
      console.log(`[EventSub] Abonné à ${sub.type} — statut Twitch : ${status}`);
    } catch (err) {
      console.error(`[EventSub] Échec abonnement ${sub.type} :`, err.response?.data || err.message);
    }
  }
}

function handleNotification(payload, onEvent) {
  const type = payload.subscription.type;
  const ev = payload.event;

  switch (type) {
    case 'channel.subscribe':
      onEvent('sub', { user: ev.user_name, tier: (ev.tier / 1000).toString() });
      break;
    case 'channel.subscription.message':
      onEvent('resub', {
        user: ev.user_name,
        tier: (ev.tier / 1000).toString(),
        months: ev.cumulative_months
      });
      break;
    case 'channel.subscription.gift':
      onEvent('giftsub', {
        user: ev.is_anonymous ? 'Anonyme' : ev.user_name,
        total: ev.total,
        tier: (ev.tier / 1000).toString()
      });
      break;
    case 'channel.cheer':
      onEvent('cheer', {
        user: ev.is_anonymous ? 'Anonyme' : ev.user_name,
        bits: ev.bits
      });
      break;
    case 'stream.online':
      onEvent('streamonline', {});
      break;
    case 'channel.update':
      onEvent('categorychange', { categoryName: ev.category_name });
      break;
  }
}

module.exports = { startEventSub };
