import { useState } from 'react'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'

export default function CreateTripScreen({ onCreate }) {
  const [tripName, setTripName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tripName.trim() || !adminName.trim()) return
    setSubmitting(true)
    await onCreate(tripName.trim(), adminName.trim())
    setSubmitting(false)
  }

  return (
    <Card>
      <h2 className="text-xl font-bold">Новая поездка</h2>
      <p className="mt-1 text-sm text-gray-600">
        Создай поездку и пригласи друзей в свой Grand Суд.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Input
          placeholder="Название поездки"
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
        />
        <Input
          placeholder="Твоё имя (ты будешь админом)"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? 'Создаём...' : 'Создать'}
        </Button>
      </form>
    </Card>
  )
}
