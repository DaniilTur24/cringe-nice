import { motion } from 'framer-motion'
import { AVATARS, avatarLabel } from '../lib/avatars'

export default function AvatarPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {AVATARS.map((avatar) => (
        <motion.button
          key={avatar}
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(avatar)}
          className={`flex aspect-square min-h-14 items-center justify-center rounded-[1rem] border-[3px] border-ink text-sm font-black shadow-neo-sm transition ${
            value === avatar ? 'bg-mint text-ink' : 'bg-white text-ink'
          }`}
        >
          {avatarLabel(avatar)}
        </motion.button>
      ))}
    </div>
  )
}
