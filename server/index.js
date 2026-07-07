require('dotenv').config();

const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const DATA_FILE = path.join(__dirname, 'data.json');

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('ERRO: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis de ambiente.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// --- Simple JSON file persistence -------------------------------------
// records keyed by push subscription endpoint
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

let data = loadData();
let saveTimeout = null;
function saveData() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), (err) => {
      if (err) console.error('Falha ao salvar data.json', err);
    });
  }, 300);
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
      delete data[record.endpoint];
      saveData();
    } else {
      console.error('Erro ao enviar push:', err.statusCode, err.body || err.message);
    }
  }
}

function tickAllSubscriptions() {
  const now = Date.now();

  Object.values(data).forEach((record) => {
    if (!record.settings || !record.settings.enabled) return;
    if (!Array.isArray(record.accounts)) return;

    record.checkpoints = record.checkpoints || {};
    let changed = false;

    record.accounts.forEach((account) => {
      if (!account.availableAt) return;
      const remainingSeconds = (new Date(account.availableAt).getTime() - now) / 1000;
      const done = record.checkpoints[account.id] || [];

      for (const [name, sec, settingKey, title, bodyFn] of THRESHOLDS) {
        if (remainingSeconds <= sec && !done.includes(name)) {
          done.push(name);
          changed = true;
          if (record.settings[settingKey]) {
            sendPush(record, title, bodyFn(account.email), `claude-cooldown-${account.id}-${name}`);
          }
        }
      }
      record.checkpoints[account.id] = done;
    });

    if (changed) saveData();
  });
}

setInterval(tickAllSubscriptions, 15000);

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

app.post('/api/subscribe', (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'subscription inválida' });
  }

  const existing = data[subscription.endpoint];
  data[subscription.endpoint] = {
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
  saveData();
  res.json({ ok: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (endpoint && data[endpoint]) {
    delete data[endpoint];
    saveData();
  }
  res.json({ ok: true });
});

app.post('/api/sync', (req, res) => {
  const { endpoint, accounts, settings } = req.body;
  const record = data[endpoint];
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
  saveData();
  res.json({ ok: true });
});

app.post('/api/test-notification', async (req, res) => {
  const { endpoint } = req.body;
  const record = data[endpoint];
  if (!record) return res.status(404).json({ error: 'assinatura não encontrada' });
  await sendPush(record, '🔔 Teste de Push', 'Se você recebeu isso, o push do servidor está funcionando!', 'claude-cooldown-test');
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Claude Cooldown push server rodando na porta ${PORT}`);
});
