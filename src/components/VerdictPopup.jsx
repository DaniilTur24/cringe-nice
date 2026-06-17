import { motion } from 'framer-motion'
import Card from './Card'
import Button from './Button'

export default function VerdictPopup({ verdict, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className="w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="text-center">
          <span className="panel-label">Verdict</span>
          <p className="mt-4 text-xl font-black leading-tight">{verdict.message}</p>
          <Button variant="gold" className="mt-5 w-full" onClick={onClose}>
            Понятно
          </Button>
        </Card>
      </motion.div>
    </motion.div>
  )
}
