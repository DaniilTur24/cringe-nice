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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
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
            className="w-full max-w-md rounded-t-3xl border-2 border-black bg-white p-6 shadow-neo sm:rounded-3xl"
          >
            <h2 className="text-xl font-bold">{title}</h2>
            {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}

            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
                Отмена
              </Button>
              <Button variant={variant} className="flex-1" onClick={onConfirm} disabled={submitting}>
                {submitting ? 'Подождите...' : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
