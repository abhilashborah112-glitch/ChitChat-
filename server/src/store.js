// Storage for the relay: known users (public keys) and queued ciphertext.
//
// A "store" is any object with these async methods:
//
//   loadUsers()                  -> [ hello packet, ... ]
//   saveUser(hello)              -> remember (or update) one user
//   loadInbox()                  -> [ { id, userId, packet, storedAt }, ... ] oldest first
//   addInboxItem(item)           -> persist one queued packet
//   removeInboxItem(id)          -> delete it (delivered, or expired)
//   close()                      -> release connections
//
// The relay keeps working copies in memory and writes every change through to
// the store, so a restart can load everything back (see relay.restore()).
// Only public keys and ciphertext ever reach a store, never private keys or text.

/** Keeps everything in a plain object. Used by tests, and as the contract for other stores. */
export function createMemoryStore() {
  const users = new Map();
  const inbox = new Map(); // id -> item
  return {
    name: 'memory',
    async loadUsers() {
      return [...users.values()].map((hello) => structuredClone(hello));
    },
    async saveUser(hello) {
      users.set(hello.from, structuredClone(hello));
    },
    async loadInbox() {
      return [...inbox.values()].sort((a, b) => a.storedAt - b.storedAt).map((item) => structuredClone(item));
    },
    async addInboxItem(item) {
      inbox.set(item.id, structuredClone(item));
    },
    async removeInboxItem(id) {
      inbox.delete(id);
    },
    async close() {},
  };
}
