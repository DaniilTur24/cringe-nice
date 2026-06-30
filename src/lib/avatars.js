export const AVATARS = ['FOX', 'CAT', 'DOG', 'PANDA', 'FROG', 'OWL', 'BUNNY', 'BEAR']

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
  BN: 'FOX',
  FR: 'CAT',
  CR: 'DOG',
  VN: 'PANDA',
  MT: 'FROG',
  ET: 'OWL',
  AR: 'BUNNY',
  MS: 'BEAR',
}

export const AVATAR_META = {
  FOX: { label: 'Лис', face: '#ff9f1c', ear: '#ffbf69', mark: '#fff7e8' },
  CAT: { label: 'Кот', face: '#4de3c1', ear: '#b9fff0', mark: '#fff7e8' },
  DOG: { label: 'Пёс', face: '#ffd166', ear: '#9b5de5', mark: '#fff7e8' },
  PANDA: { label: 'Панда', face: '#fff7e8', ear: '#130a22', mark: '#130a22' },
  FROG: { label: 'Лягуш', face: '#7bd88f', ear: '#b9fbc0', mark: '#fff7e8' },
  OWL: { label: 'Сова', face: '#8ecae6', ear: '#0055ff', mark: '#fff7e8' },
  BUNNY: { label: 'Заяц', face: '#f7cad0', ear: '#ff85a1', mark: '#fff7e8' },
  BEAR: { label: 'Медведь', face: '#c89f72', ear: '#8b5e34', mark: '#fff7e8' },
  ADM: { label: 'Админ', face: '#ffd166', ear: '#ff365e', mark: '#130a22' },
  J: { label: 'Игрок', face: '#fff7e8', ear: '#4de3c1', mark: '#130a22' },
}

export function normalizeAvatar(value) {
  if (LEGACY_AVATARS[value]) return LEGACY_AVATARS[value]
  if (AVATAR_META[value]) return value
  return 'J'
}

export function avatarLabel(value) {
  return AVATAR_META[normalizeAvatar(value)]?.label ?? 'Игрок'
}
