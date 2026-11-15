import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { attachRelay } from './relay.js';

/**
 * Builds (but does not start) the HTTP + Socket.IO server.
 * `origins` are the website addresses allowed to connect, e.g. the Vite dev server.
 * `inbox` overrides the offline-inbox limits (see DEFAULT_INBOX_OPTIONS in relay.js).
 * `store` is optional storage (see store.js). With one, call `await relay.restore()`
 * before `httpServer.listen(...)` to load saved users and queued messages.
 */
export function createRelayServer({ origins = ['http://localhost:5173'], inbox, store } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: origins },
    maxHttpBufferSize: 64 * 1024,
  });
  const relay = attachRelay(io, { inbox, store });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, online: relay.onlineCount(), queued: relay.queuedCount() });
  });

  /** Stops the sweeper and closes every connection and the HTTP server. */
  const close = () =>
    new Promise((resolve) => {
      relay.close();
      io.close(() => resolve());
    });

  return { app, httpServer, io, relay, close };
}
