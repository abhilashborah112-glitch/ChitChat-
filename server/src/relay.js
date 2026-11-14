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

export const PACKET_EVENT = 'packet';

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 40;
const MAX_PACKET_BYTES = 32 * 1024; // generous for a text message + keys
const MAX_PACKETS_PER_WINDOW = 60;
const WINDOW_MS = 10_000;

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

export function attachRelay(io) {
  // userId -> { socketId, hello }. In memory only: restart the server and everyone reconnects.
  const users = new Map();

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
        if (!userId) {
          userId = packet.from;
          // Tell the newcomer who is already here.
          for (const [id, entry] of users) {
            if (id !== userId) socket.emit(PACKET_EVENT, { ...entry.hello, reply: true });
          }
        }
        users.set(userId, { socketId: socket.id, hello: packet });
        socket.broadcast.emit(PACKET_EVENT, packet);
        return reply({ ok: true });
      }

      const target = users.get(packet.to);
      if (!target) {
        // Receiver is offline. A real inbox for offline messages is a good next feature.
        return reply({ ok: false, error: 'Recipient is not online.', undelivered: true });
      }
      io.to(target.socketId).emit(PACKET_EVENT, packet);
      return reply({ ok: true });
    });

    socket.on('disconnect', () => {
      if (userId && users.get(userId)?.socketId === socket.id) {
        users.delete(userId);
        socket.broadcast.emit(PACKET_EVENT, { type: 'bye', from: userId });
      }
    });
  });

  return { onlineCount: () => users.size };
}
