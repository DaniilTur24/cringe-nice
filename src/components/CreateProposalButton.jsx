import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import Button from './Button'
import Toast from './Toast'

const TYPES = [
  { value: 'fine', label: '🚨 Штраф' },
  { value: 'reward', label: '🎁 Награда' },
]

export default function CreateProposalButton({ tripId, userId, members }) {
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
      setToast({ type: 'error', message: error.message })
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
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full border-2 border-black bg-juicy-red text-3xl shadow-neo"
      >
        🔨
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
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
              className="w-full max-w-md rounded-t-3xl border-2 border-black bg-white p-6 shadow-neo sm:rounded-3xl"
            >
              <h2 className="text-xl font-bold">Новый иск</h2>

              <div className="mt-4 flex gap-3">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex-1 rounded-2xl border-2 border-black py-3 font-extrabold ${
                      type === t.value
                        ? t.value === 'fine'
                          ? 'bg-juicy-red text-white'
                          : 'bg-french-blue text-white'
                        : 'bg-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-4 w-full rounded-2xl border-2 border-black bg-white px-4 py-3 font-bold"
              >
                {otherMembers.length === 0 && <option value="">Пока нет других участников</option>}
                {otherMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.avatar_url ?? '🙂'} {m.username}
                  </option>
                ))}
              </select>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="В чём суть кринжа или подвига?"
                rows={3}
                className="mt-4 w-full rounded-2xl border-2 border-black bg-white px-4 py-3 font-bold outline-none"
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
