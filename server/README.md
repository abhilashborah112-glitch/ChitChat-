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
`http://localhost:3001/health`.

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

How it behaves:

- A client must send `hello` first. After that it can only send as that `from` id.
- `hello` is broadcast to everyone else, and the newcomer is sent a `hello`
  (with `reply: true`) for everyone already online.
- `msg` and `ack` are delivered only to the user named in `to`.
- The sender gets an acknowledgement callback: `{ ok: true }`, or
  `{ ok: false, error }`. When the recipient is offline the reply also has
  `undelivered: true`.
- Rejected on purpose: oversized packets, unknown types, a public key that
  contains a private part (`d`), sending as someone else, and more than 60
  packets per 10 seconds per connection.

## Where things are

| File                  | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `src/index.js`        | Reads `PORT` / `CLIENT_ORIGIN` and starts it   |
| `src/server.js`       | Builds the Express + Socket.IO server          |
| `src/relay.js`        | The relay logic and packet validation          |
| `test/relay.test.js`  | The test suite                                 |

## Ideas for next steps

- **Offline inbox:** keep encrypted messages for users who are offline and
  deliver them when they reconnect (still only ciphertext).
- **Persistence:** store public keys / ciphertext in MongoDB.
- **Real accounts:** sign-in, so a `from` id belongs to a real person. Right
  now the id is just whatever the client announces.
- **Several chats at once:** the frontend currently pairs with one peer; it
  could keep a key per contact.
