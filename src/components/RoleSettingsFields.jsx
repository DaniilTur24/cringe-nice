import Input from './Input'

export default function RoleSettingsFields({ settings, onChange }) {
  function update(key, value) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="space-y-3 rounded-[1rem] border-2 border-ink bg-white/75 p-4">
      <div>
        <label className="text-xs font-black uppercase tracking-wide text-ink/60">
          Кэшбэк Олигарха, %
        </label>
        <Input
          type="number"
          min={0}
          max={100}
          value={settings.oligarch_cashback_pct}
          onChange={(e) => update('oligarch_cashback_pct', Number(e.target.value))}
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
          value={settings.oligarch_reward_limit}
          onChange={(e) => update('oligarch_reward_limit', Number(e.target.value))}
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
          value={settings.prosecutor_daily_charges}
          onChange={(e) => update('prosecutor_daily_charges', Number(e.target.value))}
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
          value={settings.detective_daily_charges}
          onChange={(e) => update('detective_daily_charges', Number(e.target.value))}
          className="mt-1"
        />
      </div>
    </div>
  )
}
