import { motion } from 'framer-motion'
import { AVATARS } from '../lib/avatars'

export default function AvatarPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {AVATARS.map((avatar) => (
        <motion.button
          key={avatar}
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(avatar)}
          className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-black text-2xl shadow-neo-sm ${
            value === avatar ? 'bg-french-blue' : 'bg-white'
          }`}
        >
          {avatar}
        </motion.button>
      ))}
    </div>
  )
}
