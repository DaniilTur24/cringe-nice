import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Card from './Card'
import Button from './Button'

const TYPE_CONFIG = {
  fine: {
    agreeLabel: 'Штраф',
    agreeVariant: 'danger',
    color: '#FF3B3B',
    textClass: 'text-juicy-red',
    sign: -1,
  },
  reward: {
    agreeLabel: 'Награда',
    agreeVariant: 'primary',
    color: '#0055FF',
    textClass: 'text-french-blue',
    sign: 1,
  },
}

// AnimatePresence's `custom` prop forwards the latest direction into this
// variant function at the moment the card exits, so the fly-off target
// doesn't depend on the card having re-rendered with it beforehand.
const cardVariants = {
  exit: (direction) => ({
    x: direction * 500,
    opacity: 0,
    rotate: direction * 15,
  }),
}

export default function VoteCard({ proposal, onSubmit }) {
  const [subStep, setSubStep] = useState('choice') // 'choice' | 'slider'
  const [direction, setDirection] = useState(0) // 0 | -1 (reject) | 1 (confirm)
  const [magnitude, setMagnitude] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const config = TYPE_CONFIG[proposal.type]
  const score = magnitude * config.sign
  const isDone = direction !== 0

  // onSubmit is awaited so a failed insert (RLS, validation) keeps the card
  // in place instead of flying off as if the vote had been recorded.
  async function submitVote(value, exitDirection) {
    setSubmitting(true)
    const result = await onSubmit?.(value)
    setSubmitting(false)
    if (result?.error) return
    setDirection(exitDirection)
  }

  function handleReject() {
    submitVote(0, -1)
  }

  function handleConfirm() {
    submitVote(score, 1)
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {isDone ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="text-center">
            <p className="font-bold">Вердикт отправлен! Ожидаем остальных...</p>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          key="vote-card"
          variants={cardVariants}
          exit="exit"
          transition={{ duration: 0.4, ease: 'easeIn' }}
        >
          <Card>
            <h2 className="text-xl font-bold">{proposal.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{proposal.description}</p>

            <AnimatePresence mode="wait">
              {subStep === 'choice' ? (
                <motion.div
                  key="choice"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 flex gap-4"
                >
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={submitting}
                    onClick={handleReject}
                  >
                    Отклонить
                  </Button>
                  <Button
                    variant={config.agreeVariant}
                    className="flex-1"
                    disabled={submitting}
                    onClick={() => setSubStep('slider')}
                  >
                    {config.agreeLabel}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="slider"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-6"
                >
                  <div className="flex justify-center">
                    <motion.span
                      key={magnitude}
                      initial={{ scale: 1.4 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      className={`text-5xl font-extrabold ${config.textClass}`}
                    >
                      {score > 0 ? `+${score}` : score}
                    </motion.span>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={magnitude}
                    onChange={(e) => setMagnitude(Number(e.target.value))}
                    className="neo-range mt-4 w-full"
                    style={{ '--thumb-color': config.color }}
                  />

                  <Button
                    variant={config.agreeVariant}
                    className="mt-6 w-full"
                    disabled={submitting}
                    onClick={handleConfirm}
                  >
                    {submitting ? 'Отправка...' : '👍 Подтвердить балл'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
