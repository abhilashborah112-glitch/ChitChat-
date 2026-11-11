import { KeyRound, ShieldCheck } from 'lucide-react';
import { formatClock } from '../utils';

/** Shows the keys and the raw encrypted data so the encryption can be demonstrated. */
export default function EncryptionPanel({ me, peer, log }) {
  return (
    <section className="enc-panel" aria-label="Encryption details">
      <div className="enc-grid">
        <div className="enc-card">
          <h4>
            <ShieldCheck size={15} /> How it works
          </h4>
          <p>
            Key exchange <b>ECDH P-256</b> → shared secret → message cipher <b>AES-256-GCM</b>, using the browser's
            Web Crypto API. Private keys stay in this tab. Only public keys and ciphertext travel between tabs.
          </p>
        </div>

        <div className="enc-card">
          <h4>
            <KeyRound size={15} /> Key fingerprints
          </h4>
          <dl>
            <dt>Your key</dt>
            <dd>{me?.fingerprint || '…'}</dd>
            <dt>{peer ? `${peer.name}'s key` : 'Their key'}</dt>
            <dd>{peer?.fingerprint || 'waiting for the other tab'}</dd>
          </dl>
          <small>Both tabs should show the same two fingerprints. If they match, nobody swapped the keys.</small>
        </div>
      </div>

      <h4 className="enc-log-title">What went over the channel</h4>
      {log.length === 0 ? (
        <p className="enc-empty">Send a message to see its encrypted form here.</p>
      ) : (
        <ul className="enc-log">
          {log.map((entry) => (
            <li key={`${entry.at}-${entry.direction}-${entry.iv || entry.error}`}>
              <div className="enc-log-head">
                <span className={`enc-dir ${entry.direction}`}>{entry.direction === 'out' ? 'Sent' : 'Received'}</span>
                <span>{formatClock(entry.at)}</span>
              </div>
              {entry.error ? (
                <p className="enc-error">{entry.error}</p>
              ) : (
                <>
                  <code title="Ciphertext (what anyone watching the channel sees)">{entry.ct}</code>
                  <small>
                    IV: {entry.iv} · Readable only with the shared key → “{entry.text}”
                  </small>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
