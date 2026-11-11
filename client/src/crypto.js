// End-to-end encryption helpers built on the browser's Web Crypto API.
//
//   Key agreement : ECDH on curve P-256   (each user has a key pair)
//   Message cipher: AES-GCM, 256-bit key  (derived from the ECDH shared secret)
//
// The private key never leaves the browser tab. Only public keys and
// ciphertext are ever sent anywhere.

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(buffer) {
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/** Creates a fresh ECDH key pair and returns both halves as JWK objects. */
export async function generateIdentity() {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  delete publicJwk.key_ops;
  return { privateJwk, publicJwk };
}

/** Turns a stored private JWK back into a usable (non-extractable) CryptoKey. */
export function importPrivateKey(privateJwk) {
  return crypto.subtle.importKey('jwk', privateJwk, ECDH, false, ['deriveKey']);
}

/**
 * Combines our private key with the other person's public key. Both sides
 * arrive at the same AES key without that key ever being transmitted.
 */
export async function deriveSharedKey(privateKey, peerPublicJwk) {
  const peerKey = await crypto.subtle.importKey('jwk', peerPublicJwk, ECDH, false, []);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts text. A new random IV is used for every message. */
export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  return { iv: toBase64(iv), ct: toBase64(cipher) };
}

/** Decrypts a payload made by encryptText. Throws if the key is wrong or data was altered. */
export async function decryptText(key, { iv, ct }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ct));
  return decoder.decode(plain);
}

/**
 * Short, human-comparable fingerprint of a public key (like a "safety number").
 * Both users should see the same fingerprint for each key; if they match, nobody
 * swapped the keys in transit.
 */
export async function fingerprint(publicJwk) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${publicJwk.x}.${publicJwk.y}`));
  const hex = Array.from(new Uint8Array(digest).slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{1,4}/g).join(' ').toUpperCase();
}
