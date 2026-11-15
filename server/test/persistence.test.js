import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../testing/helpers.js';
import { persistenceTests } from '../testing/persistenceSuite.js';
import { createMemoryStore } from '../src/store.js';

persistenceTests(async () => createMemoryStore(), 'memory store');

describe('storage failures', () => {
  test('if the store cannot save a message, the sender is told it was NOT queued', async () => {
    const store = createMemoryStore();
    store.addInboxItem = async () => {
      throw new Error('database is down');
    };
    const h = createHarness({ store });
    await h.start();
    const originalError = console.error;
    console.error = () => {}; // the relay logs the failure; keep test output clean
    try {
      const alice = await h.person('Alice');
      const bob = await h.person('Bob');
      await alice.send(alice.hello);
      await bob.send(bob.hello);
      await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);
      bob.socket.close();
      await alice.waitFor((p) => p.type === 'bye' && p.from === bob.id);

      const reply = await alice.send({ type: 'msg', from: alice.id, to: bob.id, msgId: 1, iv: 'aXY=', ct: 'Y3Q=' });
      assert.equal(reply.ok, false);
      assert.equal(reply.undelivered, true);
      assert.equal((await h.health()).queued, 0);
    } finally {
      console.error = originalError;
      await h.stop();
    }
  });
});
