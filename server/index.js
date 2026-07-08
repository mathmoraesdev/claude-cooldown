require('dotenv').config();

const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const { Redis } = require('@upstash/redis');

const PORT = process.env.PORT || 3001;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('ERRO: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis de ambiente.');
  process.exit(1);
}

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('ERRO: defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN nas variáveis de ambiente.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// --- Redis persistence --------------------------------------------------
// records keyed by push subscription endpoint, stored as JSON strings.
// A Set ("endpoints") keeps track of which endpoints exist so we can
// iterate over all of them on each tick.
const redis = Redis.fromEnv();

const ENDPOINTS_SET = 'endpoints';
const recordKey = (endpoint) => `sub:${endpoint}`;

async function getRecord(endpoint) {
  const raw = await redis.get(recordKey(endpoint));
  if (!raw) return null;
  // @upstash/redis auto-parses JSON-looking strings, but guard both cases.
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function saveRecord(endpoint, record) {
  await redis.set(recordKey(endpoint), JSON.stringify(record));
  await redis.sadd(ENDPOINTS_SET, endpoint);
}

async function deleteRecord(endpoint) {
  await redis.del(recordKey(endpoint));
  await redis.srem(ENDPOINTS_SET, endpoint);
}

async function getAllRecords() {
  const endpoints = await redis.smembers(ENDPOINTS_SET);
  if (!endpoints || endpoints.length === 0) return [];
  const records = await Promise.all(endpoints.map((e) => getRecord(e)));
  return records.filter(Boolean);
}

// --- Checkpoint helpers -------------------------------------------------
const THRESHOLDS = [
  ['30m', 1800, 'notifyAt30m', '⏳ 30 Minutos Restantes', (email) => `A conta ${email} será liberada em 30 minutos.`],
  ['10m', 600, 'notifyAt10m', '⏳ 10 Minutos Restantes', (email) => `A conta ${email} será liberada em 10 minutos.`],
  ['5m', 300, 'notifyAt5m', '⏳ 5 Minutos Restantes', (email) => `A conta ${email} será liberada em 5 minutos.`],
  ['1m', 60, 'notifyAt1m', '⏳ 1 Minuto Restante', (email) => `A conta ${email} será liberada em 1 minuto. Prepare seu prompt!`],
  ['exact', 0, 'notifyAtExact', '🟢 Claude Disponível!', (email) => `A conta ${email} foi liberada. Você já pode enviar novas mensagens!`],
];

// Given a remaining-seconds value, return every checkpoint name already "in the past"
// (used to pre-mark checkpoints as done when an account is first seen, so we don't
// blast a burst of old notifications the first time the app syncs).
function checkpointsAlreadyPassed(remainingSeconds) {
  return THRESHOLDS.filter(([, sec]) => remainingSeconds <= sec).map(([name]) => name);
}

async function sendPush(record, title, body, tag) {
  try {
    await webpush.sendNotification(
      record.subscription,
      JSON.stringify({ title, body, tag })
    );
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Subscription is gone (user revoked permission, uninstalled, etc.)
      await deleteRecord(record.endpoint);
    } else {
      console.error('Erro ao enviar push:', err.statusCode, err.body || err.message);
    }
  }
}

async function tickAllSubscriptions() {
  const records = await getAllRecords();

  for (const record of records) {
    if (!record.settings || !record.settings.enabled) continue;
    if (!Array.isArray(record.accounts)) continue;

    record.checkpoints = record.checkpoints || {};
    let changed = false;
    const now = Date.now();

    for (const account of record.accounts) {
      if (!account.availableAt) continue;
      const remainingSeconds = (new Date(account.availableAt).getTime() - now) / 1000;
      const done = record.checkpoints[account.id] || [];

      for (const [name, sec, settingKey, title, bodyFn] of THRESHOLDS) {
        if (remainingSeconds <= sec && !done.includes(name)) {
          done.push(name);
          changed = true;
          if (record.settings[settingKey]) {
            await sendPush(record, title, bodyFn(account.email), `claude-cooldown-${account.id}-${name}`);
          }
        }
      }
      record.checkpoints[account.id] = done;
    }

    if (changed) await saveRecord(record.endpoint, record);
  }
}

setInterval(() => {
  tickAllSubscriptions().catch((err) => console.error('Erro no tick de assinaturas:', err));
}, 15000);

// --- HTTP API -------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'claude-cooldown-push-server' });
});

app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'subscription inválida' });
    }

    const existing = await getRecord(subscription.endpoint);
    const record = {
      endpoint: subscription.endpoint,
      subscription,
      accounts: existing ? existing.accounts : [],
      settings: existing ? existing.settings : {
        enabled: true, sound: true,
        notifyAt30m: true, notifyAt10m: true, notifyAt5m: true, notifyAt1m: true, notifyAtExact: true,
      },
      checkpoints: existing ? existing.checkpoints : {},
      updatedAt: new Date().toISOString(),
    };
    await saveRecord(subscription.endpoint, record);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/subscribe:', err);
    res.status(500).json({ error: 'erro interno' });
  }
});

app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await deleteRecord(endpoint);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/unsubscribe:', err);
    res.status(500).json({ error: 'erro interno' });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    const { endpoint, accounts, settings } = req.body;
    const record = await getRecord(endpoint);
    if (!record) return res.status(404).json({ error: 'assinatura não encontrada, chame /api/subscribe primeiro' });

    const prevAccounts = record.accounts || [];
    record.checkpoints = record.checkpoints || {};

    (accounts || []).forEach((account) => {
      const prev = prevAccounts.find((a) => a.id === account.id);
      const availableAtChanged = !prev || prev.availableAt !== account.availableAt;

      if (!account.availableAt) {
        record.checkpoints[account.id] = [];
      } else if (availableAtChanged) {
        const remainingSeconds = (new Date(account.availableAt).getTime() - Date.now()) / 1000;
        record.checkpoints[account.id] = checkpointsAlreadyPassed(remainingSeconds);
      }
    });

    record.accounts = accounts || [];
    record.settings = settings || record.settings;
    record.updatedAt = new Date().toISOString();
    await saveRecord(endpoint, record);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/sync:', err);
    res.status(500).json({ error: 'erro interno' });
  }
});

app.post('/api/test-notification', async (req, res) => {
  try {
    const { endpoint } = req.body;
    const record = await getRecord(endpoint);
    if (!record) return res.status(404).json({ error: 'assinatura não encontrada' });
    await sendPush(record, '🔔 Teste de Push', 'Se você recebeu isso, o push do servidor está funcionando!', 'claude-cooldown-test');
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/test-notification:', err);
    res.status(500).json({ error: 'erro interno' });
  }
});

app.listen(PORT, () => {
  console.log(`Claude Cooldown push server rodando na porta ${PORT}`);
});
