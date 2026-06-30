import { useState } from 'react'
import Card from '../Card'
import GameRulesCard from '../GameRules'
import GoogleButton from './GoogleButton'

export default function EmailScreen({ onSubmit, onGoogleSignIn, inviteNotice }) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    await onSubmit(email.trim())
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <GameRulesCard />

      <Card>
        <h2 className="text-xl font-bold">Le Grand Суд</h2>
        {inviteNotice && (
          <p className="mt-2 rounded-[0.85rem] border-2 border-ink bg-white/75 p-3 text-sm font-bold text-ink/70">
            {inviteNotice}
          </p>
        )}
        <p className="mt-1 text-sm text-gray-600">Войди, чтобы продолжить.</p>

        <div className="mt-4 rounded-lg border border-[#dadce0] bg-white p-4">
          <GoogleButton onClick={onGoogleSignIn} />

          <div className="my-4 flex items-center gap-3 text-xs text-[#5f6368]">
            <span className="h-px flex-1 bg-[#dadce0]" />
            или
            <span className="h-px flex-1 bg-[#dadce0]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[#dadce0] bg-white px-3 py-2.5 text-sm text-[#3c4043] outline-none transition placeholder:text-[#80868b] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[#1a73e8] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Отправляем...' : 'Получить код'}
            </button>
          </form>
        </div>
      </Card>
    </div>
  )
}
