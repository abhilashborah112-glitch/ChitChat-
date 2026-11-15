import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { decryptText, deriveSharedKey, encryptText, fingerprint, generateIdentity, importPrivateKey } from './crypto';

// Talks to the ChitChat relay server (see /server). Everything that leaves this
// browser is a public key or ciphertext, so the server cannot read the chats.

const PACKET_EVENT = 'packet';
const IDENTITY_KEY = 'chitchat_v3_identity';
const SEEN_KEY = 'chitchat_v3_seen';
const SERVER_URL_KEY = 'chitchat_v2_server_url';
const MAX_SEEN = 500;

/**
 * Where the server is. Order: VITE_SERVER_URL (build time), a saved address
 * (localStorage "chitchat_v2_server_url"), then port 3001 on the same host as this page.
 */
export function getServerUrl() {
  const fromEnv = import.meta.env?.VITE_SERVER_URL;
  if (fromEnv) return fromEnv;
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY);
    if (saved) return saved;
  } catch {
    // storage unavailable: use the default below
  }
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

// The identity is kept in localStorage, so the same person comes back with the
// same id and key after closing the browser (needed for the offline inbox).
// Created once even if React runs effects twice.
let identityPromise = null;

function loadIdentity() {
  if (!identityPromise) {
    identityPromise = (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(IDENTITY_KEY));
        if (saved?.privateJwk && saved?.publicJwk && saved?.id) return saved;
      } catch {
        // fall through and create a new identity
      }
      const created = await generateIdentity();
      const identity = { ...created, id: crypto.randomUUID() };
      try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      } catch {
        // storage unavailable: the identity just lives for this page load
      }
      return identity;
    })();
  }
  return identityPromise;
}

function loadSeen() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // start empty
  }
  return [];
}

/**
 * Encrypted chat through the relay server, with any number of contacts.
 *
 *  - `status`: 'connecting' | 'online' | 'offline' (server reachable or not)
 *  - `peers`: everyone the server knows: { id, name, fingerprint, online }
 *  - `send(peerId, text, msgId)`: resolves with the server reply ({ ok, queued? }); rejects if not sent
 *  - `onMessage(peerId, text, msgId, { sentAt, queued })`, `onAck(peerId, msgId)`: callbacks
 *
 * Messages for people who are offline wait in the server's inbox. Packets can
 * arrive twice (at-least-once delivery), so repeats are dropped by (sender, msgId).
 */
