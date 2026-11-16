# ChitChat server (relay)

A small Node + Express + Socket.IO server. It forwards **end-to-end encrypted**
messages between users. It only ever sees public keys and ciphertext, never
private keys or message text, so it **cannot read the chats**.

```
Browser A  ──(ciphertext)──▶  server  ──(ciphertext)──▶  Browser B
 encrypts                    only routes                  decrypts
```

## Run it

```bash
cd server
npm install
npm run dev      # restarts on file changes
# or: npm start
```

It listens on `http://localhost:3001` (change with `PORT`). Check it with
`http://localhost:3001/health`, which shows how many users are `online` and how
many messages are `queued` in offline inboxes.

By default it accepts connections from the Vite dev server
(`http://localhost:5173`). To allow other addresses, set `CLIENT_ORIGIN` to a
comma-separated list.

## Test it

```bash
npm test
```

The tests start the server, connect real Socket.IO clients, and use the
frontend's own `client/src/crypto.js` to encrypt and decrypt, so they cover the
whole path.

Tests need no database. To also run the persistence checks against your real
MongoDB (it uses its own `chitchat_test` database, never your real data):

```bash
# Windows PowerShell
$env:MONGODB_TEST_URI="mongodb+srv://..."; npm test
```

## MongoDB storage

With `MONGODB_URI` set in `server/.env`, the server saves **public keys** and
**queued ciphertext** to MongoDB, so a restart loses nothing. Without it, the
server runs in memory only, exactly as before.

On startup it connects, checks the connection, and prints either
`✔ Connected to MongoDB` or a plain-words reason it failed (and then does not
start). The password is never printed.

| Collection | Holds                                             |
| ---------- | ------------------------------------------------- |
| `users`    | id, display name, **public** key                  |
| `inbox`    | queued encrypted packets; expire after `INBOX_TTL_HOURS` (TTL index) |

How it works: the relay keeps working copies in memory and writes every change
to the database. On startup `relay.restore()` loads them back. A message is
reported as `queued` only after the database confirmed it; if the database
fails, the sender gets `undelivered: true` instead of a false "queued".

Private keys and message text never reach the database.

## Using it from the frontend

Start the server (`npm run dev` in `server/`) and the client (`npm run dev` in
`client/`). The client finds the server at port 3001 on the same host as the
page. To point it elsewhere, set `VITE_SERVER_URL` when starting the client, or
save an address in the browser: `localStorage.setItem('chitchat_v2_server_url', 'http://host:3001')`.
The server only accepts pages listed in `CLIENT_ORIGIN`.

Normal users only see "end-to-end encrypted" and a **Verify security code** option
(chat menu ⋮), which shows the two public-key fingerprints. The technical panel
(keys and raw ciphertext, handy for demos) is hidden unless you open the app with
`http://localhost:5173/?dev=1`. A private key is never shown anywhere.

Every person the server knows appears as a locked chat. The browser keeps its
identity in `localStorage`, so closing the browser and coming back keeps the same
id and key. To try two people on one computer use two different browsers, or a
private window.

## The packet format (the contract with the frontend)

One Socket.IO event, `packet`. The packet shapes are **identical** to what
`client/src/useSecureChannel.js` already sends over `BroadcastChannel`, so
switching the client to this server only changes the transport.

| `type`  | Fields                                      | Meaning                          |
| ------- | ------------------------------------------- | -------------------------------- |
| `hello` | `from`, `name`, `publicKey`, `reply`        | "I'm online, here's my public key" |
| `msg`   | `from`, `to`, `msgId`, `iv`, `ct`           | Encrypted message for `to`       |
| `ack`   | `from`, `to`, `msgId`                       | Delivery receipt                 |
| `bye`   | `from`                                      | Sent **by the server** when someone disconnects |

Extra fields the **server** adds (the client never sets these):

| Field      | On          | Meaning                                                       |
| ---------- | ----------- | ------------------------------------------------------------- |
| `sentAt`   | `msg`       | Server time (ms since 1970) when the message was accepted     |
| `queued`   | `msg`, `ack`| `true` when the packet waited in the inbox and is delivered late |
| `offline`  | `hello`     | `true` in the "who exists" list for users who are not online right now |

How it behaves:

