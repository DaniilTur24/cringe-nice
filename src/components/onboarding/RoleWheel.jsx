import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabaseClient'
import Card from '../Card'
import Button from '../Button'
import Toast from '../Toast'
import { ROLE_REFERENCE, ROLES, SPECIAL_ROLES, rolePerks, roleReference } from '../../lib/roles'

const ALL_BUTTONS = [...SPECIAL_ROLES, 'civilian']
const WHEEL_COLORS = ['#ffd166', '#4de3c1', '#0055ff', '#ff365e', '#fff7e8', '#9b5de5']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function RoleWheel({ tripId, userId, onDone }) {
  // 'checking' (есть ли уже свежая роль на сегодня) | 'spin' | 'spinning' | 'result'
  const [phase, setPhase] = useState('checking')
  const [assignedRole, setAssignedRole] = useState(null)
  const [takenRoles, setTakenRoles] = useState([])
  const [toast, setToast] = useState(null)
  const [spinCount, setSpinCount] = useState(0)

  const wheelGradient = useMemo(
    () =>
      `conic-gradient(${WHEEL_COLORS.map((color, index) => {
        const start = Math.round((index / WHEEL_COLORS.length) * 100)
        const end = Math.round(((index + 1) / WHEEL_COLORS.length) * 100)
        return `${color} ${start}% ${end}%`
      }).join(', ')})`,
    []
  )

  async function loadTakenRoles() {
    const { data } = await supabase
      .from('trip_members')
      .select('user_id, role_metadata')
      .eq('trip_id', tripId)

    const today = todayISO()
    const taken = (data ?? [])
      .filter((m) => m.user_id !== userId)
      .filter((m) => m.role_metadata?.assigned_at === today)
      .map((m) => m.role_metadata?.role)
      .filter((role) => role && role !== 'civilian')
    setTakenRoles(taken)
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data } = await supabase
        .from('trip_members')
        .select('role_metadata')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle()
      if (cancelled) return

      // Роль уже разыграна сегодня — не переспрашиваем повторно в том же дне.
      if (data?.role_metadata?.assigned_at === todayISO()) {
        onDone()
        return
      }

      await loadTakenRoles()
      if (!cancelled) setPhase('spin')
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId])

  async function spin(forcedRole, forceReassign = false) {
    setSpinCount((value) => value + 1)
    setPhase('spinning')
    const { data, error } = await supabase.rpc('assign_trip_role', {
      p_trip_id: tripId,
      p_user_id: userId,
      p_forced_role: forcedRole ?? null,
      p_force_reassign: forceReassign,
    })

    if (error) {
      setToast({ type: 'error', message: error.message })
      await loadTakenRoles()
      setPhase('spin')
      return
    }

    window.setTimeout(() => {
      setAssignedRole(data)
      setPhase('result')
    }, 450)
  }

  if (phase === 'checking') {
    return (
      <Card className="text-center">
        <span className="panel-label">Роли</span>
        <p className="mt-4 font-bold">Проверяем твою роль на сегодня...</p>
      </Card>
    )
  }

  if (phase === 'result') {
    const role = assignedRole?.role ?? 'civilian'
    const info = ROLES[role] ?? ROLES.civilian
    const reference = roleReference(role)
    const perks = rolePerks(assignedRole)

    return (
      <Card className="overflow-hidden text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-ink bg-mint shadow-neo">
          <span className="text-4xl font-black">{role === 'civilian' ? 'Г' : info.label.slice(0, 1)}</span>
        </div>
        <span className="panel-label mt-5">Твоя роль на сегодня</span>
        <h2 className="mt-4 text-3xl font-black leading-none text-ink">{reference.title}</h2>
        <p className="mt-3 text-sm font-bold leading-relaxed text-ink/70">{reference.description}</p>

        <div className="mt-5 grid gap-3 text-left">
          <RoleBrief label="Особый перк" value={reference.specialPerk} />
          <RoleBrief label="Лимит полномочий" value={reference.limit} />
        </div>

        <div className="mt-5 rounded-[1rem] border-[3px] border-ink bg-white p-4 text-left shadow-neo-sm">
          <h3 className="text-sm font-black uppercase tracking-wide text-ink/60">Твой статус прямо сейчас</h3>
          <ul className="mt-3 space-y-2 text-sm font-bold leading-snug text-ink/75">
            {perks.map((perk) => (
              <li key={perk} className="rounded-[0.75rem] border-2 border-ink bg-cream/80 p-2">
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <Button variant="gold" className="mt-6 w-full" onClick={onDone}>
          В бой
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <Card className="text-center">
        <span className="panel-label">Колесо Фортуны</span>
        <h2 className="mt-4 text-3xl font-black leading-none">Крути роль дня</h2>
        <p className="mt-2 text-sm font-bold text-ink/65">
          Роль скрыта от остальных, живёт один день и может резко поменять весь суд.
        </p>

        <div className="relative mx-auto mt-7 h-52 w-52">
          <div className="absolute left-1/2 top-[-8px] z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[24px] border-x-transparent border-t-juicy-red drop-shadow-[0_2px_0_#130a22]" />
          <motion.div
            animate={{ rotate: phase === 'spinning' ? 1440 + spinCount * 97 : spinCount * 97 }}
            transition={{ duration: 1.55, ease: [0.18, 0.82, 0.25, 1] }}
            className="flex h-full w-full items-center justify-center rounded-full border-[4px] border-ink shadow-neo"
            style={{ background: wheelGradient }}
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-[4px] border-ink bg-cream text-3xl font-black shadow-neo-sm">
              R
            </div>
          </motion.div>
        </div>

        <Button
          variant="gold"
          className="mt-7 w-full"
          disabled={phase === 'spinning'}
          onClick={() => spin()}
        >
          {phase === 'spinning' ? 'Судьба крутится...' : 'Крутить'}
        </Button>
      </Card>

      <Card>
        <span className="panel-label">Все роли</span>
        <div className="mt-4 grid gap-2">
          {ROLE_REFERENCE.map(({ role }) => (
            <div key={role} className="flex items-center justify-between rounded-[0.9rem] border-2 border-ink bg-white/80 p-3">
              <span className="font-black">{ROLES[role].label}</span>
              <span className="text-xs font-black uppercase text-ink/50">
                {takenRoles.includes(role) ? 'занята' : 'в пуле'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="rounded-[1.35rem] border-[3px] border-juicy-red bg-white p-5 shadow-neo-sm">
        <span className="panel-label">Dev test panel</span>
        <p className="mt-2 text-xs font-bold text-ink/55">
          Принудительно назначает роль для теста в этой вкладке. Удалить перед релизом.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ALL_BUTTONS.map((role) => {
            const isTaken = takenRoles.includes(role)
            return (
              <Button
                key={role}
                variant="secondary"
                disabled={isTaken || phase === 'spinning'}
                onClick={() => spin(role, true)}
                className="text-xs"
              >
                {ROLES[role].label}
                {isTaken ? ' (занято)' : ''}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RoleBrief({ label, value }) {
  return (
    <div className="rounded-[1rem] border-[3px] border-ink bg-white p-4 shadow-neo-sm">
      <p className="text-[0.68rem] font-black uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-2 text-sm font-bold leading-relaxed text-ink/75">{value}</p>
    </div>
  )
}
