import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'bgMusicMuted'

// Browsers block audible autoplay before any user gesture, so this tries to
// play immediately (works on some mobile browsers / muted-by-default cases)
// and, if that's rejected, retries on the first pointerdown/keydown anywhere
// on the page — same "tap to unmute the lobby" trick Kahoot and friends use.
export function useBackgroundMusic(src) {
  const audioRef = useRef(null)
  const [muted, setMuted] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')

  useEffect(() => {
    const audio = new Audio(src)
    audio.loop = true
    audio.volume = 0.35
    audio.muted = muted
    audioRef.current = audio

    function tryPlay() {
      audio.play().catch(() => {})
    }

    tryPlay()

    function unlock() {
      tryPlay()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)

    function handleVisibility() {
      if (document.hidden) {
        audio.pause()
      } else if (!audio.muted) {
        audio.play().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', handleVisibility)
      audio.pause()
      audioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
    localStorage.setItem(STORAGE_KEY, String(muted))
  }, [muted])

  return { muted, toggleMuted: () => setMuted((value) => !value) }
}
