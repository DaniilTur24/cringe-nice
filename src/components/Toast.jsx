import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed left-4 right-4 top-4 z-50 mx-auto max-w-md rounded-[1rem] border-[3px] border-ink p-4 text-center font-black text-white shadow-neo ${
            toast.type === 'error' ? 'bg-juicy-red' : 'bg-french-blue'
          }`}
          onClick={onDismiss}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
