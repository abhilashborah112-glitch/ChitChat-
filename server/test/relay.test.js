import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createRelayServer } from '../src/server.js';
import { PACKET_EVENT } from '../src/relay.js';
// The real frontend encryption code, so the test covers the whole path.
import {
  decryptText,
  deriveSharedKey,
  encryptText,
  generateIdentity,
  importPrivateKey,
} from '../../client/src/crypto.js';

let server;
let url;
const sockets = [];

before(async () => {
  server = createRelayServer({ origins: ['http://localhost:5173'] });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${server.httpServer.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  server.io.close();
});

/** A connected test client that records every packet it receives. */
async function client() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const received = [];
  socket.on(PACKET_EVENT, (packet) => received.push(packet));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  const send = (packet) => socket.timeout(2000).emitWithAck(PACKET_EVENT, packet);
  const waitFor = async (predicate) => {
    for (let i = 0; i < 100; i += 1) {
      const hit = received.find(predicate);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Timed out waiting for a packet.');
  };
  return { socket, received, send, waitFor };
}

async function person(name) {
  const identity = await generateIdentity();
  const id = `${name}-${Math.random().toString(36).slice(2)}`;
  const c = await client();
  const hello = { type: 'hello', from: id, name, publicKey: identity.publicJwk };
  return { ...c, id, name, identity, hello };
}

describe('health', () => {
  test('GET /health reports ok', async () => {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });
});

describe('presence', () => {
  test('a newcomer is told who is online, and others hear about the newcomer', async () => {
    const alice = await person('Alice');
    assert.deepEqual(await alice.send(alice.hello), { ok: true });

    const bob = await person('Bob');
    assert.deepEqual(await bob.send(bob.hello), { ok: true });

    const aliceSeenByBob = await bob.waitFor((p) => p.type === 'hello' && p.from === alice.id);
    assert.equal(aliceSeenByBob.name, 'Alice');
    assert.equal(aliceSeenByBob.reply, true);

    const bobSeenByAlice = await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);
    assert.equal(bobSeenByAlice.name, 'Bob');
  });

  test('others are told when someone disconnects', async () => {
    const carol = await person('Carol');
    await carol.send(carol.hello);
    const dave = await person('Dave');
    await dave.send(dave.hello);
    await carol.waitFor((p) => p.type === 'hello' && p.from === dave.id);

    dave.socket.close();
    const bye = await carol.waitFor((p) => p.type === 'bye');
    assert.equal(bye.from, dave.id);
  });
});

