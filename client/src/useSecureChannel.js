import { useCallback, useEffect, useRef, useState } from 'react';
import { decryptText, deriveSharedKey, encryptText, fingerprint, generateIdentity, importPrivateKey } from './crypto';

const CHANNEL_NAME = 'chitchat-e2ee-relay';
const IDENTITY_KEY = 'chitchat_v2_identity';

// One identity per browser tab (sessionStorage is per tab), so two tabs behave
// like two different people. Created once even if React runs effects twice.
let identityPromise = null;

function loadIdentity() {
  if (!identityPromise) {
    identityPromise = (async () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(IDENTITY_KEY));
        if (saved?.privateJwk && saved?.publicJwk && saved?.id) return saved;
      } catch {
        // fall through and create a new identity
      }
      const created = await generateIdentity();
      const identity = { ...created, id: crypto.randomUUID() };
      try {
        sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      } catch {
        // storage unavailable: the identity just lives for this page load
      }
      return identity;
    })();
  }
  return identityPromise;
}

/**
 * Encrypted chat between two browser tabs. BroadcastChannel stands in for the
 * network: everything that crosses it is a public key or ciphertext.
 */
export function useSecureChannel({ name, onMessage, onAck }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [peer, setPeer] = useState(null);
  const [log, setLog] = useState([]);

  const channelRef = useRef(null);
  const identityRef = useRef(null);
  const privateKeyRef = useRef(null);
  const sharedKeyRef = useRef(null);
  const peerIdRef = useRef(null);
  const nameRef = useRef(name);
  const handlers = useRef({ onMessage, onAck });

  useEffect(() => {
    handlers.current = { onMessage, onAck };
  });

  const addLog = useCallback((entry) => {
    setLog((prev) => [{ ...entry, at: Date.now() }, ...prev].slice(0, 8));
  }, []);

  const announce = useCallback((isReply) => {
    const identity = identityRef.current;
    if (!identity || !channelRef.current) return;
    channelRef.current.postMessage({
      type: 'hello',
      reply: Boolean(isReply),
      from: identity.id,
      name: nameRef.current,
      publicKey: identity.publicJwk,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel = null;

    (async () => {
      const identity = await loadIdentity();
      if (cancelled) return;
      identityRef.current = identity;
      privateKeyRef.current = await importPrivateKey(identity.privateJwk);
      const myPrint = await fingerprint(identity.publicJwk);
      if (cancelled) return;

      channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = async ({ data }) => {
        if (!data || data.from === identity.id) return;

        try {
          if (data.type === 'hello') {
            const key = await deriveSharedKey(privateKeyRef.current, data.publicKey);
            sharedKeyRef.current = key;
            peerIdRef.current = data.from;
            setPeer({ id: data.from, name: data.name, fingerprint: await fingerprint(data.publicKey) });
            if (!data.reply) announce(true);
            return;
          }

          if (data.to !== identity.id || !sharedKeyRef.current) return;

          if (data.type === 'msg') {
            const text = await decryptText(sharedKeyRef.current, data);
            addLog({ direction: 'in', iv: data.iv, ct: data.ct, text });
            handlers.current.onMessage?.(text, data.msgId);
            channel.postMessage({ type: 'ack', from: identity.id, to: data.from, msgId: data.msgId });
          } else if (data.type === 'ack') {
            handlers.current.onAck?.(data.msgId);
          }
        } catch {
          addLog({ direction: 'in', error: 'Could not decrypt a message (wrong key or tampered data).' });
        }
      };

      setMe({ id: identity.id, fingerprint: myPrint });
      setReady(true);
      announce(false);
    })();

    return () => {
      cancelled = true;
      if (channel) channel.close();
      channelRef.current = null;
    };
  }, [announce, addLog]);

  // Tell the other tab if the display name changes.
  useEffect(() => {
    nameRef.current = name;
    if (ready) announce(false);
  }, [name, ready, announce]);

  const send = useCallback(
    async (text, msgId) => {
      if (!sharedKeyRef.current || !peerIdRef.current || !channelRef.current) {
        throw new Error('No secure peer connected.');
      }
      const { iv, ct } = await encryptText(sharedKeyRef.current, text);
      channelRef.current.postMessage({
        type: 'msg',
        from: identityRef.current.id,
        to: peerIdRef.current,
        msgId,
        iv,
        ct,
      });
      addLog({ direction: 'out', iv, ct, text });
    },
    [addLog],
  );

  return { ready, me, peer, log, send };
}
