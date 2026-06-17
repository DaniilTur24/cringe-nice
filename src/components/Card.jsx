import { motion } from 'framer-motion'

export default function Card({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`rounded-3xl border-2 border-black bg-white p-6 shadow-neo ${className}`}
    >
      {children}
    </motion.div>
  )
}
