import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, X } from 'lucide-react';
import Avatar from './Avatar';
import { resizeImage } from '../utils';

/** Edit your own name, about line and profile photo. Contacts can't be edited here. */
export default function ProfileModal({ profile, onSave, onClose }) {
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Please choose an image under 10 MB.');
      return;
    }
    try {
      const avatarImage = await resizeImage(file, 256);
      setDraft((prev) => ({ ...prev, avatarImage }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setError('Your name cannot be empty.');
      return;
    }
    onSave({ ...draft, name, about: draft.about.trim() });
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card" onSubmit={handleSave} role="dialog" aria-modal="true" aria-label="Edit profile">
        <div className="modal-head">
          <h3>Edit profile</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="profile-photo-block">
          <button
            type="button"
            className="profile-photo-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
          >
            <Avatar name={draft.name || 'You'} image={draft.avatarImage} size={116} />
            <span className="profile-photo-overlay">
              <Camera size={22} />
              <span>Change</span>
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
          {draft.avatarImage && (
            <button
              type="button"
              className="text-btn danger"
              onClick={() => setDraft((prev) => ({ ...prev, avatarImage: null }))}
            >
              <Trash2 size={14} /> Remove photo
            </button>
          )}
        </div>

        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={draft.name}
            maxLength={40}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>About</span>
          <input
            type="text"
            value={draft.about}
            maxLength={90}
            onChange={(e) => setDraft((prev) => ({ ...prev, about: e.target.value }))}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
