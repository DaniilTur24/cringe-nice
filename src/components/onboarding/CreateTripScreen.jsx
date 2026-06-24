import { useState } from 'react'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'
import RoleSettingsFields from '../RoleSettingsFields'
import { DEFAULT_ROLE_SETTINGS } from '../../lib/roleSettings'

export default function CreateTripScreen({ onCreate }) {
  const [tripName, setTripName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRoleSettings, setShowRoleSettings] = useState(false)
  const [roleSettings, setRoleSettings] = useState(DEFAULT_ROLE_SETTINGS)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tripName.trim() || !adminName.trim()) return
    setSubmitting(true)
    await onCreate(tripName.trim(), adminName.trim(), roleSettings)
    setSubmitting(false)
  }

  return (
    <Card>
      <span className="panel-label">Nouvelle partie</span>
      <h2 className="mt-4 text-2xl font-black leading-tight">Новая поездка</h2>
      <p className="mt-2 text-sm font-bold text-ink/65">
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

        <button
          type="button"
          onClick={() => setShowRoleSettings((v) => !v)}
          className="text-sm font-bold text-ink/70 underline"
        >
          {showRoleSettings ? 'Скрыть настройки ролей' : 'Настроить роли (необязательно)'}
        </button>

        {showRoleSettings && (
          <RoleSettingsFields settings={roleSettings} onChange={setRoleSettings} />
        )}

        <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
          {submitting ? 'Создаём...' : 'Создать'}
        </Button>
      </form>
    </Card>
  )
}
