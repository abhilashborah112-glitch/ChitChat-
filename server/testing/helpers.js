// Shared helpers for the server tests (kept outside test/ so node --test doesn't run it as a test file).
import { io as connect } from 'socket.io-client';
import { createRelayServer } from '../src/server.js';
import { PACKET_EVENT } from '../src/relay.js';
// The real frontend encryption code, so the tests cover the whole path.
import { generateIdentity } from '../../client/src/crypto.js';

/**
 * Starts a real relay on a random port and gives you connected test clients.
 * Pass `{ inbox: {...} }` to use small limits in a test.
 */
export function createHarness(options = {}) {
  const sockets = [];
  const harness = {
    url: '',
    server: null,

    async start() {
      harness.server = createRelayServer({ origins: ['http://localhost:5173'], ...options });
      await new Promise((resolve) => harness.server.httpServer.listen(0, resolve));
      harness.url = `http://localhost:${harness.server.httpServer.address().port}`;
    },

    async stop() {
      sockets.forEach((socket) => socket.close());
      await harness.server.close();
    },

    /** A connected socket that records every packet it receives. `ack: false` mimics a client that never confirms. */
    async client({ ack = true } = {}) {
      const socket = connect(harness.url, { transports: ['websocket'], forceNew: true });
      sockets.push(socket);
      const received = [];
      socket.on(PACKET_EVENT, (packet, confirm) => {
        received.push(packet);
        if (ack && typeof confirm === 'function') confirm();
      });
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const send = (packet) => socket.timeout(2000).emitWithAck(PACKET_EVENT, packet);
      const waitFor = async (predicate, ms = 2000) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          const hit = received.find(predicate);
          if (hit) return hit;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error('Timed out waiting for a packet.');
      };
      return { socket, received, send, waitFor };
    },

    /** A user with a real key pair, connected but not yet announced (call send(p.hello)). */
    async person(name, clientOptions) {
      const identity = await generateIdentity();
      const id = `${name}-${Math.random().toString(36).slice(2)}`;
      const connection = await harness.client(clientOptions);
      const hello = { type: 'hello', from: id, name, publicKey: identity.publicJwk };
      return { ...connection, id, name, identity, hello };
    },

    /** The same user (same id and keys) connecting again on a new socket. */
    async comeBack(person, clientOptions) {
      const connection = await harness.client(clientOptions);
      return { ...person, ...connection };
    },

    async health() {
      return (await fetch(`${harness.url}/health`)).json();
    },

    /** Waits until /health reports `queued` messages (or throws). */
    async waitForQueued(count, ms = 2000) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if ((await harness.health()).queued === count) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Expected ${count} queued, got ${(await harness.health()).queued}.`);
    },
  };
  return harness;
}
