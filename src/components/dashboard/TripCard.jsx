import { useState } from 'react'
import Card from '../Card'
import Button from '../Button'
import ConfirmDialog from './ConfirmDialog'

const STATUS_LABEL = {
  active: 'Активна',
  finished: 'Завершена',
  cancelled: 'Отменена',
}

const DIALOG_CONTENT = {
  leave: {
    title: 'Выйти из поездки?',
    description: 'Снова попасть в неё можно будет только по новой ссылке-приглашению.',
    confirmLabel: 'Выйти',
    variant: 'danger',
  },
  finish: {
    title: 'Завершить поездку?',
    description: 'Активное голосование (если есть) будет автоматически отклонено. Поездку можно будет только просматривать.',
    confirmLabel: 'Завершить',
    variant: 'primary',
  },
  cancel: {
    title: 'Отменить поездку?',
    description: 'Активное голосование (если есть) будет автоматически отклонено. Поездку можно будет только просматривать.',
    confirmLabel: 'Отменить',
    variant: 'danger',
  },
  restore: {
    title: 'Восстановить поездку?',
    description: 'Поездка снова станет активной — можно будет создавать иски и награды.',
    confirmLabel: 'Восстановить',
    variant: 'primary',
  },
  delete: {
    title: 'Удалить поездку навсегда?',
    description: 'Это удалит поездку, всех участников и всю историю исков/наград без возможности восстановления.',
    confirmLabel: 'Удалить',
    variant: 'danger',
  },
}

export default function TripCard({ trip, onOpen, onLeave, onFinish, onCancel, onRestore, onDelete }) {
  const [pendingAction, setPendingAction] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const isActive = trip.status === 'active'

  async function handleConfirm() {
    setSubmitting(true)
    if (pendingAction === 'leave') await onLeave?.(trip.id)
    if (pendingAction === 'finish') await onFinish?.(trip.id)
    if (pendingAction === 'cancel') await onCancel?.(trip.id)
    if (pendingAction === 'restore') await onRestore?.(trip.id)
    if (pendingAction === 'delete') await onDelete?.(trip.id)
    setSubmitting(false)
    setPendingAction(null)
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">{trip.name}</p>
          <span className="panel-label mt-2">{STATUS_LABEL[trip.status]}</span>
        </div>
        <span className="points-chip shrink-0">{trip.total_points}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="primary" className="col-span-2 px-3 sm:col-span-1" onClick={() => onOpen(trip.id)}>
          Открыть
        </Button>

        {isActive && trip.isAdmin && (
          <>
            <Button variant="secondary" className="px-3" onClick={() => setPendingAction('finish')}>
              Завершить
            </Button>
            <Button variant="danger" className="px-3" onClick={() => setPendingAction('cancel')}>
              Отменить
            </Button>
          </>
        )}

        {isActive && !trip.isAdmin && (
          <Button variant="danger" className="col-span-2 px-3 sm:col-span-1" onClick={() => setPendingAction('leave')}>
            Выйти
          </Button>
        )}

        {!isActive && trip.isAdmin && (
          <>
            <Button variant="primary" className="px-3" onClick={() => setPendingAction('restore')}>
              Восстановить
            </Button>
            <Button variant="danger" className="px-3" onClick={() => setPendingAction('delete')}>
              Удалить
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        submitting={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setPendingAction(null)}
        {...(pendingAction ? DIALOG_CONTENT[pendingAction] : {})}
      />
    </Card>
  )
}
