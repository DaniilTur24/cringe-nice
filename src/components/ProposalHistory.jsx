import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Card from './Card'
import HistoryCard from './HistoryCard'

async function loadHistory(tripId) {
  const baseSelect = `id, type, status, final_score, description, created_at, creator_id, target_id,
       creator_role, creator_revealed_to_all,
       creator:profiles!proposals_creator_id_fkey(username),
       target:profiles!proposals_target_id_fkey(username),
       votes(score)`
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, type, docket_number, status, final_score, description, created_at, creator_id, target_id,
       creator_role, creator_revealed_to_all,
       creator:profiles!proposals_creator_id_fkey(username),
       target:profiles!proposals_target_id_fkey(username),
       votes(score)`
    )
    .eq('trip_id', tripId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })

  let rows = data
  if (error) {
    const isMissingDocketNumber =
      error.message?.includes('docket_number') || error.details?.includes('docket_number')
    if (!isMissingDocketNumber) throw error

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('proposals')
      .select(baseSelect)
      .eq('trip_id', tripId)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })

    if (fallbackError) throw fallbackError
    rows = (fallbackData ?? []).map((row) => ({ ...row, docket_number: null }))
  }

  return (rows ?? [])
    .map((row) => ({
      ...row,
      creatorName: row.creator?.username ?? 'Неизвестный',
      targetName: row.target?.username ?? 'Неизвестный',
      votes: row.votes ?? [],
    }))
}

function isCreatorVisible(proposal, selfRevealedIds) {
  if (proposal.creator_role === 'ghost') return false
  if (proposal.type === 'reward') return true
  if (proposal.status === 'rejected') return true
  if (proposal.creator_revealed_to_all) return true
  return selfRevealedIds.has(proposal.id)
}

// roleMetadata приходит проп-ом, а не через свой useTripRole — два хука на
// один и тот же (tripId, userId) создавали realtime-канал с одинаковым
// именем одновременно (этот компонент + Courtroom), и Supabase не позволяет
// повторно навешивать `.on()` на уже подписанный канал с тем же именем.
export default function ProposalHistory({ tripId, userId, roleMetadata, members = [] }) {
  const [proposals, setProposals] = useState([])
  const [selfRevealedIds, setSelfRevealedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // members carries each member's per-trip nickname (see useTripMembers) — a
  // ref so reload() always reads the latest list without re-running on every
  // members change (it's already kept fresh by Courtroom's own subscription).
  const membersByIdRef = useRef(new Map())
  useEffect(() => {
    membersByIdRef.current = new Map(members.map((m) => [m.id, m]))
  }, [members])

  async function reload() {
    try {
      setError(null)
      const [history, revealsResult] = await Promise.all([
        loadHistory(tripId),
        supabase.from('proposal_reveals').select('proposal_id').eq('viewer_id', userId),
      ])
      if (revealsResult.error) throw revealsResult.error
      const named = history.map((p) => ({
        ...p,
        creatorName: membersByIdRef.current.get(p.creator_id)?.username ?? p.creatorName,
        targetName: membersByIdRef.current.get(p.target_id)?.username ?? p.targetName,
      }))
      setProposals(named)
      setSelfRevealedIds(new Set((revealsResult.data ?? []).map((r) => r.proposal_id)))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      await reload()
      if (cancelled) return
    }
    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId])

  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}-history-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposals',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          reload()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId])

  async function handleReveal(proposalId, scope) {
    const { error } = await supabase.rpc('detective_reveal', {
      p_proposal_id: proposalId,
      p_scope: scope,
    })
    if (!error) await reload()
  }

  if (loading) return null

  if (error) {
    return (
      <Card>
        <span className="panel-label">Архив</span>
        <h2 className="mt-3 text-2xl font-black leading-tight">Закрытые дела</h2>
        <p className="mt-3 rounded-[1rem] border-2 border-juicy-red bg-white/75 p-4 text-sm font-bold text-juicy-red">
          История дел не загрузилась: {error.message}
        </p>
      </Card>
    )
  }

  if (proposals.length === 0) {
    return (
      <Card>
        <span className="panel-label">Архив</span>
        <h2 className="mt-3 text-2xl font-black leading-tight">Закрытые дела</h2>
        <p className="mt-3 text-sm font-bold text-ink/65">Пока нет закрытых дел.</p>
      </Card>
    )
  }

  const isDetective = roleMetadata?.role === 'detective'
  const revealsRemaining = roleMetadata?.reveals_remaining ?? 0

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="panel-label">Архив</span>
          <h2 className="mt-3 text-2xl font-black leading-tight">Закрытые дела</h2>
        </div>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((value) => !value)}
          className="rounded-full border-[3px] border-ink bg-white px-3 py-2 text-xs font-black uppercase leading-none text-ink shadow-neo-sm transition hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
        >
          {isExpanded ? 'Свернуть' : `Показать ${proposals.length}`}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3">
          {proposals.map((proposal) => {
            const visible = isCreatorVisible(proposal, selfRevealedIds)
            const selfRevealedByMe = selfRevealedIds.has(proposal.id)
            const isEligibleFine = proposal.type === 'fine' && proposal.status === 'approved'
            const isOwnProposal = proposal.creator_id === userId
            const isGhost = proposal.creator_role === 'ghost'
            const canRevealSelf = isDetective && isEligibleFine && revealsRemaining > 0 && !visible && !isOwnProposal && !isGhost
            const canRevealAll =
              isDetective && isEligibleFine && selfRevealedByMe && !proposal.creator_revealed_to_all && !isOwnProposal && !isGhost

            return (
              <HistoryCard
                key={proposal.id}
                proposal={proposal}
                creatorName={visible ? proposal.creatorName : 'Аноним'}
                canRevealSelf={canRevealSelf}
                canRevealAll={canRevealAll}
                onReveal={(scope) => handleReveal(proposal.id, scope)}
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}
