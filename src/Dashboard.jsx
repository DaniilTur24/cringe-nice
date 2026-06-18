import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import BrandHeader from './components/BrandHeader'
import Card from './components/Card'
import Button from './components/Button'
import GameShell from './components/GameShell'
import Toast from './components/Toast'
import TripCard from './components/dashboard/TripCard'

async function fetchUserTrips(userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('total_points, trips(id, name, status, admin_id)')
    .eq('user_id', userId)
  if (error) throw error

  return (data ?? [])
    .filter((row) => row.trips)
    .map((row) => ({
      id: row.trips.id,
      name: row.trips.name,
      status: row.trips.status,
      isAdmin: row.trips.admin_id === userId,
      total_points: row.total_points,
    }))
}

export default function Dashboard({ userId, onCreateTrip, onOpenTrip }) {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  async function reload() {
    try {
      setTrips(await fetchUserTrips(userId))
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  // Mount-time load uses a locally-defined async function (not the shared
  // `reload` above) so a late response after unmount doesn't setState.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const list = await fetchUserTrips(userId)
        if (!cancelled) setTrips(list)
      } catch (err) {
        if (!cancelled) setToast({ type: 'error', message: err.message })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function handleLeave(tripId) {
    const { error } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId)
    if (error) {
      setToast({ type: 'error', message: error.message })
      return
    }
    await reload()
  }

  async function handleSetStatus(tripId, status) {
    const { error } = await supabase.from('trips').update({ status }).eq('id', tripId)
    if (error) {
      setToast({ type: 'error', message: error.message })
      return
    }
    await reload()
  }

  async function handleDelete(tripId) {
    const { error } = await supabase.from('trips').delete().eq('id', tripId)
    if (error) {
      setToast({ type: 'error', message: error.message })
      return
    }
    await reload()
  }

  const activeTrips = trips.filter((trip) => trip.status === 'active')
  const closedTrips = trips.filter((trip) => trip.status !== 'active')

  return (
    <GameShell>
      <div className="flex flex-1 flex-col gap-6 pb-10">
        <BrandHeader kicker="Твои поездки" />

        <Toast toast={toast} onDismiss={() => setToast(null)} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col gap-4"
        >
          {loading && (
            <Card className="text-center">
              <p className="font-bold">Загружаем твои поездки...</p>
            </Card>
          )}

          {!loading && trips.length === 0 && (
            <Card className="text-center">
              <p className="font-bold">Пока нет ни одной поездки.</p>
              <p className="mt-2 text-sm text-gray-600">
                Создай свою или перейди по ссылке-приглашению от друга.
              </p>
            </Card>
          )}

          {activeTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onOpen={onOpenTrip}
              onLeave={handleLeave}
              onFinish={(id) => handleSetStatus(id, 'finished')}
              onCancel={(id) => handleSetStatus(id, 'cancelled')}
            />
          ))}

          {closedTrips.length > 0 && (
            <div className="flex flex-col gap-4">
              <span className="panel-label self-start">Завершённые</span>
              {closedTrips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onOpen={onOpenTrip}
                  onRestore={(id) => handleSetStatus(id, 'active')}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={onCreateTrip}>
            + Создать поездку
          </Button>
        </motion.div>
      </div>
    </GameShell>
  )
}