describe('end-to-end encrypted messaging through the relay', () => {
  test('the receiver can decrypt, and the server only ever sees ciphertext', async () => {
    const alice = await person('Alice');
    const bob = await person('Bob');
    await alice.send(alice.hello);
    await bob.send(bob.hello);
    const aliceHello = await bob.waitFor((p) => p.type === 'hello' && p.from === alice.id);
    const bobHello = await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);

    // Each side derives the shared key from its own private key + the other's public key.
    const aliceKey = await deriveSharedKey(await importPrivateKey(alice.identity.privateJwk), bobHello.publicKey);
    const bobKey = await deriveSharedKey(await importPrivateKey(bob.identity.privateJwk), aliceHello.publicKey);

    // Record everything the server receives on every connected socket.
    const serverSaw = [];
    server.io.sockets.sockets.forEach((socket) =>
      socket.onAny((_event, packet) => serverSaw.push(JSON.stringify(packet))),
    );

    const secret = 'The secret meeting is at 5pm';
    const { iv, ct } = await encryptText(aliceKey, secret);
    const reply = await alice.send({ type: 'msg', from: alice.id, to: bob.id, msgId: 1, iv, ct });
    assert.deepEqual(reply, { ok: true });

    const delivered = await bob.waitFor((p) => p.type === 'msg');
    assert.equal(delivered.from, alice.id);
    assert.equal(await decryptText(bobKey, delivered), secret);

    // Everything the server received, and everything it forwarded, contains no plaintext.
    assert.ok(serverSaw.length > 0);
    for (const text of [...serverSaw, JSON.stringify(delivered)]) {
      assert.ok(!text.includes('secret') && !text.includes('5pm') && !text.includes('meeting'));
    }
  });

  test('a third person cannot read a message addressed to someone else', async () => {
    const alice = await person('Alice');
    const bob = await person('Bob');
    const eve = await person('Eve');
    for (const p of [alice, bob, eve]) await p.send(p.hello);
    const bobHello = await alice.waitFor((p) => p.type === 'hello' && p.from === bob.id);
    const aliceHello = await bob.waitFor((p) => p.type === 'hello' && p.from === alice.id);

    const aliceBobKey = await deriveSharedKey(await importPrivateKey(alice.identity.privateJwk), bobHello.publicKey);
    const { iv, ct } = await encryptText(aliceBobKey, 'for Bob only');
    await alice.send({ type: 'msg', from: alice.id, to: bob.id, msgId: 2, iv, ct });
    const forBob = await bob.waitFor((p) => p.type === 'msg');

    // Eve never receives it...
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(eve.received.filter((p) => p.type === 'msg').length, 0);

    // ...and even if she got hold of it, her key cannot decrypt it.
    const eveKey = await deriveSharedKey(await importPrivateKey(eve.identity.privateJwk), aliceHello.publicKey);
    await assert.rejects(decryptText(eveKey, forBob));
  });

  test('acks are routed back to the sender', async () => {
    const alice = await person('Alice');
    const bob = await person('Bob');
    await alice.send(alice.hello);
    await bob.send(bob.hello);
    await bob.waitFor((p) => p.type === 'hello' && p.from === alice.id);
    await bob.send({ type: 'ack', from: bob.id, to: alice.id, msgId: 7 });
    const ack = await alice.waitFor((p) => p.type === 'ack');
    assert.equal(ack.msgId, 7);
  });
});

describe('safety checks', () => {
  test('rejects a message before hello', async () => {
    const mallory = await client();
    const reply = await mallory.send({ type: 'msg', from: 'x', to: 'y', msgId: 1, iv: 'a', ct: 'b' });
    assert.equal(reply.ok, false);
    assert.match(reply.error, /hello/i);
  });

  test('rejects pretending to be someone else', async () => {
    const alice = await person('Alice');
    const mallory = await person('Mallory');
    await alice.send(alice.hello);
    await mallory.send(mallory.hello);
    const reply = await mallory.send({ type: 'msg', from: alice.id, to: alice.id, msgId: 1, iv: 'a', ct: 'b' });
    assert.equal(reply.ok, false);
    assert.match(reply.error, /someone else/i);
  });

  test('rejects a hello that contains a private key', async () => {
    const c = await client();
    const identity = await generateIdentity();
    const reply = await c.send({
      type: 'hello',
      from: 'leaky',
      name: 'Leaky',
      publicKey: { ...identity.publicJwk, d: identity.privateJwk.d },
    });
    assert.equal(reply.ok, false);
  });

  test('rejects bad shapes and unknown types', async () => {
    const c = await client();
    for (const bad of [null, 'text', [], { type: 'nope', from: 'x' }, { type: 'hello', from: 'x' }]) {
      const reply = await c.send(bad);
      assert.equal(reply.ok, false);
    }
  });

  test('reports when the recipient is offline', async () => {
    const alice = await person('Alice');
    await alice.send(alice.hello);
    const reply = await alice.send({ type: 'msg', from: alice.id, to: 'nobody', msgId: 3, iv: 'a', ct: 'b' });
    assert.equal(reply.ok, false);
    assert.equal(reply.undelivered, true);
  });

  test('rate-limits a flood of packets', async () => {
    const alice = await person('Flooder');
    await alice.send(alice.hello);
    let limited = 0;
    for (let i = 0; i < 80; i += 1) {
      const reply = await alice.send({ type: 'ack', from: alice.id, to: 'nobody', msgId: i });
      if (/too many/i.test(reply.error || '')) limited += 1;
    }
    assert.ok(limited > 0);
  });
});
