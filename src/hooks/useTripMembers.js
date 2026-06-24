import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function sortByPoints(list) {
  return [...list].sort((a, b) => b.total_points - a.total_points)
}

function toMember(row) {
  if (!row.profiles) return null
  return {
    id: row.profiles.id,
    // trip_members.nickname/avatar_url is an optional per-trip override of
    // the official profile name — falls back to the profile when unset.
    username: row.nickname ?? row.profiles.username,
    avatar_url: row.avatar_url ?? row.profiles.avatar_url,
    total_points: row.total_points,
  }
}

export function useTripMembers(tripId) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('trip_members')
        .select('total_points, nickname, avatar_url, profiles(id, username, avatar_url)')
        .eq('trip_id', tripId)

      if (cancelled) return
      if (fetchError) {
        setError(fetchError)
      } else {
        const list = (data ?? []).map(toMember).filter(Boolean)
        setMembers(sortByPoints(list))
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tripId])

  // total_points now lives on trip_members (one counter per trip, not one
  // global counter per user), so the realtime score updates are scoped to
  // this trip's rows instead of listening on profiles.
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}-members`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trip_members',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          setMembers((prev) => {
            const idx = prev.findIndex((m) => m.id === payload.new.user_id)
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
          const { data, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', payload.new.user_id)
            .maybeSingle()
          if (profileError) {
            setError(profileError)
            return
          }
          if (!data) return
          setMembers((prev) => {
            if (prev.some((m) => m.id === data.id)) return prev
            return sortByPoints([
              ...prev,
              {
                id: data.id,
                username: payload.new.nickname ?? data.username,
                avatar_url: payload.new.avatar_url ?? data.avatar_url,
                total_points: payload.new.total_points,
              },
            ])
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId])

  return { members, loading, error }
}
