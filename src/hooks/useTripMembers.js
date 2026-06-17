import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function sortByPoints(list) {
  return [...list].sort((a, b) => b.total_points - a.total_points)
}

export function useTripMembers(tripId) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('trip_members')
        .select('profiles(id, username, avatar_url, total_points)')
        .eq('trip_id', tripId)

      if (!cancelled && !error) {
        const list = (data ?? []).map((row) => row.profiles).filter(Boolean)
        setMembers(sortByPoints(list))
      }
      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tripId])

  // total_points changes whenever the close_proposal_if_complete trigger
  // settles a vote; new trip_members rows show up as friends join via the
  // invite link while this screen is already open.
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}-members`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          setMembers((prev) => {
            const idx = prev.findIndex((m) => m.id === payload.new.id)
            if (idx === -1) return prev
            const updated = [...prev]
            updated[idx] = { ...updated[idx], total_points: payload.new.total_points }
            return sortByPoints(updated)
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_members',
          filter: `trip_id=eq.${tripId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, total_points')
            .eq('id', payload.new.user_id)
            .maybeSingle()
          if (!data) return
          setMembers((prev) => {
            if (prev.some((m) => m.id === data.id)) return prev
            return sortByPoints([...prev, data])
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId])

  return { members, loading }
}
