import { MongoClient } from 'mongodb';

// MongoDB-backed store (see store.js for the contract).
//
// Collections (database name comes from the connection string, default "chitchat"):
//   users  { _id: <user id>, name, publicKey: { x, y }, updatedAt }
//   inbox  { _id: <item id>, userId, packet, storedAt: Date }   <- TTL index on storedAt
//
// Nothing secret is stored: public keys and encrypted packets only.

/** Hides the password if a URI ever ends up in an error message. */
export const redact = (text) => String(text).replace(/(mongodb(?:\+srv)?:\/\/[^:\/\s]+:)[^@\s]+@/gi, '$1****@');

/** Turns the driver's technical errors into advice a person can act on. */
export function explainMongoError(error) {
  const text = String(error?.message ?? error);
  if (/bad auth|authentication failed/i.test(text)) {
    return 'MongoDB rejected the username or password. Check them in MONGODB_URI (a password with symbols like @ : / must be URL-encoded).';
  }
  if (/ENOTFOUND|querySrv|ECONNREFUSED/i.test(text)) {
    return 'Could not find the MongoDB server. Check the host name in MONGODB_URI and your internet connection.';
  }
  if (/ServerSelection|timed out|timeout|whitelist|not authorized|IP/i.test(text)) {
    return 'Could not reach MongoDB in time. In Atlas open Network Access and make sure your current IP address is allowed.';
  }
  if (/Invalid scheme|Invalid connection string|must be of the form/i.test(text)) {
    return 'MONGODB_URI is not a valid connection string. It should start with mongodb+srv:// or mongodb://';
  }
  return 'Could not connect to MongoDB.';
}

/**
 * Connects, checks the connection with a ping, and prepares the collections.
 * Throws an Error whose message is safe to print (no password).
 */
export async function createMongoStore({ uri, dbName, ttlMs, timeoutMs = 8000 }) {
  if (!uri) throw new Error('MONGODB_URI is not set.');

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: timeoutMs });
  let db;
  try {
    await client.connect();
    db = dbName ? client.db(dbName) : client.db(); // no name given -> use the one in the URI, else "test"
    if (!dbName && db.databaseName === 'test') db = client.db('chitchat');
    await db.command({ ping: 1 });
  } catch (error) {
    await client.close().catch(() => {});
    const wrapped = new Error(`${explainMongoError(error)} (${redact(error.message)})`);
    wrapped.cause = undefined;
    throw wrapped;
  }

  const users = db.collection('users');
  const inbox = db.collection('inbox');

  // Old queued packets disappear from the database by themselves (checked about once a minute).
  // Changing the TTL later means the index options differ, so we replace the index in that case.
  const ttlSeconds = Math.max(1, Math.round((ttlMs ?? 7 * 24 * 60 * 60 * 1000) / 1000));
  await inbox.createIndex({ userId: 1, storedAt: 1 });
  try {
    await inbox.createIndex({ storedAt: 1 }, { expireAfterSeconds: ttlSeconds, name: 'storedAt_ttl' });
  } catch (error) {
    if (error?.codeName === 'IndexOptionsConflict' || error?.code === 85 || error?.code === 86) {
      await db.command({ collMod: 'inbox', index: { name: 'storedAt_ttl', expireAfterSeconds: ttlSeconds } });
    } else {
      throw error;
    }
  }

  return {
    name: 'mongodb',
    databaseName: db.databaseName,
    /** Test helper: remove everything this store created. */
    async dropAll() {
      await users.deleteMany({});
      await inbox.deleteMany({});
    },
    async loadUsers() {
      const docs = await users.find({}).sort({ updatedAt: 1 }).toArray();
      return docs.map((doc) => ({
        type: 'hello',
        reply: false,
        from: doc._id,
        name: doc.name,
        publicKey: { kty: 'EC', crv: 'P-256', x: doc.publicKey.x, y: doc.publicKey.y },
      }));
    },
    async saveUser(hello) {
      await users.updateOne(
        { _id: hello.from },
        { $set: { name: hello.name, publicKey: { x: hello.publicKey.x, y: hello.publicKey.y }, updatedAt: new Date() } },
        { upsert: true },
      );
    },
    async loadInbox() {
      const docs = await inbox.find({}).sort({ storedAt: 1 }).toArray();
      return docs.map((doc) => ({ id: doc._id, userId: doc.userId, packet: doc.packet, storedAt: doc.storedAt.getTime() }));
    },
    async addInboxItem(item) {
      await inbox.insertOne({ _id: item.id, userId: item.userId, packet: item.packet, storedAt: new Date(item.storedAt) });
    },
    async removeInboxItem(id) {
      await inbox.deleteOne({ _id: id });
    },
    async close() {
      await client.close();
    },
  };
}
