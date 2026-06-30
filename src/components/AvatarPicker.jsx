import { motion } from 'framer-motion'
import AvatarIcon from './AvatarIcon'
import { AVATARS, avatarLabel, normalizeAvatar } from '../lib/avatars'

export default function AvatarPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {AVATARS.map((avatar) => (
        <motion.button
          key={avatar}
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(avatar)}
          title={avatarLabel(avatar)}
          className={`flex aspect-square min-h-14 items-center justify-center rounded-[1rem] border-[3px] border-ink p-1.5 shadow-neo-sm transition ${
            normalizeAvatar(value) === avatar ? 'bg-mint text-ink' : 'bg-white text-ink'
          }`}
        >
          <AvatarIcon value={avatar} className="h-full w-full" />
        </motion.button>
      ))}
    </div>
  )
}
