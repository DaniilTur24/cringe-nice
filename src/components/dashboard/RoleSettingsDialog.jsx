import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Button from '../Button'
import RoleSettingsFields from '../RoleSettingsFields'
import { DEFAULT_ROLE_SETTINGS } from '../../lib/roleSettings'

// Mount this with a `key` that changes on every "open" call (not on close)
// from the parent — that forces a fresh instance with fresh initial state
// per open, without needing an effect to resync `settings`, while letting
// the exit animation play instead of unmounting on close.
export default function RoleSettingsDialog({ open, initialSettings, submitting, onSave, onCancel }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_ROLE_SETTINGS, ...initialSettings }))

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
              <span className="panel-label">Правила</span>
              <h2 className="mt-3 text-2xl font-black leading-tight">Настройки ролей</h2>
              <p className="mt-3 text-sm font-bold leading-relaxed text-ink/65">
                Применятся при следующей раздаче ролей.
              </p>
            </div>

            <div className="mt-4">
              <RoleSettingsFields settings={settings} onChange={setSettings} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="secondary" className="px-3" onClick={onCancel} disabled={submitting}>
                Отмена
              </Button>
              <Button variant="gold" className="px-3" onClick={() => onSave(settings)} disabled={submitting}>
                {submitting ? 'Сохраняем...' : 'Сохранить'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
