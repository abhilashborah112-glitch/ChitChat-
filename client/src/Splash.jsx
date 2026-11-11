import { useEffect, useState } from 'react';

const LETTERS = 'ChitChat'.split('');

/**
 * Animated intro: a typing bubble pops in, the ChitChat wordmark builds
 * letter by letter, then the whole screen fades into the app.
 */
export default function Splash({ onDone, duration = 3600 }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), duration - 600);
    const doneTimer = setTimeout(onDone, duration);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [duration, onDone]);

  return (
    <div
      className={`splash ${leaving ? 'splash-leaving' : ''}`}
      role="status"
      aria-label="Loading ChitChat"
      style={{ '--splash-duration': `${duration - 600}ms` }}
    >
      <span className="splash-orb splash-orb-a" />
      <span className="splash-orb splash-orb-b" />
      <span className="splash-orb splash-orb-c" />

      <div className="splash-stage">
        <div className="splash-mark-wrap">
          <span className="splash-ring splash-ring-1" />
          <span className="splash-ring splash-ring-2" />
          <span className="splash-bubble splash-bubble-left" />
          <span className="splash-bubble splash-bubble-right" />
          <div className="splash-mark">
            <span className="splash-dot" style={{ '--d': 0 }} />
            <span className="splash-dot" style={{ '--d': 1 }} />
            <span className="splash-dot" style={{ '--d': 2 }} />
          </div>
        </div>

        <h1 className="splash-title" aria-label="ChitChat">
          {LETTERS.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className={`splash-letter ${index >= 4 ? 'splash-letter-accent' : ''}`}
              style={{ '--i': index }}
              aria-hidden="true"
            >
              {letter}
            </span>
          ))}
        </h1>

        <p className="splash-tagline">Say it. Share it. Instantly.</p>

        <div className="splash-loader" aria-hidden="true">
          <span className="splash-loader-fill" />
        </div>
      </div>
    </div>
  );
}
