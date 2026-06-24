import Card from './Card'
import { ROLES } from '../lib/roles'

function chargesLabel(roleMetadata) {
  const role = roleMetadata?.role
  if (role === 'prosecutor') {
    const limit = roleMetadata.double_vote_limit ?? 3
    return `Удвоений сегодня: ${limit - (roleMetadata.double_vote_count ?? 0)}/${limit}`
  }
  if (role === 'judge') {
    return `Суперсилы: ${roleMetadata.super_verdict_remaining ?? 0}/2`
  }
  if (role === 'detective') {
    const limit = roleMetadata.reveals_limit ?? 2
    return `Разоблачений: ${roleMetadata.reveals_remaining ?? 0}/${limit}`
  }
  if (role === 'oligarch') {
    const limit = roleMetadata.reward_limit ?? 3
    const pct = roleMetadata.cashback_pct ?? 25
    const used = Math.min(roleMetadata.reward_create_count ?? 0, limit)
    const pending = roleMetadata.pending_cashback ?? 0
    // Кэшбэк копится скрыто и попадёт в общий счёт только когда роль
    // сгорит (см. assign_trip_role) — видно только самому Олигарху здесь.
    const pendingLabel = pending > 0 ? `, накоплено скрыто: ${pending}` : ''
    return `Кэшбэк ${pct}%: ${used}/${limit} наград использовано${pendingLabel}`
  }
  return null
}

export default function RoleBadge({ roleMetadata }) {
  const role = roleMetadata?.role
  if (!role) return null

  const info = ROLES[role] ?? ROLES.civilian
  const charges = chargesLabel(roleMetadata)

  return (
    <Card className="text-center">
      <span className="panel-label">Твоя роль</span>
      <h2 className="mt-3 text-xl font-black leading-tight">{info.label}</h2>
      <p className="mt-2 text-sm font-bold text-ink/65">{info.blurb}</p>
      {charges && (
        <span className="mt-3 inline-flex rounded-full bg-ink px-3 py-1 text-xs font-black uppercase tracking-wide text-cream">
          {charges}
        </span>
      )}
    </Card>
  )
}
