import { motion } from 'framer-motion'
import Button from './Button'
import { GameRulesContent } from './GameRules'

export default function RulesModal({ open, onClose }) {
  if (!open) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/75 px-3 py-4 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-[1.25rem] border-[3px] border-ink bg-cream p-4 shadow-neo"
        initial={{ y: 40, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="panel-label">Справка</span>
          <button
            type="button"
            aria-label="Закрыть справку"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-ink bg-white text-2xl font-black leading-none shadow-neo-sm"
          >
            ×
          </button>
        </div>
        <div className="mt-4">
          <GameRulesContent showRoles />
        </div>
        <Button variant="gold" className="mt-4 w-full" onClick={onClose}>
          Вернуться в суд
        </Button>
      </motion.div>
    </motion.div>
  )
}
