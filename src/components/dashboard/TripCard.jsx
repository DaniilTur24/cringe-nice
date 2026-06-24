import Card from '../Card'
import Button from '../Button'

const STATUS_LABEL = {
  active: 'Активна',
  finished: 'Завершена',
  cancelled: 'Отменена',
}

export default function TripCard({ trip, onOpen, onRequestAction }) {
  const isActive = trip.status === 'active'

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
          <Button
            variant="secondary"
            className="col-span-2 px-3 sm:col-span-1"
            onClick={() => onRequestAction('finish', trip.id)}
          >
            Завершить поездку
          </Button>
        )}

        {isActive && !trip.isAdmin && (
          <Button
            variant="danger"
            className="col-span-2 px-3 sm:col-span-1"
            onClick={() => onRequestAction('leave', trip.id)}
          >
            Выйти
          </Button>
        )}

        {!isActive && trip.isAdmin && (
          <>
            <Button variant="primary" className="px-3" onClick={() => onRequestAction('restore', trip.id)}>
              Восстановить
            </Button>
            <Button variant="danger" className="px-3" onClick={() => onRequestAction('delete', trip.id)}>
              Удалить
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
