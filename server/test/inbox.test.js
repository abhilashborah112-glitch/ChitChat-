import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../testing/helpers.js';
import { decryptText, deriveSharedKey, encryptText, generateIdentity, importPrivateKey } from '../../client/src/crypto.js';

// Small limits so the tests are quick. Acks must arrive within 300 ms.
const main = createHarness({ inbox: { maxPerUser: 3, ackTimeoutMs: 300 } });
// A second server where undelivered messages expire almost immediately.
const shortLived = createHarness({ inbox: { ttlMs: 300, sweepMs: 50 } });

before(async () => {
  await main.start();
  await shortLived.start();
});

after(async () => {
  await main.stop();
  await shortLived.stop();
});

/** Alice and Bob both announce themselves, then Bob goes offline. Returns both plus Alice's view of Bob. */
async function aliceWithOfflineBob(h) {
  const alice = await h.person('Alice');
  const bob = await h.person('Bob');
  await alice.send(alice.hello);
  await bob.send(bob.hello);
  const bobHello = await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);
  bob.socket.close();
  await alice.waitFor((p) => p.type === 'bye' && p.from === bob.id);
  return { alice, bob, bobHello };
}

const msg = (from, to, msgId, iv = 'aXY=', ct = 'Y3Q=') => ({ type: 'msg', from: from.id, to: to.id, msgId, iv, ct });

describe('offline inbox', () => {
  test('a message for an offline user is queued, then delivered and decrypted when they return', async () => {
    const { alice, bob, bobHello } = await aliceWithOfflineBob(main);

    // Alice encrypts for Bob using the public key she already has.
    const aliceKey = await deriveSharedKey(await importPrivateKey(alice.identity.privateJwk), bobHello.publicKey);
    const secret = 'Meet me at 5pm';
    const { iv, ct } = await encryptText(aliceKey, secret);
    const reply = await alice.send(msg(alice, bob, 1, iv, ct));
    assert.deepEqual(reply, { ok: true, queued: true });
    assert.equal((await main.health()).queued, 1);

    // Bob comes back later and gets it, flagged as queued and time-stamped by the server.
    const bobAgain = await main.comeBack(bob);
    await bobAgain.send(bobAgain.hello);
    const delivered = await bobAgain.waitFor((p) => p.type === 'msg');
    assert.equal(delivered.queued, true);
    assert.equal(delivered.from, alice.id);
    assert.equal(typeof delivered.sentAt, 'number');

    const aliceHello = await bobAgain.waitFor((p) => p.type === 'hello' && p.from === alice.id);
    const bobKey = await deriveSharedKey(await importPrivateKey(bob.identity.privateJwk), aliceHello.publicKey);
    assert.equal(await decryptText(bobKey, delivered), secret);

    // Once Bob's client confirmed it, it is gone from the inbox.
    await main.waitForQueued(0);
  });

  test('queued messages arrive in the order they were sent', async () => {
    const { alice, bob } = await aliceWithOfflineBob(main);
    for (const id of [1, 2, 3]) await alice.send(msg(alice, bob, id));

    const bobAgain = await main.comeBack(bob);
    await bobAgain.send(bobAgain.hello);
    await bobAgain.waitFor((p) => p.type === 'msg' && p.msgId === 3);
    const order = bobAgain.received.filter((p) => p.type === 'msg').map((p) => p.msgId);
    assert.deepEqual(order, [1, 2, 3]);
    await main.waitForQueued(0);
  });

  test('a full inbox rejects further messages so the sender knows', async () => {
    const { alice, bob } = await aliceWithOfflineBob(main);
    for (const id of [1, 2, 3]) assert.equal((await alice.send(msg(alice, bob, id))).queued, true);

    const reply = await alice.send(msg(alice, bob, 4));
    assert.equal(reply.ok, false);
    assert.equal(reply.undelivered, true);
    assert.match(reply.error, /full/i);

    // Clean up: let Bob collect them so later tests start from an empty inbox.
    const bobAgain = await main.comeBack(bob);
    await bobAgain.send(bobAgain.hello);
    await bobAgain.waitFor((p) => p.type === 'msg' && p.msgId === 3);
    await main.waitForQueued(0);
  });

  test('a message stays queued if the client never confirms it, and is redelivered next time', async () => {
    const { alice, bob } = await aliceWithOfflineBob(main);
    await alice.send(msg(alice, bob, 9));

    // This client receives the packet but never confirms it.
    const careless = await main.comeBack(bob, { ack: false });
    await careless.send(careless.hello);
    await careless.waitFor((p) => p.type === 'msg');
    await new Promise((resolve) => setTimeout(resolve, 500)); // longer than ackTimeoutMs
    assert.equal((await main.health()).queued, 1);
    careless.socket.close();

    // A well-behaved client picks it up and confirms.
    const careful = await main.comeBack(bob);
    await careful.send(careful.hello);
    const again = await careful.waitFor((p) => p.type === 'msg');
    assert.equal(again.msgId, 9);
    await main.waitForQueued(0);
  });

  test('delivery receipts for an offline sender are queued too', async () => {
    const alice = await main.person('Alice');
    const bob = await main.person('Bob');
    await alice.send(alice.hello);
    await bob.send(bob.hello);
    await bob.waitFor((p) => p.type === 'hello' && p.from === alice.id);

    alice.socket.close();
    await bob.waitFor((p) => p.type === 'bye' && p.from === alice.id);
    const reply = await bob.send({ type: 'ack', from: bob.id, to: alice.id, msgId: 5 });
    assert.deepEqual(reply, { ok: true, queued: true });

    const aliceAgain = await main.comeBack(alice);
    await aliceAgain.send(aliceAgain.hello);
    const ack = await aliceAgain.waitFor((p) => p.type === 'ack');
    assert.equal(ack.msgId, 5);
    await main.waitForQueued(0);
  });

  test('undelivered messages expire after the time limit', async () => {
    const { alice, bob } = await aliceWithOfflineBob(shortLived);
    await alice.send(msg(alice, bob, 1));
    assert.equal((await shortLived.health()).queued, 1);

    await shortLived.waitForQueued(0, 2000); // the sweeper drops it after ~300 ms

    const bobAgain = await shortLived.comeBack(bob);
    await bobAgain.send(bobAgain.hello);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(bobAgain.received.filter((p) => p.type === 'msg').length, 0);
  });
});

