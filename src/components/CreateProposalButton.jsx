import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { avatarLabel } from '../lib/avatars'
import Button from './Button'
import Toast from './Toast'

const TYPES = [
  { value: 'fine', label: 'Штраф', tag: 'Red card' },
  { value: 'reward', label: 'Награда', tag: 'Bravo' },
]

export default function CreateProposalButton({ tripId, userId, members, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState('fine')
  const [targetId, setTargetId] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const otherMembers = members.filter((m) => m.id !== userId)

  function openModal() {
    setType('fine')
    setTargetId(otherMembers[0]?.id ?? '')
    setDescription('')
    setIsOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!targetId || !description.trim()) return

    setSubmitting(true)
    const { error } = await supabase.from('proposals').insert([
      {
        trip_id: tripId,
        creator_id: userId,
        target_id: targetId,
        type,
        description: description.trim(),
      },
    ])
    setSubmitting(false)

    if (error) {
      setToast({
        type: 'error',
        message:
          error.code === '23505'
            ? 'Уже есть дело на рассмотрении — дождись вердикта.'
            : error.message,
      })
      return
    }
    setIsOpen(false)
  }

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <motion.button
        type="button"
        onClick={openModal}
        disabled={disabled}
        animate={disabled ? {} : { y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        whileTap={disabled ? {} : { scale: 0.9 }}
        aria-label={disabled ? 'Дождись вердикта по текущему делу' : 'Создать новый иск'}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-ink bg-gold text-4xl font-black leading-none text-ink shadow-neo disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 px-3 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          >
            <motion.form
              onSubmit={handleSubmit}
              onClick={(e) => e.stopPropagation()}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-md rounded-t-[1.35rem] border-[3px] border-ink bg-cream p-5 shadow-neo sm:rounded-[1.35rem] sm:p-6"
            >
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setIsOpen(false)}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-ink bg-white text-2xl font-black leading-none text-ink shadow-neo-sm transition hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
              >
                ×
              </button>
              <span className="panel-label">New round</span>
              <h2 className="mt-4 text-2xl font-black leading-tight">Новый иск</h2>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`rounded-[1rem] border-[3px] border-ink px-3 py-3 text-left font-black shadow-neo-sm transition ${
                      type === t.value
                        ? t.value === 'fine'
                          ? 'bg-juicy-red text-white'
                          : 'bg-french-blue text-white'
                        : 'bg-white text-ink'
                    }`}
                  >
                    <span className="block text-[0.62rem] uppercase tracking-[0.14em] opacity-75">
                      {t.tag}
                    </span>
                    <span className="block text-lg leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>

              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-4 w-full rounded-[1rem] border-[3px] border-ink bg-white px-4 py-3 font-extrabold text-ink outline-none focus:ring-4 focus:ring-gold/55"
              >
                {otherMembers.length === 0 && <option value="">Пока нет других участников</option>}
                {otherMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{avatarLabel(m.avatar_url)}] {m.username}
                  </option>
                ))}
              </select>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="В чём суть кринжа или подвига?"
                rows={3}
                className="mt-4 w-full rounded-[1rem] border-[3px] border-ink bg-white px-4 py-3 font-extrabold text-ink outline-none placeholder:text-ink/45 focus:ring-4 focus:ring-gold/55"
              />

              <Button
                type="submit"
                variant={type === 'fine' ? 'danger' : 'primary'}
                className="mt-4 w-full"
                disabled={submitting || !targetId}
              >
                {submitting ? 'Отправка...' : 'Отправить на суд'}
              </Button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
