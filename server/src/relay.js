// The ChitChat relay.
//
// It speaks the SAME packet format the frontend already uses over
// BroadcastChannel (see client/src/useSecureChannel.js), so switching the
// client from BroadcastChannel to Socket.IO later only changes the transport:
//
//   { type: 'hello', from, name, publicKey, reply }   announce yourself
//   { type: 'msg',   from, to, msgId, iv, ct }        encrypted message
//   { type: 'ack',   from, to, msgId }                delivery receipt
//
// The server only ever sees public keys and ciphertext. It has no private
// keys, so it cannot decrypt anything. It routes by the `to` field.
//
// OFFLINE INBOX
// If the recipient is a known user who is currently offline, the encrypted
// packet is queued and delivered the next time that user says `hello`.
// Delivery is "at least once": a queued packet is only removed after the
// client acknowledges it, so the client must dedupe by (from, msgId).

import { randomUUID } from 'node:crypto';

export const PACKET_EVENT = 'packet';

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 40;
const MAX_PACKET_BYTES = 32 * 1024; // generous for a text message + keys
const MAX_PACKETS_PER_WINDOW = 60;
const WINDOW_MS = 10_000;

export const DEFAULT_INBOX_OPTIONS = {
  maxPerUser: 200, // queued packets per recipient
  maxTotal: 10_000, // queued packets across all recipients
  ttlMs: 7 * 24 * 60 * 60 * 1000, // drop packets older than 7 days
  ackTimeoutMs: 5_000, // how long to wait for the client to confirm a delivery
  sweepMs: 60_000, // how often expired packets are cleaned out
  maxKnownUsers: 5_000, // how many different ids the server will remember
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isShortString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

function isPublicKey(key) {
  return (
    isObject(key) &&
    key.kty === 'EC' &&
    key.crv === 'P-256' &&
    isShortString(key.x, 128) &&
    isShortString(key.y, 128) &&
    key.d === undefined // a private key must never be sent to the server
  );
}

/** Returns an error string, or null if the packet is acceptable. */
export function validatePacket(packet) {
  if (!isObject(packet)) return 'Packet must be an object.';
  if (JSON.stringify(packet).length > MAX_PACKET_BYTES) return 'Packet is too large.';
  if (!isShortString(packet.from, MAX_ID_LENGTH)) return 'Missing or invalid "from".';

  switch (packet.type) {
    case 'hello':
      if (!isShortString(packet.name, MAX_NAME_LENGTH)) return 'Missing or invalid "name".';
      if (!isPublicKey(packet.publicKey)) return 'Missing or invalid P-256 public key.';
      return null;
    case 'msg':
      if (!isShortString(packet.to, MAX_ID_LENGTH)) return 'Missing or invalid "to".';
      if (!isShortString(packet.iv, 64) || !isShortString(packet.ct, MAX_PACKET_BYTES)) {
        return 'A message needs "iv" and "ct".';
      }
      return null;
    case 'ack':
      if (!isShortString(packet.to, MAX_ID_LENGTH)) return 'Missing or invalid "to".';
      return null;
    default:
      return 'Unknown packet type.';
  }
}

/** Keeps only the fields we expect, so clients can't smuggle extra data through us. */
function sanitize(packet) {
  switch (packet.type) {
    case 'hello':
      return {
        type: 'hello',
        reply: Boolean(packet.reply),
        from: packet.from,
        name: packet.name,
        publicKey: { kty: 'EC', crv: 'P-256', x: packet.publicKey.x, y: packet.publicKey.y },
      };
    case 'msg':
      return { type: 'msg', from: packet.from, to: packet.to, msgId: packet.msgId, iv: packet.iv, ct: packet.ct };
    default:
      return { type: 'ack', from: packet.from, to: packet.to, msgId: packet.msgId };
  }
}

const sameKey = (a, b) => a.x === b.x && a.y === b.y;

export function attachRelay(io, options = {}) {
  const config = { ...DEFAULT_INBOX_OPTIONS, ...options.inbox };
  // Optional storage (see store.js). Without one, everything lives in memory only.
  const store = options.store ?? null;

  // Working copies, kept in memory for speed. Every change is also written to
  // the store (if there is one) and loaded back by restore() after a restart.
  const known = new Map(); // userId -> sanitized hello (kept after they go offline)
  const online = new Map(); // userId -> socket id
  const inbox = new Map(); // userId -> [{ id, packet, storedAt, inFlight }]
  let queuedTotal = 0;

  /** Runs a store write in the background; a failure is logged, never crashes the server. */
  const background = (work, what) => {
    if (!store) return;
    Promise.resolve()
      .then(work)
      .catch((error) => console.error(`Storage problem (${what}):`, error?.message ?? error));
  };

  /** Loads users and queued packets from the store. Call once before accepting connections. */
  async function restore() {
    if (!store) return { users: 0, queued: 0 };
    for (const hello of await store.loadUsers()) {
      if (known.size < config.maxKnownUsers) known.set(hello.from, hello);
    }
    const now = Date.now();
    let queued = 0;
    for (const item of await store.loadInbox()) {
      if (now - item.storedAt > config.ttlMs) {
        background(() => store.removeInboxItem(item.id), 'remove expired');
        continue;
      }
      const list = inbox.get(item.userId) ?? [];
      list.push({ id: item.id, packet: item.packet, storedAt: item.storedAt, inFlight: false });
      inbox.set(item.userId, list);
      queued += 1;
    }
    queuedTotal += queued;
    return { users: known.size, queued };
  }

  // ---- inbox helpers ------------------------------------------------------

  function removeFromInbox(userId, item) {
    const list = inbox.get(userId);
    if (!list) return;
    const index = list.indexOf(item);
    if (index === -1) return;
    list.splice(index, 1);
    queuedTotal -= 1;
    if (store) background(() => store.removeInboxItem(item.id), 'remove from inbox');
    if (list.length === 0) inbox.delete(userId);
  }

  function purgeExpired(userId, now = Date.now()) {
    const list = inbox.get(userId);
    if (!list) return;
    for (const item of [...list]) {
      if (now - item.storedAt > config.ttlMs) removeFromInbox(userId, item);
    }
  }

  /**
   * Queues a packet. Resolves to an error string if it cannot be stored, else null.
   * With a store, we wait until the packet is safely saved before saying "queued",
   * so the sender is never told "queued" about a message that a crash could lose.
   */
  async function enqueue(userId, packet) {
    purgeExpired(userId);
    const list = inbox.get(userId) ?? [];
    if (list.length >= config.maxPerUser || queuedTotal >= config.maxTotal) {
      return 'Recipient inbox is full.';
    }
    const item = { id: randomUUID(), packet, storedAt: Date.now(), inFlight: false };
    // Reserve the spot straight away (before waiting) so parallel messages respect the limits.
    list.push(item);
    inbox.set(userId, list);
    queuedTotal += 1;
    if (store) {
      try {
        await store.addInboxItem({ id: item.id, userId, packet, storedAt: item.storedAt });
      } catch (error) {
        console.error('Storage problem (queue message):', error?.message ?? error);
        const current = inbox.get(userId);
        const index = current ? current.indexOf(item) : -1;
        if (index !== -1) {
          current.splice(index, 1);
          queuedTotal -= 1;
          if (current.length === 0) inbox.delete(userId);
        }
        return 'Could not store the message, please try again.';
      }
    }
    return null;
  }

  /**
   * Sends everything queued for `userId` to their freshly connected socket, in
   * order. Each packet is removed only once the client confirms it; if the
   * confirmation never comes, it stays queued and is retried on the next hello.
   */
  function flushInbox(socket, userId) {
    purgeExpired(userId);
    for (const item of inbox.get(userId) ?? []) {
      if (item.inFlight) continue;
      item.inFlight = true;
      socket.timeout(config.ackTimeoutMs).emit(PACKET_EVENT, { ...item.packet, queued: true }, (error) => {
        item.inFlight = false;
        if (!error) removeFromInbox(userId, item);
      });
    }
  }

  const sweeper = setInterval(() => {
    for (const userId of [...inbox.keys()]) purgeExpired(userId);
  }, config.sweepMs);
  sweeper.unref?.();

  // ---- connections --------------------------------------------------------

  io.on('connection', (socket) => {
    let userId = null;
    let windowStart = Date.now();
    let windowCount = 0;

    const rateLimited = () => {
      const now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      return windowCount > MAX_PACKETS_PER_WINDOW;
    };

    socket.on(PACKET_EVENT, (raw, callback) => {
      const reply = typeof callback === 'function' ? callback : () => {};

      if (rateLimited()) return reply({ ok: false, error: 'Slow down: too many packets.' });

      const problem = validatePacket(raw);
      if (problem) return reply({ ok: false, error: problem });

      // A socket may only speak as the identity it first announced.
      if (userId && raw.from !== userId) return reply({ ok: false, error: 'You cannot send as someone else.' });
      if (!userId && raw.type !== 'hello') return reply({ ok: false, error: 'Send a "hello" first.' });

      const packet = sanitize(raw);

      if (packet.type === 'hello') {
        const existing = known.get(packet.from);
        // An id stays bound to the first public key it used, so nobody can take it over with a new key.
        if (existing && !sameKey(existing.publicKey, packet.publicKey)) {
          return reply({ ok: false, error: 'This id is already registered with a different key.' });
        }
        if (!existing && known.size >= config.maxKnownUsers) {
          return reply({ ok: false, error: 'Server is full.' });
        }

        const firstHello = !userId;
        if (firstHello) {
          userId = packet.from;
          // Tell the newcomer who else exists, marking those who are offline.
          for (const [id, hello] of known) {
            if (id === userId) continue;
            socket.emit(PACKET_EVENT, { ...hello, reply: true, ...(online.has(id) ? {} : { offline: true }) });
          }
        }
        // Remember the user. Saved in the background: it is public data and is
        // announced again on every reconnect, so a missed save heals itself.
        if (!existing || existing.name !== packet.name) background(() => store.saveUser(packet), 'save user');
        known.set(userId, packet);
        online.set(userId, socket.id);
        socket.broadcast.emit(PACKET_EVENT, packet);
        reply({ ok: true });
        if (firstHello) flushInbox(socket, userId);
        return undefined;
      }

      // msg / ack: only to people the server has heard of.
      if (!known.has(packet.to)) {
        return reply({ ok: false, error: 'Unknown recipient.', undelivered: true });
      }

      const stamped = packet.type === 'msg' ? { ...packet, sentAt: Date.now() } : packet;
      const targetSocketId = online.get(packet.to);
      if (targetSocketId) {
        io.to(targetSocketId).emit(PACKET_EVENT, stamped);
        return reply({ ok: true });
      }

      enqueue(packet.to, stamped).then((full) => {
        if (full) return reply({ ok: false, error: full, undelivered: true });
        return reply({ ok: true, queued: true });
      });
      return undefined;
    });

    socket.on('disconnect', () => {
      if (userId && online.get(userId) === socket.id) {
        online.delete(userId);
        socket.broadcast.emit(PACKET_EVENT, { type: 'bye', from: userId });
      }
    });
  });

  return {
    onlineCount: () => online.size,
    queuedCount: () => queuedTotal,
    restore,
    close: () => clearInterval(sweeper),
  };
}
