import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import Courtroom from './Courtroom'
import BrandHeader from './components/BrandHeader'
import Card from './components/Card'
import GameShell from './components/GameShell'
import Toast from './components/Toast'
import CreateTripScreen from './components/onboarding/CreateTripScreen'
import InviteLinkScreen from './components/onboarding/InviteLinkScreen'
import JoinScreen from './components/onboarding/JoinScreen'
import ManifestScreen from './components/onboarding/ManifestScreen'

const ADMIN_AVATAR = 'ADM'

// signInAnonymously() creates a brand new auth.users row every time it's
// called — reusing an existing session (e.g. an admin opening their own
// invite link, or a member joining a second trip) avoids orphaning users.
async function ensureAnonymousSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

async function findUserTripId(userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.trip_id ?? null
}

async function isTripMember(tripId, userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

const screenMotion = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -600 },
  transition: { duration: 0.4, ease: 'easeIn' },
}

export default function Onboarding() {
  // 'loading' | 'create-trip' | 'invite-link' | 'join' | 'manifest' | 'ready'
  const [step, setStep] = useState('loading')
  const [tripId, setTripId] = useState(null)
  const [userId, setUserId] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const tripIdFromUrl = new URLSearchParams(window.location.search).get('trip_id')
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          const candidateTripId = tripIdFromUrl ?? (await findUserTripId(session.user.id))
          if (candidateTripId && (await isTripMember(candidateTripId, session.user.id))) {
            if (cancelled) return
            if (!tripIdFromUrl) {
              window.history.replaceState(null, '', `?trip_id=${candidateTripId}`)
            }
            setTripId(candidateTripId)
            setUserId(session.user.id)
            setStep('ready')
            return
          }
        }

        if (cancelled) return
        if (tripIdFromUrl) {
          setTripId(tripIdFromUrl)
          setStep('join')
        } else {
          setStep('create-trip')
        }
      } catch (err) {
        if (!cancelled) {
          setToast({ type: 'error', message: err.message })
          setStep('create-trip')
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreateTrip(tripName, adminName) {
    try {
      const user = await ensureAnonymousSession()

      // upsert, not insert: ensureAnonymousSession() can return a session
      // left over from an earlier attempt (e.g. trip insert failed after
      // the profile already succeeded) — a plain insert would 409 on retry.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([{ id: user.id, username: adminName, avatar_url: ADMIN_AVATAR }])
      if (profileError) throw profileError

      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert([{ name: tripName, admin_id: user.id, settings: {} }])
        .select()
        .single()
      if (tripError) throw tripError

      const { error: memberError } = await supabase
        .from('trip_members')
        .upsert([{ trip_id: trip.id, user_id: user.id }], { onConflict: 'trip_id,user_id' })
      if (memberError) throw memberError

      window.history.replaceState(null, '', `?trip_id=${trip.id}`)
      setTripId(trip.id)
      setUserId(user.id)
      setStep('invite-link')
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    }
  }

  async function handleJoin(username, avatar) {
    try {
      const user = await ensureAnonymousSession()

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([{ id: user.id, username, avatar_url: avatar }])
      if (profileError) throw profileError

      const { error: memberError } = await supabase
        .from('trip_members')
        .upsert([{ trip_id: tripId, user_id: user.id }], { onConflict: 'trip_id,user_id' })
      if (memberError) throw memberError

      setUserId(user.id)
      setStep('manifest')
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    }
  }

  if (step === 'ready') {
    return <Courtroom tripId={tripId} userId={userId} />
  }

  const inviteUrl = tripId
    ? `${window.location.origin}${window.location.pathname}?trip_id=${tripId}`
    : ''

  return (
    <GameShell>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <BrandHeader />

        <Toast toast={toast} onDismiss={() => setToast(null)} />

        <AnimatePresence mode="wait">
          {step === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="text-center">
                <span className="panel-label">Connexion</span>
                <p className="mt-4 font-black">Поднимаем сцену...</p>
              </Card>
            </motion.div>
          )}

          {step === 'create-trip' && (
            <motion.div key="create-trip" {...screenMotion}>
              <CreateTripScreen onCreate={handleCreateTrip} />
            </motion.div>
          )}

          {step === 'invite-link' && (
            <motion.div key="invite-link" {...screenMotion}>
              <InviteLinkScreen inviteUrl={inviteUrl} onContinue={() => setStep('ready')} />
            </motion.div>
          )}

          {step === 'join' && (
            <motion.div key="join" {...screenMotion}>
              <JoinScreen onJoin={handleJoin} />
            </motion.div>
          )}

          {step === 'manifest' && (
            <motion.div
              key="manifest"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <ManifestScreen onReady={() => setStep('ready')} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameShell>
  )
}
