import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMongoStore, explainMongoError, redact } from '../src/mongoStore.js';
import { persistenceTests } from '../testing/persistenceSuite.js';

// Always runs: these need no database.
describe('mongo helpers', () => {
  test('redact hides the password', () => {
    const text = redact('failed for mongodb+srv://me:s3cret@cluster0.example.net/chitchat');
    assert.ok(!text.includes('s3cret'));
    assert.match(text, /me:\*\*\*\*@/);
  });

  test('errors are explained in plain words', () => {
    assert.match(explainMongoError(new Error('bad auth : authentication failed')), /username or password/i);
    assert.match(explainMongoError(new Error('getaddrinfo ENOTFOUND x')), /host name/i);
    assert.match(explainMongoError(new Error('Server selection timed out')), /Network Access/i);
  });

  test('a missing URI is reported clearly', async () => {
    await assert.rejects(createMongoStore({ uri: '' }), /MONGODB_URI is not set/);
  });
});

// Runs the same persistence checks against a REAL MongoDB, only if you opt in:
//   MONGODB_TEST_URI="mongodb+srv://..." npm test
// It uses its own database ("chitchat_test") and empties it, never your real "chitchat" data.
const testUri = process.env.MONGODB_TEST_URI;
if (testUri) {
  const stores = [];
  const makeStore = async () => {
    const store = await createMongoStore({ uri: testUri, dbName: 'chitchat_test', ttlMs: 7 * 24 * 60 * 60 * 1000 });
    await store.dropAll();
    stores.push(store);
    return store;
  };
  persistenceTests(makeStore, 'real MongoDB');
  after(async () => {
    for (const store of stores) {
      await store.dropAll();
      await store.close();
    }
  });
} else {
  test('real MongoDB tests (skipped: set MONGODB_TEST_URI to run them)', { skip: true }, () => {});
}
