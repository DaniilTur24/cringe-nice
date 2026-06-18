import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useTripRole(tripId, userId) {
  const [roleMetadata, setRoleMetadata] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('trip_members')
        .select('role_metadata')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle()

      if (cancelled) return
      if (fetchError) {
        setError(fetchError)
      } else {
        setRoleMetadata(data?.role_metadata ?? {})
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tripId, userId])

  // Заряды перков (double_vote_count, super_verdict_remaining,
  // reveals_remaining...) меняются через RPC на сервере — нужна realtime
  // подписка, чтобы UI обновлялся без перезагрузки страницы.
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}-role-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trip_members',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          if (payload.new.user_id !== userId) return
          setRoleMetadata(payload.new.role_metadata ?? {})
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId, userId])

  return { roleMetadata, loading, error }
}
