// Small helpers shared across ChitChat components.

const AVATAR_GRADIENTS = [
  ['#7c5cff', '#b27cff'],
  ['#ff5fa2', '#ff8a5c'],
  ['#18c7b5', '#4f8cff'],
  ['#f6a623', '#ff5f6d'],
  ['#4f8cff', '#7c5cff'],
  ['#2fd38c', '#18a5c7'],
  ['#ff6b9a', '#a855f7'],
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function gradientFor(name = '') {
  const [from, to] = AVATAR_GRADIENTS[hashString(name) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Centre-crops an image file to a square and downsizes it so it stays small
 * enough to keep in localStorage.
 */
export function resizeImage(file, size = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    img.src = url;
  });
}

/** Downsizes an image to fit inside `max` px (keeps aspect ratio) for chat thumbnails. */
export function makeThumbnail(file, max = 480, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    img.src = url;
  });
}

export function sameDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export function formatClock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDayLabel(ts) {
  const now = Date.now();
  if (sameDay(ts, now)) return 'Today';
  if (sameDay(ts, now - 864e5)) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function formatListTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  if (sameDay(ts, now)) return formatClock(ts);
  if (sameDay(ts, now - 864e5)) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function previewText(message) {
  if (!message) return 'No messages yet';
  if (message.kind === 'image') return 'Photo';
  if (message.kind === 'file') return `Document · ${message.fileName}`;
  return message.text;
}

const AUTO_REPLIES = [
  'Sounds good to me!',
  'Haha, nice one.',
  'Let me check and get back to you.',
  'Got it, thanks for sharing.',
  'That works. Talk soon!',
  'Can you send more details?',
  'Love that idea.',
  'On it right now.',
  'Perfect, see you then.',
];

export function pickReply() {
  return AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
}

export const EMOJIS = [
  '😀', '😂', '🥹', '😍', '🥰', '😎', '🤩', '😅',
  '😉', '🙂', '😴', '🤔', '😢', '😭', '😡', '🤯',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🔥', '✨',
  '❤️', '💜', '💙', '💯', '🎉', '🎶', '☕', '🍕',
];

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function newId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}
