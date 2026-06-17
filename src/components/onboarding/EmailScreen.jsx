import { useState } from 'react'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'

export default function EmailScreen({ onSubmit }) {
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
    <Card>
      <h2 className="text-xl font-bold">Le Grand Суд</h2>
      <p className="mt-1 text-sm text-gray-600">Введи email — пришлём код для входа.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? 'Отправляем...' : 'Получить код'}
        </Button>
      </form>
    </Card>
  )
}
