export const AVATARS = ['BN', 'FR', 'CR', 'VN', 'MT', 'ET', 'AR', 'MS']

const LEGACY_AVATARS = {
  '🥖': 'BN',
  '🧀': 'FR',
  '🥐': 'CR',
  '🍷': 'VN',
  '🐌': 'MT',
  '🗼': 'ET',
  '🎨': 'AR',
  '🥸': 'MS',
  '👑': 'ADM',
  '🙂': 'J',
}

export function avatarLabel(value) {
  if (LEGACY_AVATARS[value]) return LEGACY_AVATARS[value]
  if (typeof value === 'string' && /^[A-Z0-9]{1,4}$/.test(value)) return value
  return 'J'
}
