export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-2xl border-2 border-black bg-white px-4 py-3 font-bold outline-none focus:ring-4 focus:ring-french-blue/30 ${className}`}
      {...props}
    />
  )
}
