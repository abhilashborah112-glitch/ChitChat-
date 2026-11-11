import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Avatar from './Avatar';

/** Start a chat with a contact. Contact photos are not editable by you. */
export default function NewChatModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a contact name.');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    onCreate({ name: name.trim(), phone });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label="New chat">
        <div className="modal-head">
          <h3>New chat</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="new-chat-preview">
          <Avatar name={name || 'New contact'} size={72} />
          <p>Contact photos belong to the contact, so only you can change your own picture.</p>
        </div>

        <label className="field">
          <span>Contact name</span>
          <input
            type="text"
            value={name}
            maxLength={40}
            placeholder="e.g. Rahul Sharma"
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Phone number</span>
          <div className="phone-row">
            <span className="phone-prefix">+91</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Start chat
          </button>
        </div>
      </form>
    </div>
  );
}
