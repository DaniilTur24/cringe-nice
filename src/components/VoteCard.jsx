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
    label: 'Accusation',
    sign: -1,
  },
  reward: {
    agreeLabel: 'Награда',
    agreeVariant: 'primary',
    color: '#0055FF',
    textClass: 'text-french-blue',
    label: 'Applause',
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

export default function VoteCard({ proposal, onSubmit, voterRole, voterRoleMetadata }) {
  const [subStep, setSubStep] = useState('choice') // 'choice' | 'slider'
  const [direction, setDirection] = useState(0) // 0 | -1 (reject) | 1 (confirm)
  const [magnitude, setMagnitude] = useState(1)
  const [isDouble, setIsDouble] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const config = TYPE_CONFIG[proposal.type]
  const score = magnitude * config.sign
  const isDone = direction !== 0

  // Судья может тянуть слайдер до ±20, но только пока есть заряд — иначе
  // ограничение обычное ±10, никакого отдельного тоггла не нужно.
  const superVerdictRemaining = voterRoleMetadata?.super_verdict_remaining ?? 0
  const sliderMax = voterRole === 'judge' && superVerdictRemaining > 0 ? 20 : 10

  // Прокурор удваивает вес голоса — 3 раза в день в текущей роли.
  const doubleVotesRemaining = 3 - (voterRoleMetadata?.double_vote_count ?? 0)
  const canDoubleVote = voterRole === 'prosecutor' && doubleVotesRemaining > 0

  // onSubmit is awaited so a failed insert (RLS, validation) keeps the card
  // in place instead of flying off as if the vote had been recorded.
  async function submitVote(value, exitDirection, weight = 1) {
    setSubmitting(true)
    const result = await onSubmit?.(value, weight)
    setSubmitting(false)
    if (result?.error) return
    setDirection(exitDirection)
  }

  function handleReject() {
    // Отклонение всегда весом 1 — удвоение Прокурора имеет смысл только для
    // ненулевого балла, который входит во взвешенное среднее.
    submitVote(0, -1, 1)
  }

  function handleConfirm() {
    submitVote(score, 1, isDouble ? 2 : 1)
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
            <span className="panel-label">{config.label}</span>
            <h2 className="mt-4 text-2xl font-black leading-tight">{proposal.title}</h2>
            <p className="mt-3 rounded-[1rem] border-2 border-ink bg-white/75 p-4 text-sm font-bold text-ink/70">
              {proposal.description}
            </p>

            <AnimatePresence mode="wait">
              {subStep === 'choice' ? (
                <motion.div
                  key="choice"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 grid grid-cols-2 gap-3"
                >
                  <Button
                    variant="secondary"
                    disabled={submitting}
                    onClick={handleReject}
                  >
                    Отклонить
                  </Button>
                  <Button
                    variant={config.agreeVariant}
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
                      className={`rounded-[1.15rem] border-[3px] border-ink bg-white px-8 py-4 text-6xl font-black leading-none shadow-neo-sm [font-variant-numeric:tabular-nums] ${config.textClass}`}
                    >
                      {score > 0 ? `+${score}` : score}
                    </motion.span>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={sliderMax}
                    value={magnitude}
                    onChange={(e) => setMagnitude(Number(e.target.value))}
                    className="neo-range mt-4 w-full"
                    style={{ '--thumb-color': config.color }}
                  />

                  {canDoubleVote && (
                    <label className="mt-4 flex items-center gap-2 rounded-[1rem] border-2 border-ink bg-white/75 p-3 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={isDouble}
                        onChange={(e) => setIsDouble(e.target.checked)}
                      />
                      Удвоить голос (осталось {doubleVotesRemaining}/3 сегодня)
                    </label>
                  )}

                  <Button
                    variant={config.agreeVariant}
                    className="mt-6 w-full"
                    disabled={submitting}
                    onClick={handleConfirm}
                  >
                    {submitting ? 'Отправка...' : 'Подтвердить балл'}
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
