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
  const score = proposal.final_score ?? 0
  const scoreClass = score > 0 ? 'score-chip--positive' : score < 0 ? 'score-chip--negative' : ''

  async function handleReveal(scope) {
    setSubmitting(true)
    await onReveal(scope)
    setSubmitting(false)
  }

  return (
    <div className="case-card pl-5">
      <div className="flex items-start justify-between gap-3">
        <span className="case-meta mt-0.5">
          {TYPE_LABEL[proposal.type]} · {STATUS_LABEL[proposal.status]}
        </span>
        {proposal.status === 'approved' && proposal.final_score != null && (
          <span className={`score-chip shrink-0 ${scoreClass}`}>
            {score > 0 ? `+${score}` : score}
          </span>
        )}
      </div>
      <p className="mt-3 text-[1.05rem] font-black leading-snug text-ink">
        {proposal.type === 'fine' ? 'Жалоба на' : 'Награда для'} {proposal.targetName}
      </p>
      <p className="mt-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink/55">
        Автор: <span className="text-ink/70">{creatorName}</span>
      </p>

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
