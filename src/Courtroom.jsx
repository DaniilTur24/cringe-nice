import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import { useTripMembers } from './hooks/useTripMembers'
import BrandHeader from './components/BrandHeader'
import Card from './components/Card'
import VoteCard from './components/VoteCard'
import Toast from './components/Toast'
import VerdictPopup from './components/VerdictPopup'
import Leaderboard from './components/Leaderboard'
import CreateProposalButton from './components/CreateProposalButton'
import GameShell from './components/GameShell'

async function loadProposalDetails(proposalId) {
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, trip_id, creator_id, target_id, type, description, status, final_score, created_at,
       creator:profiles!proposals_creator_id_fkey(username),
       target:profiles!proposals_target_id_fkey(username)`
    )
    .eq('id', proposalId)
    .single()

  if (error) throw error

  return {
    ...data,
    creatorName: data.creator?.username ?? 'Неизвестный',
    targetName: data.target?.username ?? 'Неизвестный',
  }
}

function buildVerdictMessage(proposal, status, finalScore) {
  if (status === 'approved') {
    const points = finalScore ?? 0
    return proposal.type === 'fine'
      ? `Иск одобрен! ${proposal.targetName} получает ${points} баллов.`
      : `Награда одобрена! ${proposal.targetName} получает ${points} баллов.`
  }
  return proposal.type === 'fine'
    ? `Иск отклонён. ${proposal.targetName} оправдан(а)!`
    : `Награда отклонена.`
}

export default function Courtroom({ tripId, userId }) {
  const [loading, setLoading] = useState(true)
  const [activeProposal, setActiveProposal] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [resultPopup, setResultPopup] = useState(null)
  const [toast, setToast] = useState(null)
  const [dismissedMembersError, setDismissedMembersError] = useState(null)
  const { members, error: membersError } = useTripMembers(tripId)

  // membersError comes from a hook value, not a user action, so it's folded
  // into the toast at render time instead of synced via setState-in-effect.
  const displayedToast =
    toast ?? (membersError && membersError !== dismissedMembersError
      ? { type: 'error', message: membersError.message }
      : null)

  function dismissToast() {
    if (toast) {
      setToast(null)
      return
    }
    if (membersError) setDismissedMembersError(membersError)
  }

  const activeProposalRef = useRef(null)
  useEffect(() => {
    activeProposalRef.current = activeProposal
  }, [activeProposal])

  // Initial load: find the trip's pending proposal (if any) and whether the
  // current user already voted on it.
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      try {
        const { data: pending, error } = await supabase
          .from('proposals')
          .select('id')
          .eq('trip_id', tripId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (error) throw error

        if (pending) {
          const details = await loadProposalDetails(pending.id)
          if (cancelled) return
          setActiveProposal(details)

          const { data: ownVote, error: voteError } = await supabase
            .from('votes')
            .select('id')
            .eq('proposal_id', pending.id)
            .eq('voter_id', userId)
            .maybeSingle()
          if (voteError) throw voteError
          if (cancelled) return
          setHasVoted(Boolean(ownVote))
        }
      } catch (err) {
        if (!cancelled) setToast({ type: 'error', message: err.message })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [tripId, userId])

  // Realtime: new proposals pop the vote card up for everyone; status flips
  // to approved/rejected (done by the DB trigger once voting closes) clear
  // the card and show the verdict.
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}-proposals`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proposals',
          filter: `trip_id=eq.${tripId}`,
        },
        async (payload) => {
          if (payload.new.status !== 'pending') return
          try {
            const details = await loadProposalDetails(payload.new.id)
            setActiveProposal(details)
            setHasVoted(false)
          } catch (err) {
            setToast({ type: 'error', message: err.message })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposals',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const current = activeProposalRef.current
          if (!current || current.id !== payload.new.id || payload.new.status === 'pending') {
            return
          }
          setResultPopup({
            message: buildVerdictMessage(current, payload.new.status, payload.new.final_score),
          })
          setActiveProposal(null)
          setHasVoted(false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId])

  async function handleSubmitVote(score) {
    if (!activeProposal) return { error: new Error('Нет активного предложения') }

    const { error } = await supabase
      .from('votes')
      .insert([{ proposal_id: activeProposal.id, voter_id: userId, score }])

    if (error) {
      setToast({ type: 'error', message: error.message })
      return { error }
    }

    setHasVoted(true)
    return { error: null }
  }

  const isSpectator = Boolean(
    activeProposal &&
      (activeProposal.creator_id === userId || activeProposal.target_id === userId)
  )

  const proposalForCard = activeProposal && {
    type: activeProposal.type,
    description: activeProposal.description,
    title:
      activeProposal.type === 'fine'
        ? `Жалоба на ${activeProposal.targetName}`
        : `Награда для ${activeProposal.targetName}`,
  }

  return (
    <GameShell>
      <div className="flex flex-1 flex-col gap-6 pb-24">
        <BrandHeader kicker="Live from the trip" />

        <Toast toast={displayedToast} onDismiss={dismissToast} />

        <AnimatePresence>
          {resultPopup && (
            <VerdictPopup verdict={resultPopup} onClose={() => setResultPopup(null)} />
          )}
        </AnimatePresence>

        {loading && (
          <Card className="text-center">
            <span className="panel-label">Loading</span>
            <p className="mt-4 font-black">Зажигаем табло суда...</p>
          </Card>
        )}

        {!loading && !activeProposal && (
          <Card className="text-center">
            <span className="panel-label">Quiet round</span>
            <p className="mt-4 text-xl font-black">Сейчас никто не под судом.</p>
            <p className="mt-2 text-sm font-bold text-ink/65">Ожидаем новый иск или награду.</p>
          </Card>
        )}

        {!loading && activeProposal && isSpectator && (
          <Card className="text-center">
            <span className="panel-label">On stage</span>
            <p className="mt-4 text-xl font-black">Идет разбирательство по твоему делу.</p>
            <p className="mt-2 text-sm font-bold text-ink/65">Голосуют без тебя, жди вердикта.</p>
          </Card>
        )}

        {!loading && activeProposal && !isSpectator && hasVoted && (
          <Card className="text-center">
            <span className="panel-label">Vote locked</span>
            <p className="mt-4 text-xl font-black">Ты уже проголосовал.</p>
            <p className="mt-2 text-sm font-bold text-ink/65">Ждем остальных игроков.</p>
          </Card>
        )}

        {!loading && activeProposal && !isSpectator && !hasVoted && (
          <VoteCard key={activeProposal.id} proposal={proposalForCard} onSubmit={handleSubmitVote} />
        )}

        <Leaderboard members={members} />
      </div>

      <CreateProposalButton tripId={tripId} userId={userId} members={members} />
    </GameShell>
  )
}
