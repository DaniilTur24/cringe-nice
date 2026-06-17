import { motion } from 'framer-motion'

const VARIANTS = {
  primary: 'bg-french-blue text-white',
  danger: 'bg-juicy-red text-white',
  secondary: 'bg-cream text-black',
}

export default function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}) {
  return (
    <motion.button
      whileTap={{ y: 4, borderBottomWidth: 0, boxShadow: '0px 0px 0px 0px rgba(0,0,0,1)' }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      className={`select-none rounded-2xl border-2 border-b-4 border-black px-6 py-3 font-extrabold uppercase tracking-wide shadow-neo ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