describe('known users', () => {
  test('a newcomer is told about offline users, marked offline', async () => {
    const { bob } = await aliceWithOfflineBob(main);
    const carol = await main.person('Carol');
    await carol.send(carol.hello);

    const bobEntry = await carol.waitFor((p) => p.type === 'hello' && p.from === bob.id);
    assert.equal(bobEntry.offline, true);
    assert.equal(bobEntry.publicKey.x, bob.identity.publicJwk.x);
  });

  test('an id cannot be taken over with a different key', async () => {
    const alice = await main.person('Alice');
    await alice.send(alice.hello);

    const thief = await main.client();
    const other = await generateIdentity();
    const reply = await thief.send({ ...alice.hello, publicKey: other.publicJwk });
    assert.equal(reply.ok, false);
    assert.match(reply.error, /different key/i);

    // The real owner can still reconnect with their own key.
    alice.socket.close();
    const aliceAgain = await main.comeBack(alice);
    assert.deepEqual(await aliceAgain.send(aliceAgain.hello), { ok: true });
  });

  test('the server never sees plaintext, even for queued messages', async () => {
    const { alice, bob, bobHello } = await aliceWithOfflineBob(main);
    const seen = [];
    main.server.io.sockets.sockets.forEach((socket) => socket.onAny((_event, packet) => seen.push(JSON.stringify(packet))));

    const key = await deriveSharedKey(await importPrivateKey(alice.identity.privateJwk), bobHello.publicKey);
    const { iv, ct } = await encryptText(key, 'top secret plan');
    await alice.send(msg(alice, bob, 1, iv, ct));

    assert.ok(seen.length > 0);
    assert.ok(seen.every((text) => !text.includes('secret') && !text.includes('plan')));

    const bobAgain = await main.comeBack(bob);
    await bobAgain.send(bobAgain.hello);
    await main.waitForQueued(0);
  });
});
