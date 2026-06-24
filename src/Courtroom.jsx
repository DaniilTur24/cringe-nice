import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from './lib/supabaseClient'
import { useTripMembers } from './hooks/useTripMembers'
import { useTripRole } from './hooks/useTripRole'
import BrandHeader from './components/BrandHeader'
import Card from './components/Card'
import VoteCard from './components/VoteCard'
import Toast from './components/Toast'
import VerdictPopup from './components/VerdictPopup'
import Leaderboard from './components/Leaderboard'
import RoleBadge from './components/RoleBadge'
import ProposalHistory from './components/ProposalHistory'
import CreateProposalButton from './components/CreateProposalButton'
import GameShell from './components/GameShell'

async function loadProposalDetails(proposalId) {
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, trip_id, creator_id, target_id, type, description, status, final_score, created_at,
       creator_role, creator_revealed_to_all,
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

function buildVerdictMessage(proposal, status, finalScore, judgeOverrideScore) {
  const isGhostFine = proposal.type === 'fine' && proposal.creator_role === 'ghost'

  if (status === 'approved') {
    const points = finalScore ?? 0
    let message = proposal.type === 'fine'
      ? `Иск одобрен! ${proposal.targetName} получает ${points} баллов.`
      : `Награда одобрена! ${proposal.targetName} получает ${points} баллов.`
    if (isGhostFine) {
      message += ' Автор — Призрак, эта жалоба не попадёт в архив дел.'
    }
    if (judgeOverrideScore != null) {
      message += ` Верховный Судья превысил полномочия и поставил оценку ${judgeOverrideScore}!`
    }
    return message
  }
  if (isGhostFine) {
    // Призрак ни штрафа не платит, ни раскрытия не получает — даже в попапе.
    return `Иск отклонён. ${proposal.targetName} оправдан(а)! Автор — Призрак: имя не раскрывается, баллы не списываются.`
  }
  return proposal.type === 'fine'
    ? `Иск отклонён. ${proposal.targetName} оправдан(а)! У ябеды ${proposal.creatorName} забрали 1 балл.`
    : `Награда отклонена.`
}

async function loadJudgeOverrideScore(proposalId) {
  const { data, error } = await supabase
    .from('votes')
    .select('score')
    .eq('proposal_id', proposalId)
    .or('score.gt.10,score.lt.-10')
    .maybeSingle()

  if (error) throw error
  return data?.score ?? null
}

function proposalCardContent(proposal) {
  return {
    type: proposal.type,
    description: proposal.description,
    title:
      proposal.type === 'fine'
        ? `Жалоба на ${proposal.targetName}`
        : `Награда для ${proposal.targetName}`,
  }
}

export default function Courtroom({ tripId, userId, tripStatus = 'active', onExit }) {
  const [loading, setLoading] = useState(true)
  // Every still-open proposal stays in this list at once, so two complaints
  // or rewards filed back to back both stay visible instead of the newer
  // one replacing the older.
  const [proposals, setProposals] = useState([])
  const [verdictQueue, setVerdictQueue] = useState([])
  const [toast, setToast] = useState(null)
  const [dismissedMembersError, setDismissedMembersError] = useState(null)
  const { members, error: membersError } = useTripMembers(tripId)
  const { roleMetadata } = useTripRole(tripId, userId)

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

  const proposalsRef = useRef([])
  useEffect(() => {
    proposalsRef.current = proposals
  }, [proposals])

  // Initial load: every pending proposal for this trip, plus which of them
  // the current user already voted on.
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
        if (error) throw error

        const detailsList = await Promise.all((pending ?? []).map((p) => loadProposalDetails(p.id)))
        if (cancelled) return

        let votedIds = new Set()
        if (detailsList.length > 0) {
          const { data: ownVotes, error: voteError } = await supabase
            .from('votes')
            .select('proposal_id')
            .in('proposal_id', detailsList.map((d) => d.id))
            .eq('voter_id', userId)
          if (voteError) throw voteError
          if (cancelled) return
          votedIds = new Set((ownVotes ?? []).map((v) => v.proposal_id))
        }

        setProposals(detailsList.map((d) => ({ ...d, hasVoted: votedIds.has(d.id) })))
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

  // Realtime: new proposals are appended for everyone; status flips to
  // approved/rejected (done by the DB trigger once voting closes) drop that
  // proposal from the list and queue its verdict.
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
            setProposals((prev) => [...prev, { ...details, hasVoted: false }])
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
          // Детектив раскрыл автора "всем" — это отдельное от смены статуса
          // обновление строки (флаг creator_revealed_to_all меняется только
          // один раз в жизни предложения), так что проверяем его независимо
          // от ветки с вердиктом ниже.
          if (payload.new.creator_revealed_to_all) {
            loadProposalDetails(payload.new.id)
              .then((details) => {
                setVerdictQueue((prev) => [
                  ...prev,
                  {
                    message: `Детектив раскрыл автора жалобы на ${details.targetName} — это ${details.creatorName}!`,
                  },
                ])
              })
              .catch(() => {})
          }

          if (payload.new.status === 'pending') return
          const current = proposalsRef.current.find((p) => p.id === payload.new.id)
          if (!current) return

          // Заряд Судьи бьёт по итоговому баллу только если дело одобрено —
          // при отклонении его экстремальный голос ни на что не повлиял, и
          // упоминать "превышение полномочий" в этом случае не за что.
          const overridePromise =
            payload.new.status === 'approved'
              ? loadJudgeOverrideScore(payload.new.id).catch(() => null)
              : Promise.resolve(null)

          overridePromise.then((judgeOverrideScore) => {
            setVerdictQueue((prev) => [
              ...prev,
              {
                message: buildVerdictMessage(
                  current,
                  payload.new.status,
                  payload.new.final_score,
                  judgeOverrideScore
                ),
              },
            ])
          })
          setProposals((prev) => prev.filter((p) => p.id !== payload.new.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId])

  async function handleSubmitVote(proposalId, score, weight = 1) {
    const { error } = await supabase
      .from('votes')
      .insert([{ proposal_id: proposalId, voter_id: userId, score, weight }])

    if (error) {
      setToast({ type: 'error', message: error.message })
      return { error }
    }

    setProposals((prev) => prev.map((p) => (p.id === proposalId ? { ...p, hasVoted: true } : p)))
    return { error: null }
  }

  return (
    <GameShell>
      <div className="flex flex-1 flex-col gap-6 pb-24">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="self-start rounded-full border-[3px] border-ink bg-gold px-4 py-2 text-sm font-black uppercase leading-tight text-ink shadow-neo-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
          >
            ← К поездкам
          </button>
        )}

        <BrandHeader kicker="Live from the trip" />

        <RoleBadge roleMetadata={roleMetadata} />

        <Toast toast={displayedToast} onDismiss={dismissToast} />

        <AnimatePresence>
          {verdictQueue[0] && (
            <VerdictPopup
              verdict={verdictQueue[0]}
              onClose={() => setVerdictQueue((prev) => prev.slice(1))}
            />
          )}
        </AnimatePresence>

        {tripStatus !== 'active' && (
          <Card className="text-center">
            <span className="panel-label">{tripStatus === 'finished' ? 'Завершена' : 'Отменена'}</span>
            <p className="mt-4 font-black">Поездка закрыта — только просмотр.</p>
          </Card>
        )}

        {loading && (
          <Card className="text-center">
            <span className="panel-label">Loading</span>
            <p className="mt-4 font-black">Зажигаем табло суда...</p>
          </Card>
        )}

        {!loading && proposals.length === 0 && (
          <Card className="text-center">
            <span className="panel-label">Quiet round</span>
            <p className="mt-4 text-xl font-black">Сейчас никто не под судом.</p>
            <p className="mt-2 text-sm font-bold text-ink/65">Ожидаем новый иск или награду.</p>
          </Card>
        )}

        {!loading &&
          proposals.map((proposal) => {
            const isSpectator = proposal.creator_id === userId || proposal.target_id === userId
            const proposalForCard = proposalCardContent(proposal)

            if (isSpectator) {
              return (
                <Card key={proposal.id} className="text-center">
                  <span className="panel-label">On stage</span>
                  <h2 className="mt-4 text-2xl font-black leading-tight">{proposalForCard.title}</h2>
                  <p className="mt-3 rounded-[1rem] border-2 border-ink bg-white/75 p-4 text-sm font-bold text-ink/70">
                    {proposalForCard.description}
                  </p>
                  <p className="mt-4 text-sm font-bold text-ink/65">Голосуют без тебя, жди вердикта.</p>
                </Card>
              )
            }

            if (proposal.hasVoted) {
              return (
                <Card key={proposal.id} className="text-center">
                  <span className="panel-label">Vote locked</span>
                  <p className="mt-4 text-xl font-black">Ты уже проголосовал.</p>
                  <p className="mt-2 text-sm font-bold text-ink/65">Ждем остальных игроков.</p>
                </Card>
              )
            }

            return (
              <VoteCard
                key={proposal.id}
                proposal={proposalForCard}
                voterRole={roleMetadata?.role}
                voterRoleMetadata={roleMetadata}
                onSubmit={(score, weight) => handleSubmitVote(proposal.id, score, weight)}
              />
            )
          })}

        <Leaderboard members={members} currentUserId={userId} />

        <ProposalHistory tripId={tripId} userId={userId} roleMetadata={roleMetadata} />
      </div>

      {tripStatus === 'active' && (
        <CreateProposalButton
          tripId={tripId}
          userId={userId}
          members={members}
          disabled={proposals.length > 0}
        />
      )}
    </GameShell>
  )
}
