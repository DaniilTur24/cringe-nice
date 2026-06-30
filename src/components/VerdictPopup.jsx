import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Card from './Card'
import Button from './Button'

function TypewriterText({ text }) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (!text) return

    const interval = window.setInterval(() => {
      setVisibleCount((count) => {
        const next = count + 1
        if (next >= text.length) window.clearInterval(interval)
        return next
      })
    }, 22)

    return () => window.clearInterval(interval)
  }, [text])

  const visibleText = text.slice(0, visibleCount)

  return (
    <p className="mt-2 text-sm font-black leading-snug text-ink/80">
      {visibleText}
      {visibleText.length < text.length && <span className="animate-pulse">|</span>}
    </p>
  )
}

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
          <div className="mt-5 rounded-[1rem] border-2 border-ink bg-white/75 p-4 text-left shadow-neo-sm">
            <span className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-ink/55">
              Судебный стендап
            </span>
            {verdict.aiVerdict ? (
              <TypewriterText key={verdict.aiVerdict} text={verdict.aiVerdict} />
            ) : (
              <div className="mt-2 space-y-2">
                <p className="animate-pulse text-sm font-black text-ink/60">Судья подбирает слова...</p>
                <div className="h-3 w-full animate-pulse rounded-full bg-ink/10" />
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-ink/10" />
              </div>
            )}
          </div>
          <Button variant="gold" className="mt-5 w-full" onClick={onClose}>
            Понятно
          </Button>
        </Card>
      </motion.div>
    </motion.div>
  )
}
