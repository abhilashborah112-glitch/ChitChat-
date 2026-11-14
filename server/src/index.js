import { createRelayServer } from './server.js';

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

const { httpServer } = createRelayServer({ origins, inbox });

httpServer.listen(port, () => {
  console.log(`ChitChat relay listening on http://localhost:${port}`);
  console.log(`Allowing connections from: ${origins.join(', ')}`);
});
