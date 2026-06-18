import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import Courtroom from './Courtroom'
import Dashboard from './Dashboard'
import BrandHeader from './components/BrandHeader'
import Card from './components/Card'
import GameShell from './components/GameShell'
import Toast from './components/Toast'
import EmailScreen from './components/onboarding/EmailScreen'
import OtpScreen from './components/onboarding/OtpScreen'
import CreateTripScreen from './components/onboarding/CreateTripScreen'
import InviteLinkScreen from './components/onboarding/InviteLinkScreen'
import JoinScreen from './components/onboarding/JoinScreen'
import ManifestScreen from './components/onboarding/ManifestScreen'

const ADMIN_AVATAR = 'ADM'

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
  // 'loading' | 'email' | 'otp' | 'dashboard' | 'create-trip' | 'invite-link' | 'join' | 'manifest' | 'ready'
  const [step, setStep] = useState('loading')
  const [tripId, setTripId] = useState(null)
  const [tripStatus, setTripStatus] = useState('active')
  const [userId, setUserId] = useState(null)
  const [email, setEmail] = useState('')
  const [toast, setToast] = useState(null)

  // Enters a specific trip's Courtroom, picking up its current status so a
  // finished/cancelled trip renders read-only instead of assuming 'active'.
  async function enterTrip(id) {
    try {
      const { data, error } = await supabase.from('trips').select('status').eq('id', id).single()
      if (error) throw error
      setTripStatus(data.status)
    } catch {
      setTripStatus('active')
    }
    setTripId(id)
    setStep('ready')
  }

  // A trip_id in the URL is a deliberate invite link — resolve it straight
  // into that trip (or the join screen). With no trip_id, land on the
  // dashboard instead of guessing "the" trip, since a user can belong to
  // several at once.
  async function routeAuthenticatedUser(user, tripIdFromUrl) {
    setUserId(user.id)

    if (tripIdFromUrl) {
      if (await isTripMember(tripIdFromUrl, user.id)) {
        await enterTrip(tripIdFromUrl)
      } else {
        setTripId(tripIdFromUrl)
        setStep('join')
      }
      return
    }

    setStep('dashboard')
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

  if (step === 'dashboard') {
    return (
      <Dashboard
        userId={userId}
        onCreateTrip={() => setStep('create-trip')}
        onOpenTrip={(id) => enterTrip(id)}
      />
    )
  }

  if (step === 'ready') {
    return (
      <Courtroom
        tripId={tripId}
        userId={userId}
        tripStatus={tripStatus}
        onExit={() => setStep('dashboard')}
      />
    )
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
              <button
                type="button"
                onClick={() => setStep('dashboard')}
                className="mb-3 text-sm font-bold text-ink/70 underline"
              >
                ← Назад
              </button>
              <CreateTripScreen onCreate={handleCreateTrip} />
            </motion.div>
          )}

          {step === 'invite-link' && (
            <motion.div key="invite-link" {...screenMotion}>
              <InviteLinkScreen inviteUrl={inviteUrl} onContinue={() => enterTrip(tripId)} />
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
              <ManifestScreen onReady={() => enterTrip(tripId)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameShell>
  )
}
