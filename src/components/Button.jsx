import { motion } from 'framer-motion'

const VARIANTS = {
  primary: 'bg-french-blue text-white',
  danger: 'bg-juicy-red text-white',
  secondary: 'bg-white text-ink',
  gold: 'bg-gold text-ink',
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
      className={`select-none rounded-[1.05rem] border-[3px] border-b-[7px] border-ink px-6 py-3 text-sm font-black uppercase tracking-wide shadow-neo-sm outline-none transition focus-visible:ring-4 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
