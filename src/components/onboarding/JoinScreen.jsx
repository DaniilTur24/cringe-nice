import { useState } from 'react'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'
import AvatarPicker from '../AvatarPicker'
import { AVATARS } from '../../lib/avatars'

export default function JoinScreen({ onJoin }) {
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim()) return
    setSubmitting(true)
    await onJoin(username.trim(), avatar)
    setSubmitting(false)
  }

  return (
    <Card>
      <span className="panel-label">Guest pass</span>
      <h2 className="mt-4 text-2xl font-black leading-tight">Тебя пригласили в Le Grand Суд</h2>
      <p className="mt-2 text-sm font-bold text-ink/65">
        Выбери имя и аватар, чтобы вступить в игру.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Input
          placeholder="Твоё имя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
          {submitting ? 'Вступаем...' : 'Вступить в игру'}
        </Button>
      </form>
    </Card>
  )
}
