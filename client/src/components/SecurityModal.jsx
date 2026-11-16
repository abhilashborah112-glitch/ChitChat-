import { useEffect } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';

/**
 * "Verify security code": the short fingerprints of both public keys. Compare them
 * with your contact (in person or by phone). If they match, nobody swapped the keys.
 * Only public information is shown here, never a private key.
 */
export default function SecurityModal({ me, peer, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Verify security code">
        <div className="modal-head">
          <h3>
            <ShieldCheck size={18} /> Verify security code
          </h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="security-lead">
          <Lock size={14} /> Messages in this chat are end-to-end encrypted. Only you and {peer?.name || 'your contact'} can
          read them, not even ChitChat can.
        </p>

        <dl className="security-codes">
          <dt>Your code</dt>
          <dd>{me?.fingerprint || '…'}</dd>
          <dt>{peer?.name ? `${peer.name}'s code` : 'Their code'}</dt>
          <dd>{peer?.fingerprint || '…'}</dd>
        </dl>

        <p className="security-help">
          To check the chat is secure, compare these codes with {peer?.name || 'your contact'} on their device. If they
          match, no one is listening in between.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
