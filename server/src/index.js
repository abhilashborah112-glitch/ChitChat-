import { createRelayServer } from './server.js';

const port = Number(process.env.PORT) || 3001;
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const { httpServer } = createRelayServer({ origins });

httpServer.listen(port, () => {
  console.log(`ChitChat relay listening on http://localhost:${port}`);
  console.log(`Allowing connections from: ${origins.join(', ')}`);
});
