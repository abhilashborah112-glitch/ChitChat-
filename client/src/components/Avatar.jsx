import { gradientFor, getInitials } from '../utils';

/**
 * Round avatar. Only the signed-in user's own avatar ever has an uploaded
 * `image`; every contact gets a generated gradient with initials.
 */
export default function Avatar({ name, image, size = 46, online = false, className = '' }) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
  };

  return (
    <span className={`avatar ${className}`} style={style} aria-hidden="true">
      {image ? (
        <img src={image} alt="" draggable="false" />
      ) : (
        <span className="avatar-fallback" style={{ background: gradientFor(name) }}>
          {getInitials(name)}
        </span>
      )}
      {online && <span className="avatar-online" />}
    </span>
  );
}
