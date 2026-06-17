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
      <h2 className="text-xl font-bold">Тебя пригласили в Le Grand Суд</h2>
      <p className="mt-1 text-sm text-gray-600">
        Выбери имя и аватар, чтобы вступить в игру.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Input
          placeholder="Твоё имя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? 'Вступаем...' : 'Вступить в игру'}
        </Button>
      </form>
    </Card>
  )
}
