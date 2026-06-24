import { useBackgroundMusic } from '../hooks/useBackgroundMusic'

export default function BackgroundMusic() {
  const { muted, toggleMuted } = useBackgroundMusic('/audio/lobby-music.mp3')

  return (
    <button
      type="button"
      aria-label={muted ? 'Включить музыку' : 'Выключить музыку'}
      onClick={toggleMuted}
      className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-ink bg-gold text-ink shadow-neo-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
    >
      <SpeakerIcon muted={muted} />
    </button>
  )
}

function SpeakerIcon({ muted }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="none" />
      {!muted && <path d="M16 8a5 5 0 0 1 0 8" />}
      {!muted && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
      {muted && <path d="M16 9l5 5" />}
      {muted && <path d="M21 9l-5 5" />}
    </svg>
  )
}