- A client must send `hello` first. After that it can only send as that `from` id.
- `hello` is broadcast to everyone else, and the newcomer is sent a `hello`
  (with `reply: true`) for every user the server knows, marking offline ones
  with `offline: true`. The server remembers users after they disconnect, so you
  can encrypt for someone who is offline.
- `msg` and `ack` are delivered only to the user named in `to`.
- The sender gets an acknowledgement callback:
  - `{ ok: true }` — delivered to the recipient's open connection
  - `{ ok: true, queued: true }` — recipient is offline; stored in their inbox
  - `{ ok: false, error, undelivered: true }` — not delivered and not stored
    (unknown recipient, or their inbox is full)
  - `{ ok: false, error }` — the packet itself was rejected
- An id is bound to the first public key it used. A `hello` with the same id
  and a different key is rejected, so an id cannot be taken over with a new key.
- Rejected on purpose: oversized packets, unknown types, a public key that
  contains a private part (`d`), sending as someone else, and more than 60
  packets per 10 seconds per connection.

## Offline inbox

When a `msg` (or `ack`) is addressed to a **known but offline** user, the server
stores the encrypted packet instead of dropping it. The next time that user
sends `hello`, the queued packets are delivered in order, each marked
`queued: true`.

**The client must confirm every packet it receives.** Socket.IO does this with
an acknowledgement callback:

```js
socket.on('packet', (packet, confirm) => {
  // ...decrypt and show it, skipping any (from, msgId) you have already shown...
  if (typeof confirm === 'function') confirm();   // tells the server to delete it
});
```

A queued packet is removed only after `confirm()` is called. If the client never
confirms (crash, closed tab), the packet stays queued and is sent again on the
next `hello`. That is "at least once" delivery, so the client **must ignore
duplicates** by `(from, msgId)`.

Limits (set with environment variables, see `.env.example`):

| Limit                                | Default | Setting              |
| ------------------------------------ | ------- | -------------------- |
| Queued packets per offline user      | 200     | `INBOX_MAX_PER_USER` |
| How long an undelivered packet lives | 7 days  | `INBOX_TTL_HOURS`    |
| Queued packets across all users      | 10,000  | (in `relay.js`)      |

When an inbox is full the sender is told straight away (`undelivered: true`)
instead of the message silently disappearing.

### Known limits (good next tasks)

- **One server instance only.** The working copy is in memory, so running two
  copies of the server against one database would not share who is online.
- **Ids are not authenticated.** The id and public key are visible to everyone,
  so someone could announce the same id with the same public key, receive that
  user's queued ciphertext (they still cannot decrypt it) and confirm it, which
  deletes it from the real user's inbox. Real accounts / sign-in fix this.
- **The frontend's id does not survive closing the tab.** `useSecureChannel.js`
  keeps the identity in `sessionStorage` (one identity per tab, on purpose for
  the two-tab demo). For an inbox to be useful, the identity must be kept in
  `localStorage` so the same person comes back with the same id and key.
- **Live delivery is fire-and-forget.** If a socket has silently died but not
  yet been noticed, a message sent in that moment is lost. Using the same
  confirm-or-queue approach for live messages would close the gap.

## Where things are

| File                  | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `src/index.js`        | Reads `PORT` / `CLIENT_ORIGIN` and starts it   |
| `src/server.js`       | Builds the Express + Socket.IO server          |
| `src/relay.js`        | The relay logic, packet validation, offline inbox |
| `src/store.js`        | The storage contract + an in-memory store (tests) |
| `src/mongoStore.js`   | MongoDB storage and the startup connection check |
| `test/relay.test.js`  | Tests: presence, messaging, safety checks      |
| `test/inbox.test.js`  | Tests: the offline inbox                       |
| `test/persistence.test.js` | Tests: data survives a restart (memory store) |
| `test/mongo.test.js`  | Tests: MongoDB helpers; real MongoDB if `MONGODB_TEST_URI` is set |
| `testing/helpers.js`  | Shared test helpers (starts a real server)     |
| `testing/persistenceSuite.js` | The restart checks, shared by both stores |

## Ideas for next steps

- **Real accounts:** sign-in, so a `from` id belongs to a real person. Right
  now the id is just whatever the client announces.
- **Several chats at once:** the frontend currently pairs with one peer; it
  could keep a key per contact.