export function useSecureChannel({ name, onMessage, onAck }) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [problem, setProblem] = useState('');
  const [me, setMe] = useState(null);
  const [peers, setPeers] = useState([]);
  const [log, setLog] = useState([]);

  const socketRef = useRef(null);
  const identityRef = useRef(null);
  const privateKeyRef = useRef(null);
  const peersRef = useRef(new Map()); // id -> { id, name, key, fingerprint, online }
  const seenRef = useRef(loadSeen());
  const nameRef = useRef(name);
  const handlers = useRef({ onMessage, onAck });

  useEffect(() => {
    handlers.current = { onMessage, onAck };
  });

  const addLog = useCallback((entry) => {
    setLog((prev) => [{ ...entry, at: Date.now() }, ...prev].slice(0, 8));
  }, []);

  const publishPeers = useCallback(() => {
    setPeers([...peersRef.current.values()].map(({ id, name: peerName, fingerprint: print, online }) => ({ id, name: peerName, fingerprint: print, online })));
  }, []);

  const announce = useCallback(() => {
    const identity = identityRef.current;
    const socket = socketRef.current;
    if (!identity || !socket?.connected) return;
    socket.emit(
      PACKET_EVENT,
      { type: 'hello', from: identity.id, name: nameRef.current, publicKey: identity.publicJwk },
      (reply) => setProblem(reply?.ok === false ? reply.error : ''),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket = null;
    let chain = Promise.resolve(); // handles packets one at a time, so queued messages stay in order

    const rememberSeen = (id) => {
      seenRef.current = [...seenRef.current, id].slice(-MAX_SEEN);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seenRef.current));
      } catch {
        // not remembered across reloads
      }
    };

    async function handle(packet, identity) {
      if (!packet || packet.from === identity.id) return;

      try {
        if (packet.type === 'hello') {
          const key = await deriveSharedKey(privateKeyRef.current, packet.publicKey);
          peersRef.current.set(packet.from, {
            id: packet.from,
            name: packet.name,
            key,
            fingerprint: await fingerprint(packet.publicKey),
            online: !packet.offline,
          });
          publishPeers();
          return;
        }

        if (packet.type === 'bye') {
          const peer = peersRef.current.get(packet.from);
          if (peer) {
            peer.online = false;
            publishPeers();
          }
          return;
        }

        if (packet.to !== identity.id) return;
        const peer = peersRef.current.get(packet.from);

        if (packet.type === 'msg') {
          if (!peer) throw new Error('unknown sender');
          const seenId = `${packet.from}:${packet.msgId}`;
          if (!seenRef.current.includes(seenId)) {
            const text = await decryptText(peer.key, packet);
            addLog({ direction: 'in', peer: peer.name, iv: packet.iv, ct: packet.ct, text });
            handlers.current.onMessage?.(packet.from, text, packet.msgId, { sentAt: packet.sentAt, queued: Boolean(packet.queued) });
            rememberSeen(seenId);
          }
          // Always (re)send the receipt: the sender may have missed the first one.
          socket.emit(PACKET_EVENT, { type: 'ack', from: identity.id, to: packet.from, msgId: packet.msgId });
        } else if (packet.type === 'ack') {
          handlers.current.onAck?.(packet.from, packet.msgId);
        }
      } catch {
        addLog({ direction: 'in', error: 'Could not decrypt a message (wrong key or tampered data).' });
      }
    }

    (async () => {
      const identity = await loadIdentity();
      if (cancelled) return;
      identityRef.current = identity;
      privateKeyRef.current = await importPrivateKey(identity.privateJwk);
      const myPrint = await fingerprint(identity.publicJwk);
      if (cancelled) return;

      socket = io(getServerUrl(), { transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        setStatus('online');
        announce();
      });
      socket.on('disconnect', () => {
        setStatus('offline');
        for (const peer of peersRef.current.values()) peer.online = false;
        publishPeers();
      });
      socket.on('connect_error', () => setStatus('offline'));

      socket.on(PACKET_EVENT, (packet, confirm) => {
        chain = chain
          .then(() => handle(packet, identity))
          .finally(() => {
            // Tells the server this packet arrived, so it can delete it from our inbox.
            if (typeof confirm === 'function') confirm();
          });
      });

      setMe({ id: identity.id, fingerprint: myPrint });
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
      socketRef.current = null;
    };
  }, [announce, addLog, publishPeers]);

  // Tell everyone if the display name changes.
  useEffect(() => {
    nameRef.current = name;
    if (ready) announce();
  }, [name, ready, announce]);

  const send = useCallback(
    async (peerId, text, msgId) => {
      const peer = peersRef.current.get(peerId);
      const socket = socketRef.current;
      if (!peer) throw new Error('Unknown contact.');
      if (!socket?.connected) throw new Error('Not connected to the server.');
      const { iv, ct } = await encryptText(peer.key, text);
      const reply = await socket
        .timeout(5000)
        .emitWithAck(PACKET_EVENT, { type: 'msg', from: identityRef.current.id, to: peerId, msgId, iv, ct });
      if (!reply?.ok) throw new Error(reply?.error || 'The server did not accept the message.');
      addLog({ direction: 'out', peer: peer.name, iv, ct, text });
      return reply;
    },
    [addLog],
  );

  return { ready, status, problem, me, peers, log, send };
}
