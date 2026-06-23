import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabaseClient'
import Card from '../Card'
import Button from '../Button'
import Toast from '../Toast'
import { ROLES, SPECIAL_ROLES } from '../../lib/roles'

const ALL_BUTTONS = [...SPECIAL_ROLES, 'civilian']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function RoleWheel({ tripId, userId, onDone }) {
  // 'checking' (есть ли уже свежая роль на сегодня) | 'spin' | 'spinning' | 'result'
  const [phase, setPhase] = useState('checking')
  const [assignedRole, setAssignedRole] = useState(null)
  const [takenRoles, setTakenRoles] = useState([])
  const [toast, setToast] = useState(null)

  async function loadTakenRoles() {
    const { data } = await supabase
      .from('trip_members')
      .select('user_id, role_metadata')
      .eq('trip_id', tripId)

    const taken = (data ?? [])
      .filter((m) => m.user_id !== userId)
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

    setAssignedRole(data)
    setPhase('result')
  }

  if (phase === 'checking') {
    return (
      <Card className="text-center">
        <p className="font-bold">Проверяем твою роль на сегодня...</p>
      </Card>
    )
  }

  if (phase === 'result') {
    const info = ROLES[assignedRole.role] ?? ROLES.civilian
    return (
      <Card className="text-center">
        <span className="panel-label">Твоя роль на сегодня</span>
        <h2 className="mt-4 text-2xl font-black leading-tight">{info.label}</h2>
        <p className="mt-2 text-sm font-bold text-ink/65">{info.blurb}</p>
        <Button variant="gold" className="mt-6 w-full" onClick={onDone}>
          Продолжить
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <Card className="text-center">
        <span className="panel-label">Колесо ролей</span>
        <h2 className="mt-4 text-2xl font-black leading-tight">Крути и узнай свою роль на сегодня</h2>
        <p className="mt-2 text-sm font-bold text-ink/65">
          Роль скрыта от остальных и обновляется каждые сутки.
        </p>

        <motion.div
          animate={phase === 'spinning' ? { rotate: 1080 } : { rotate: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="mx-auto mt-6 flex h-32 w-32 items-center justify-center rounded-full border-[3px] border-ink bg-gold text-4xl shadow-neo"
        >
          🎡
        </motion.div>

        <Button
          variant="gold"
          className="mt-6 w-full"
          disabled={phase === 'spinning'}
          onClick={() => spin()}
        >
          {phase === 'spinning' ? 'Крутим...' : 'Крутить'}
        </Button>
      </Card>

      {/* Временная панель для отладки — позволяет принудительно назначить
          любую роль в этой же вкладке, минуя дневной лимит. Убрать перед
          релизом для реальных игроков. */}
      <div className="rounded-[1.35rem] border-[3px] border-juicy-red bg-white p-5 shadow-neo-sm">
        <span className="panel-label">🛑 Dev test panel (temporary)</span>
        <p className="mt-2 text-xs font-bold text-ink/55">
          Принудительно назначает роль для теста в этой вкладке. Удалить перед
          релизом.
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
