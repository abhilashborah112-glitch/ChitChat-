import { createRelayServer } from './server.js';
import { DEFAULT_INBOX_OPTIONS } from './relay.js';

const port = Number(process.env.PORT) || 3001;
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Optional inbox limits (see .env.example). Anything not set uses the default.
const inbox = {};
const maxPerUser = Number(process.env.INBOX_MAX_PER_USER);
const ttlHours = Number(process.env.INBOX_TTL_HOURS);
if (Number.isFinite(maxPerUser) && maxPerUser > 0) inbox.maxPerUser = maxPerUser;
if (Number.isFinite(ttlHours) && ttlHours > 0) inbox.ttlMs = ttlHours * 60 * 60 * 1000;

// Storage: MongoDB if MONGODB_URI is set, otherwise memory only.
let store = null;
if (process.env.MONGODB_URI) {
  const { createMongoStore } = await import('./mongoStore.js');
  console.log('Connecting to MongoDB...');
  try {
    store = await createMongoStore({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB,
      ttlMs: inbox.ttlMs ?? DEFAULT_INBOX_OPTIONS.ttlMs,
    });
  } catch (error) {
    console.error(`\n✖ MongoDB connection failed.\n  ${error.message}\n`);
    console.error('The server was NOT started, so no messages are lost silently.');
    console.error('Fix MONGODB_URI in server/.env, or remove it to run without a database.');
    process.exit(1);
  }
  console.log(`✔ Connected to MongoDB (database "${store.databaseName}")`);
} else {
  console.log('No MONGODB_URI set: running in memory only (users and messages vanish on restart).');
}

const { httpServer, relay, close } = createRelayServer({ origins, inbox, store });
const restored = await relay.restore();
if (store) console.log(`Loaded ${restored.users} known user(s) and ${restored.queued} queued message(s).`);

httpServer.listen(port, () => {
  console.log(`ChitChat relay listening on http://localhost:${port}`);
  console.log(`Allowing connections from: ${origins.join(', ')}`);
});

// Ctrl+C: finish writes, then close the database connection cleanly.
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await close();
  await store?.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
