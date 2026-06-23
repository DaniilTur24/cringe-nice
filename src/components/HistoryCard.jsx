import { useState } from 'react'
import Button from './Button'

const TYPE_LABEL = {
  fine: 'Жалоба',
  reward: 'Награда',
}

const STATUS_LABEL = {
  approved: 'Одобрено',
  rejected: 'Отклонено',
}

export default function HistoryCard({ proposal, creatorName, canRevealSelf, canRevealAll, onReveal }) {
  const [submitting, setSubmitting] = useState(false)

  async function handleReveal(scope) {
    setSubmitting(true)
    await onReveal(scope)
    setSubmitting(false)
  }

  return (
    <div className="rounded-[1rem] border-2 border-ink bg-white p-3 shadow-[0_4px_0_#130A22]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wide text-ink/55">
          {TYPE_LABEL[proposal.type]} · {STATUS_LABEL[proposal.status]}
        </span>
        {proposal.status === 'approved' && proposal.final_score != null && (
          <span className="text-sm font-black">{proposal.final_score > 0 ? `+${proposal.final_score}` : proposal.final_score}</span>
        )}
      </div>
      <p className="mt-2 text-sm font-bold">
        {proposal.type === 'fine' ? 'Жалоба на' : 'Награда для'} {proposal.targetName}
      </p>
      <p className="mt-1 text-xs font-bold text-ink/55">Автор: {creatorName}</p>

      {/* Сначала узнать имя (тратит заряд) — выбор "всем" появляется только
          ПОСЛЕ того, как детектив уже увидел автора. */}
      {canRevealSelf && (
        <Button
          variant="secondary"
          className="mt-3 w-full text-xs"
          disabled={submitting}
          onClick={() => handleReveal('self')}
        >
          {submitting ? 'Узнаём...' : 'Разоблачить (узнать автора)'}
        </Button>
      )}

      {canRevealAll && (
        <Button
          variant="danger"
          className="mt-3 w-full text-xs"
          disabled={submitting}
          onClick={() => handleReveal('all')}
        >
          {submitting ? 'Публикуем...' : 'Раскрыть всем'}
        </Button>
      )}
    </div>
  )
}
