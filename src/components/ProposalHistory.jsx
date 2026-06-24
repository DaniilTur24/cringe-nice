import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Card from './Card'
import HistoryCard from './HistoryCard'

async function loadHistory(tripId) {
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, type, status, final_score, creator_id, target_id, creator_role, creator_revealed_to_all,
       creator:profiles!proposals_creator_id_fkey(username),
       target:profiles!proposals_target_id_fkey(username)`
    )
    .eq('trip_id', tripId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error

  // Призрак полностью исключён из истории — для него записи как будто не
  // существует, раскрыть нечего.
  return (data ?? [])
    .filter((row) => !(row.type === 'fine' && row.creator_role === 'ghost'))
    .map((row) => ({
      ...row,
      creatorName: row.creator?.username ?? 'Неизвестный',
      targetName: row.target?.username ?? 'Неизвестный',
    }))
}

function isCreatorVisible(proposal, viewerId, selfRevealedIds) {
  if (proposal.type === 'reward') return true
  if (proposal.status === 'rejected') return true
  if (proposal.creator_id === viewerId) return true
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

  // members carries each member's per-trip nickname (see useTripMembers) — a
  // ref so reload() always reads the latest list without re-running on every
  // members change (it's already kept fresh by Courtroom's own subscription).
  const membersByIdRef = useRef(new Map())
  useEffect(() => {
    membersByIdRef.current = new Map(members.map((m) => [m.id, m]))
  }, [members])

  async function reload() {
    try {
      const [history, { data: reveals }] = await Promise.all([
        loadHistory(tripId),
        supabase.from('proposal_reveals').select('proposal_id').eq('viewer_id', userId),
      ])
      const named = history.map((p) => ({
        ...p,
        creatorName: membersByIdRef.current.get(p.creator_id)?.username ?? p.creatorName,
        targetName: membersByIdRef.current.get(p.target_id)?.username ?? p.targetName,
      }))
      setProposals(named)
      setSelfRevealedIds(new Set((reveals ?? []).map((r) => r.proposal_id)))
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

  // Без этого новые закрытые дела (и чужие разоблачения "всем") появлялись
  // в архиве только после перезагрузки страницы.
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

  if (loading || proposals.length === 0) return null

  const isDetective = roleMetadata?.role === 'detective'
  const revealsRemaining = roleMetadata?.reveals_remaining ?? 0

  return (
    <Card>
      <span className="panel-label">Архив</span>
      <h2 className="mt-3 text-2xl font-black leading-tight">Закрытые дела</h2>

      <div className="mt-4 space-y-3">
        {proposals.map((proposal) => {
          const visible = isCreatorVisible(proposal, userId, selfRevealedIds)
          const selfRevealedByMe = selfRevealedIds.has(proposal.id)
          const isEligibleFine = proposal.type === 'fine' && proposal.status === 'approved'

          // Сначала "только себе" (тратит заряд) — "всем" появляется только
          // после того, как этот же детектив уже узнал автора сам.
          const canRevealSelf = isDetective && isEligibleFine && revealsRemaining > 0 && !visible
          const canRevealAll =
            isDetective && isEligibleFine && selfRevealedByMe && !proposal.creator_revealed_to_all

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
    </Card>
  )
}
