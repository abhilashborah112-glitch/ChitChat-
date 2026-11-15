// Shared persistence checks (kept outside test/ so node --test doesn't run it directly).
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './helpers.js';
import { decryptText, deriveSharedKey, encryptText, importPrivateKey } from '../../client/src/crypto.js';

/**
 * These tests prove the "restart" behaviour without needing a real database:
 * two separate servers share one store, like two runs of the same app share one MongoDB.
 * The same checks are run against real MongoDB in test/mongo.test.js when MONGODB_TEST_URI is set.
 */
export function persistenceTests(makeStore, label) {
  describe(`persistence (${label})`, () => {
    const open = [];
    const startServer = async (store, inbox) => {
      const h = createHarness({ store, inbox });
      await h.start();
      open.push(h);
      return h;
    };
    after(async () => {
      for (const h of open) await h.stop();
    });

    test('known users and queued ciphertext survive a server restart', async () => {
      const store = await makeStore();
      const first = await startServer(store);

      const alice = await first.person('Alice');
      const bob = await first.person('Bob');
      await alice.send(alice.hello);
      await bob.send(bob.hello);
      const bobHello = await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);
      bob.socket.close();
      await alice.waitFor((p) => p.type === 'bye' && p.from === bob.id);

      const aliceKey = await deriveSharedKey(await importPrivateKey(alice.identity.privateJwk), bobHello.publicKey);
      const secret = 'still here after the restart';
      const { iv, ct } = await encryptText(aliceKey, secret);
      assert.deepEqual(await alice.send({ type: 'msg', from: alice.id, to: bob.id, msgId: 1, iv, ct }), { ok: true, queued: true });

      // The server stops. Everything in its memory is gone.
      await first.stop();

      // A brand-new server starts on the same store.
      const second = await startServer(store);
      assert.equal((await second.health()).queued, 1);

      // Bob comes back: he gets the message, and Alice (also offline) is still a known user.
      const bobAgain = await second.comeBack(bob);
      await bobAgain.send(bobAgain.hello);
      const delivered = await bobAgain.waitFor((p) => p.type === 'msg');
      assert.equal(delivered.queued, true);
      const aliceEntry = await bobAgain.waitFor((p) => p.type === 'hello' && p.from === alice.id);
      assert.equal(aliceEntry.offline, true);
      const bobKey = await deriveSharedKey(await importPrivateKey(bob.identity.privateJwk), aliceEntry.publicKey);
      assert.equal(await decryptText(bobKey, delivered), secret);

      // Delivered and confirmed: gone from the store too, so a second restart delivers nothing.
      await second.waitForQueued(0);
      await new Promise((resolve) => setTimeout(resolve, 150)); // let the background delete finish
      await second.stop();
      const third = await startServer(store);
      assert.equal((await third.health()).queued, 0);
    });

    test('an id stays bound to its key even across a restart', async () => {
      const store = await makeStore();
      const first = await startServer(store);
      const alice = await first.person('Alice');
      await alice.send(alice.hello);
      await new Promise((resolve) => setTimeout(resolve, 150)); // let the user be saved
      await first.stop();

      const second = await startServer(store);
      const thief = await second.person('Thief');
      const reply = await thief.send({ ...thief.hello, from: alice.id }); // Alice's id, a different key
      assert.equal(reply.ok, false);
      assert.match(reply.error, /different key/i);
    });

    test('messages that expired while the server was down are dropped on restart', async () => {
      const store = await makeStore();
      const first = await startServer(store);
      const alice = await first.person('Alice');
      const bob = await first.person('Bob');
      await alice.send(alice.hello);
      await bob.send(bob.hello);
      await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);
      bob.socket.close();
      await alice.waitFor((p) => p.type === 'bye' && p.from === bob.id);
      await alice.send({ type: 'msg', from: alice.id, to: bob.id, msgId: 1, iv: 'aXY=', ct: 'Y3Q=' });
      await first.stop();

      await new Promise((resolve) => setTimeout(resolve, 400));
      const second = await startServer(store, { ttlMs: 200 });
      assert.equal((await second.health()).queued, 0);
    });
  });
}

