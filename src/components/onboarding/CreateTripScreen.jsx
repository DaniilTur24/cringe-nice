import { useState } from 'react'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'

const DEFAULT_ROLE_SETTINGS = {
  oligarch_cashback_pct: 25,
  oligarch_reward_limit: 3,
  prosecutor_daily_charges: 3,
  detective_daily_charges: 2,
}

export default function CreateTripScreen({ onCreate }) {
  const [tripName, setTripName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRoleSettings, setShowRoleSettings] = useState(false)
  const [roleSettings, setRoleSettings] = useState(DEFAULT_ROLE_SETTINGS)

  function updateRoleSetting(key, value) {
    setRoleSettings((prev) => ({ ...prev, [key]: value }))
  }

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
          <div className="space-y-3 rounded-[1rem] border-2 border-ink bg-white/75 p-4">
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-ink/60">
                Кэшбэк Олигарха, %
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={roleSettings.oligarch_cashback_pct}
                onChange={(e) => updateRoleSetting('oligarch_cashback_pct', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-ink/60">
                Кэшбэк Олигарха — на сколько первых наград
              </label>
              <Input
                type="number"
                min={0}
                value={roleSettings.oligarch_reward_limit}
                onChange={(e) => updateRoleSetting('oligarch_reward_limit', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-ink/60">
                Прокурор — удвоений голоса в день
              </label>
              <Input
                type="number"
                min={0}
                value={roleSettings.prosecutor_daily_charges}
                onChange={(e) => updateRoleSetting('prosecutor_daily_charges', Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-ink/60">
                Детектив — разоблачений в день
              </label>
              <Input
                type="number"
                min={0}
                value={roleSettings.detective_daily_charges}
                onChange={(e) => updateRoleSetting('detective_daily_charges', Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        )}

        <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
          {submitting ? 'Создаём...' : 'Создать'}
        </Button>
      </form>
    </Card>
  )
}
