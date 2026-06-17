export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-[1rem] border-[3px] border-ink bg-white px-4 py-3 font-extrabold text-ink outline-none shadow-[inset_0_-4px_0_rgba(19,10,34,0.08)] placeholder:text-ink/45 focus:ring-4 focus:ring-gold/55 ${className}`}
      {...props}
    />
  )
}
