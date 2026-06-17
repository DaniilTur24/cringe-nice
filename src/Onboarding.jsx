import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import Courtroom from './Courtroom'
import Card from './components/Card'
import Toast from './components/Toast'
import EmailScreen from './components/onboarding/EmailScreen'
import OtpScreen from './components/onboarding/OtpScreen'
import CreateTripScreen from './components/onboarding/CreateTripScreen'
import InviteLinkScreen from './components/onboarding/InviteLinkScreen'
import JoinScreen from './components/onboarding/JoinScreen'
import ManifestScreen from './components/onboarding/ManifestScreen'

const ADMIN_AVATAR = '👑'

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
  // 'loading' | 'email' | 'otp' | 'create-trip' | 'invite-link' | 'join' | 'manifest' | 'ready'
  const [step, setStep] = useState('loading')
  const [tripId, setTripId] = useState(null)
  const [userId, setUserId] = useState(null)
  const [email, setEmail] = useState('')
  const [toast, setToast] = useState(null)

  // Resume an existing trip if the now-authenticated user already belongs
  // to one, otherwise route to create or join depending on whether the
  // invite link carried a trip_id.
  async function routeAuthenticatedUser(user, tripIdFromUrl) {
    const candidateTripId = tripIdFromUrl ?? (await findUserTripId(user.id))
    if (candidateTripId && (await isTripMember(candidateTripId, user.id))) {
      if (!tripIdFromUrl) {
        window.history.replaceState(null, '', `?trip_id=${candidateTripId}`)
      }
      setTripId(candidateTripId)
      setUserId(user.id)
      setStep('ready')
      return
    }

    setUserId(user.id)
    if (tripIdFromUrl) {
      setTripId(tripIdFromUrl)
      setStep('join')
    } else {
      setStep('create-trip')
    }
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const tripIdFromUrl = new URLSearchParams(window.location.search).get('trip_id')
        // getUser() round-trips to the server, unlike getSession() which only
        // reads the cached token — that matters if auth.users was ever reset
        // (e.g. a schema reload) while a stale session sat in localStorage.
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return

        if (user) {
          await routeAuthenticatedUser(user, tripIdFromUrl)
        } else {
          setStep('email')
        }
      } catch (err) {
        if (!cancelled) {
          setToast({ type: 'error', message: err.message })
          setStep('email')
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleEmailSubmit(submittedEmail) {
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: submittedEmail })
      if (error) throw error
      setEmail(submittedEmail)
      setStep('otp')
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    }
  }

  async function handleOtpSubmit(code) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw error
      const tripIdFromUrl = new URLSearchParams(window.location.search).get('trip_id')
      await routeAuthenticatedUser(data.user, tripIdFromUrl)
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    }
  }

  async function handleResendOtp() {
    try {
      const { error } = await supabase.auth.signInWithOtp({ email })
      if (error) throw error
      setToast({ type: 'info', message: 'Код отправлен повторно.' })
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    }
  }

  async function handleCreateTrip(tripName, adminName) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Сессия истекла, войди заново.')

      // upsert, not insert: a retry after a failed trip/member insert would
      // otherwise 409 on a profile that already exists from the first try.
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Сессия истекла, войди заново.')

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
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-center text-3xl font-extrabold tracking-tight">Le Grand Суд</h1>

        <Toast toast={toast} onDismiss={() => setToast(null)} />

        <AnimatePresence mode="wait">
          {step === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="text-center">
                <p className="font-bold">Загрузка...</p>
              </Card>
            </motion.div>
          )}

          {step === 'email' && (
            <motion.div key="email" {...screenMotion}>
              <EmailScreen onSubmit={handleEmailSubmit} />
            </motion.div>
          )}

          {step === 'otp' && (
            <motion.div key="otp" {...screenMotion}>
              <OtpScreen
                email={email}
                onSubmit={handleOtpSubmit}
                onResend={handleResendOtp}
                onBack={() => setStep('email')}
              />
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
    </div>
  )
}
