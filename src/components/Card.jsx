import { motion } from 'framer-motion'

export default function Card({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 14 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`relative overflow-hidden rounded-[1.35rem] border-[3px] border-ink bg-cream p-5 shadow-neo sm:p-6 ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-4 top-3 h-2 rounded-full bg-white/55" />
      {children}
    </motion.div>
  )
}
