import { AnimatePresence, motion } from 'framer-motion'
import Button from '../Button'

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  variant = 'danger',
  submitting = false,
  onConfirm,
  onCancel,
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-sm sm:items-center sm:py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="dialog-panel"
          >
            <div className="relative pt-4">
              <span className="panel-label">Подтверждение</span>
              <h2 className="mt-3 text-2xl font-black leading-tight">{title}</h2>
              {description && <p className="mt-3 text-sm font-bold leading-relaxed text-ink/65">{description}</p>}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="secondary" className="px-3" onClick={onCancel} disabled={submitting}>
                Отмена
              </Button>
              <Button variant={variant} className="px-3" onClick={onConfirm} disabled={submitting}>
                {submitting ? 'Подождите...' : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
