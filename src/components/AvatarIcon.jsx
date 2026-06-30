import { AVATAR_META, normalizeAvatar } from '../lib/avatars'

export default function AvatarIcon({ value, className = '', title }) {
  const key = normalizeAvatar(value)
  const meta = AVATAR_META[key] ?? AVATAR_META.J
  const isBunny = key === 'BUNNY'
  const isOwl = key === 'OWL'

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title ?? meta.label}
      className={className}
    >
      <circle cx="32" cy="32" r="30" fill="#fff7e8" stroke="#130a22" strokeWidth="3" />
      {isBunny ? (
        <>
          <path d="M22 18 C15 4, 25 1, 30 19" fill={meta.ear} stroke="#130a22" strokeWidth="3" />
          <path d="M42 18 C49 4, 39 1, 34 19" fill={meta.ear} stroke="#130a22" strokeWidth="3" />
        </>
      ) : (
        <>
          <circle cx="21" cy="19" r="9" fill={meta.ear} stroke="#130a22" strokeWidth="3" />
          <circle cx="43" cy="19" r="9" fill={meta.ear} stroke="#130a22" strokeWidth="3" />
        </>
      )}
      <circle cx="32" cy="34" r="22" fill={meta.face} stroke="#130a22" strokeWidth="3" />
      {key === 'FOX' && (
        <path d="M16 25 L32 43 L48 25 C44 51 20 51 16 25Z" fill={meta.mark} stroke="#130a22" strokeWidth="2" />
      )}
      {key === 'PANDA' && (
        <>
          <ellipse cx="23" cy="32" rx="8" ry="9" fill={meta.mark} />
          <ellipse cx="41" cy="32" rx="8" ry="9" fill={meta.mark} />
        </>
      )}
      {isOwl && (
        <>
          <circle cx="24" cy="32" r="9" fill={meta.mark} stroke="#130a22" strokeWidth="2" />
          <circle cx="40" cy="32" r="9" fill={meta.mark} stroke="#130a22" strokeWidth="2" />
        </>
      )}
      <circle cx="24" cy="33" r="3" fill="#130a22" />
      <circle cx="40" cy="33" r="3" fill="#130a22" />
      <path d="M29 41 Q32 44 35 41" fill="none" stroke="#130a22" strokeWidth="3" strokeLinecap="round" />
      {key === 'ADM' && (
        <path d="M21 20 L27 11 L32 20 L38 11 L43 20 Z" fill="#ffd166" stroke="#130a22" strokeWidth="3" />
      )}
    </svg>
  )
}
