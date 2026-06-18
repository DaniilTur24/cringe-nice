import Card from './Card'
import { ROLES } from '../lib/roles'

function chargesLabel(roleMetadata) {
  const role = roleMetadata?.role
  if (role === 'prosecutor') {
    return `Удвоений сегодня: ${3 - (roleMetadata.double_vote_count ?? 0)}/3`
  }
  if (role === 'judge') {
    return `Суперсилы: ${roleMetadata.super_verdict_remaining ?? 0}/2`
  }
  if (role === 'detective') {
    return `Разоблачений: ${roleMetadata.reveals_remaining ?? 0}/2`
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
