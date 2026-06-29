import { useState } from 'react'
import Button from './Button'

const STATUS_LABEL = {
  approved: 'Одобрено',
  rejected: 'Отклонено',
}

function docketTitle(proposal) {
  const number = proposal.docket_number ?? '?'
  return proposal.type === 'fine' ? `Уголовное дело №${number}` : `Акт святости №${number}`
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function voteSummary(votes = []) {
  return votes.reduce(
    (summary, vote) => {
      if (vote.score === 0) return { ...summary, against: summary.against + 1 }
      return { ...summary, for: summary.for + 1 }
    },
    { for: 0, against: 0 }
  )
}

export default function HistoryCard({ proposal, creatorName, canRevealSelf, canRevealAll, onReveal }) {
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const score = proposal.final_score ?? 0
  const scoreClass = score > 0 ? 'score-chip--positive' : score < 0 ? 'score-chip--negative' : ''
  const votes = voteSummary(proposal.votes)
  const isLongDescription = proposal.description.length > 150
  const formattedDate = dateFormatter.format(new Date(proposal.created_at))

  async function handleReveal(scope) {
    setSubmitting(true)
    await onReveal(scope)
    setSubmitting(false)
  }

  return (
    <div className="case-card pl-5">
      <div className="flex items-start justify-between gap-3">
        <span className="case-meta mt-0.5">
          {docketTitle(proposal)} · {STATUS_LABEL[proposal.status]}
        </span>
        <span className={`score-chip shrink-0 ${scoreClass}`}>
          {score > 0 ? `+${score}` : score}
        </span>
      </div>

      <p className="mt-3 text-[1.05rem] font-black leading-snug text-ink">
        {proposal.type === 'fine' ? 'Жалоба на' : 'Награда для'} {proposal.targetName}
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 text-xs font-extrabold uppercase tracking-[0.06em] text-ink/60 sm:grid-cols-2">
        <span>Создано: <strong className="text-ink/75">{formattedDate}</strong></span>
        <span>За: <strong className="text-ink/75">{votes.for}</strong> · Против: <strong className="text-ink/75">{votes.against}</strong></span>
      </div>

      <p className="mt-1.5 text-xs font-extrabold uppercase tracking-[0.06em] text-ink/55">
        Автор: <span className="text-ink/70">{creatorName}</span>
      </p>

      <div className="mt-3 rounded-[0.9rem] border-2 border-ink bg-white/75 p-3">
        <p className={`text-sm font-bold leading-relaxed text-ink/72 ${expanded ? '' : 'max-h-20 overflow-hidden'}`}>
          {proposal.description}
        </p>
        {isLongDescription && (
          <button
            type="button"
            className="mt-2 text-xs font-black uppercase text-french-blue underline decoration-2 underline-offset-2"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Свернуть' : 'Подробнее'}
          </button>
        )}
      </div>

      {canRevealSelf && (
        <Button
          variant="secondary"
          className="mt-3 w-full text-xs"
          disabled={submitting}
          onClick={() => handleReveal('self')}
        >
          {submitting ? 'Узнаем...' : 'Разоблачить (узнать автора)'}
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
