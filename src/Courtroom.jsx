import { useEffect, useMemo, useRef, useState } from 'react'
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
import RulesModal from './components/RulesModal'

async function loadProposalDetails(proposalId) {
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, trip_id, creator_id, target_id, type, docket_number, description, status, final_score, ai_verdict, created_at,
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
  const docketTitle = proposalDocketTitle(proposal)

  if (status === 'approved') {
    const points = finalScore ?? 0
    let message = proposal.type === 'fine'
      ? `${docketTitle} одобрено! ${proposal.targetName} получает ${points} баллов.`
      : `${docketTitle} одобрен! ${proposal.targetName} получает ${points} баллов.`
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
    return `${docketTitle} отклонено. ${proposal.targetName} оправдан(а)! Автор — Призрак: имя не раскрывается, баллы не списываются.`
  }
  return proposal.type === 'fine'
    ? `${docketTitle} отклонено. ${proposal.targetName} оправдан(а)! Ябеда ${proposal.creatorName} раскрыта и наказана: -3 балла за ложный донос.`
    : `${docketTitle} отклонён.`
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

async function loadResolvedProposalIds(tripId) {
  const { data, error } = await supabase
    .from('proposals')
    .select('id, status, final_score, ai_verdict')
    .eq('trip_id', tripId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data ?? []
}

const MAX_STORED_VERDICT_IDS = 200
const OLIGARCH_REVEAL_INITIAL_REPLAY_MS = 10 * 60 * 1000

function verdictStorageKey(tripId, userId) {
  return `courtroom:shown-verdicts:${tripId}:${userId}`
}

function oligarchRevealStorageKey(tripId, userId) {
  return `courtroom:shown-oligarch-reveals:${tripId}:${userId}`
}

function detectiveRevealStorageKey(tripId, userId) {
  return `courtroom:shown-detective-reveals:${tripId}:${userId}`
}

function readStoredIds(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return { exists: false, ids: new Set() }
    const ids = JSON.parse(raw)
    if (!Array.isArray(ids)) return { exists: false, ids: new Set() }
    return { exists: true, ids: new Set(ids.filter((id) => typeof id === 'string')) }
  } catch {
    return { exists: false, ids: new Set() }
  }
}

function writeStoredIds(storageKey, ids) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids].slice(-MAX_STORED_VERDICT_IDS)))
  } catch {
    // A blocked localStorage should not break the game flow.
  }
}

function readStoredVerdictIds(tripId, userId) {
  return readStoredIds(verdictStorageKey(tripId, userId))
}

function writeStoredVerdictIds(tripId, userId, ids) {
  writeStoredIds(verdictStorageKey(tripId, userId), ids)
}

function readStoredOligarchRevealIds(tripId, userId) {
  return readStoredIds(oligarchRevealStorageKey(tripId, userId))
}

function writeStoredOligarchRevealIds(tripId, userId, ids) {
  writeStoredIds(oligarchRevealStorageKey(tripId, userId), ids)
}

function readStoredDetectiveRevealIds(tripId, userId) {
  return readStoredIds(detectiveRevealStorageKey(tripId, userId))
}

function writeStoredDetectiveRevealIds(tripId, userId, ids) {
  writeStoredIds(detectiveRevealStorageKey(tripId, userId), ids)
}

async function loadOligarchReveals(tripId) {
  const { data, error } = await supabase
    .from('oligarch_reveals')
    .select('id, user_id, amount, revealed_at')
    .eq('trip_id', tripId)
    .order('revealed_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data ?? []
}

async function loadPublicDetectiveReveals(tripId) {
  const { data, error } = await supabase
    .from('proposals')
    .select(
      `id, trip_id, creator_id, target_id, type, docket_number, description, status, final_score, ai_verdict, created_at,
       creator_role, creator_revealed_to_all,
       creator:profiles!proposals_creator_id_fkey(username),
       target:profiles!proposals_target_id_fkey(username)`
    )
    .eq('trip_id', tripId)
    .eq('type', 'fine')
    .eq('creator_revealed_to_all', true)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error

  return (data ?? []).map((row) => ({
    ...row,
    creatorName: row.creator?.username ?? 'Неизвестный',
    targetName: row.target?.username ?? 'Неизвестный',
  }))
}

function proposalCardContent(proposal) {
  const docketTitle = proposalDocketTitle(proposal)
  return {
    type: proposal.type,
    description: proposal.description,
    title:
      proposal.type === 'fine'
        ? `${docketTitle}: жалоба на ${proposal.targetName}`
        : `${docketTitle}: награда для ${proposal.targetName}`,
  }
}

function proposalDocketTitle(proposal) {
  const number = proposal.docket_number ?? '?'
  return proposal.type === 'fine' ? `Уголовное дело №${number}` : `Акт святости №${number}`
}

async function requestAiVerdict(proposalId) {
  const { error } = await supabase.functions.invoke('generate-verdict', {
    body: { proposal_id: proposalId },
  })
  if (error) throw error
}

export default function Courtroom({ tripId, userId, tripStatus = 'active', profileMenu, onExit }) {
  const [loading, setLoading] = useState(true)
  // Every still-open proposal stays in this list at once, so two complaints
  // or rewards filed back to back both stay visible instead of the newer
  // one replacing the older.
  const [proposals, setProposals] = useState([])
  const [verdictQueue, setVerdictQueue] = useState([])
  const [toast, setToast] = useState(null)
  const [dismissedMembersError, setDismissedMembersError] = useState(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const { members, error: membersError } = useTripMembers(tripId)
  const { roleMetadata } = useTripRole(tripId, userId)
  const hasStoredVerdictStateRef = useRef(false)
  const hasStoredOligarchRevealStateRef = useRef(false)
  const hasStoredDetectiveRevealStateRef = useRef(false)

  // members carries each member's per-trip nickname already (see
  // useTripMembers) — used to relabel proposal creator/target names so the
  // in-game name matches the leaderboard instead of the official profile name.
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const membersByIdRef = useRef(membersById)
  useEffect(() => {
    membersByIdRef.current = membersById
  }, [membersById])

  // `map` defaults to the render-time Map; the realtime channel below lives
  // outside render and passes membersByIdRef.current instead, since reading
  // a ref's value during render is disallowed.
  function withTripNames(proposal, map = membersById) {
    return {
      ...proposal,
      creatorName: map.get(proposal.creator_id)?.username ?? proposal.creatorName,
      targetName: map.get(proposal.target_id)?.username ?? proposal.targetName,
    }
  }

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
  const shownVerdictIdsRef = useRef(new Set())
  const shownOligarchRevealIdsRef = useRef(new Set())
  const shownDetectiveRevealIdsRef = useRef(new Set())
  useEffect(() => {
    proposalsRef.current = proposals
  }, [proposals])

  useEffect(() => {
    const stored = readStoredVerdictIds(tripId, userId)
    shownVerdictIdsRef.current = stored.ids
    hasStoredVerdictStateRef.current = stored.exists
  }, [tripId, userId])

  useEffect(() => {
    const stored = readStoredOligarchRevealIds(tripId, userId)
    shownOligarchRevealIdsRef.current = stored.ids
    hasStoredOligarchRevealStateRef.current = stored.exists
  }, [tripId, userId])

  useEffect(() => {
    const stored = readStoredDetectiveRevealIds(tripId, userId)
    shownDetectiveRevealIdsRef.current = stored.ids
    hasStoredDetectiveRevealStateRef.current = stored.exists
  }, [tripId, userId])

  function markVerdictShown(proposalId) {
    shownVerdictIdsRef.current.add(proposalId)
    writeStoredVerdictIds(tripId, userId, shownVerdictIdsRef.current)
  }

  function markOligarchRevealShown(revealId) {
    shownOligarchRevealIdsRef.current.add(revealId)
    writeStoredOligarchRevealIds(tripId, userId, shownOligarchRevealIdsRef.current)
  }

  function markDetectiveRevealShown(proposalId) {
    shownDetectiveRevealIdsRef.current.add(proposalId)
    writeStoredDetectiveRevealIds(tripId, userId, shownDetectiveRevealIdsRef.current)
  }

  async function queueVerdict(proposal, status, finalScore) {
    const judgeOverrideScore =
      status === 'approved' ? await loadJudgeOverrideScore(proposal.id).catch(() => null) : null

    setVerdictQueue((prev) => [
      ...prev,
      {
        proposalId: proposal.id,
        message: buildVerdictMessage(
          withTripNames(proposal, membersByIdRef.current),
          status,
          finalScore,
          judgeOverrideScore
        ),
        aiVerdict: proposal.ai_verdict ?? null,
        aiPending: !proposal.ai_verdict,
      },
    ])

    if (!proposal.ai_verdict) {
      requestAiVerdict(proposal.id).catch((err) => {
        console.warn('AI verdict generation failed:', err)
        setVerdictQueue((prev) =>
          prev.map((verdict) =>
            verdict.proposalId === proposal.id ? { ...verdict, aiPending: false } : verdict
          )
        )
      })
    }
  }

  async function queueOligarchReveal(reveal) {
    let username = membersByIdRef.current.get(reveal.user_id)?.username
    if (!username) {
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', reveal.user_id)
        .maybeSingle()
      username = data?.username ?? 'Неизвестный'
    }

    setVerdictQueue((prev) => [
      ...prev,
      {
        message: `${username} получил(а) ${reveal.amount} баллов, потому что был(а) Олигархом и его/её награды принимали.`,
      },
    ])
  }

  function queueDetectiveReveal(proposal) {
    const named = withTripNames(proposal, membersByIdRef.current)
    setVerdictQueue((prev) => [
      ...prev,
      {
        message: `Детектив раскрыл автора: ${proposalDocketTitle(named)} на ${named.targetName} — это ${named.creatorName}!`,
      },
    ])
  }

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

  // If the tab was closed or the user stayed away for a while, realtime
  // events are gone. On return, replay resolved cases that have not already
  // produced a verdict popup in this browser.
  useEffect(() => {
    let cancelled = false

    async function replayMissedVerdicts() {
      try {
        const resolved = await loadResolvedProposalIds(tripId)
        if (cancelled) return

        if (!hasStoredVerdictStateRef.current) {
          const baselineIds = new Set(resolved.map((proposal) => proposal.id))
          shownVerdictIdsRef.current = baselineIds
          hasStoredVerdictStateRef.current = true
          writeStoredVerdictIds(tripId, userId, baselineIds)
          return
        }

        const missed = resolved
          .filter((proposal) => !shownVerdictIdsRef.current.has(proposal.id))
          .reverse()

        for (const proposal of missed) {
          if (cancelled) return
          const details = await loadProposalDetails(proposal.id)
          if (cancelled) return
          await queueVerdict(details, proposal.status, proposal.final_score)
          markVerdictShown(proposal.id)
        }
      } catch (err) {
        if (!cancelled) setToast({ type: 'error', message: err.message })
      }
    }

    replayMissedVerdicts()
    return () => {
      cancelled = true
    }
    // queueVerdict/markVerdictShown read refs and current trip/user values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId])

  useEffect(() => {
    let cancelled = false

    async function replayMissedOligarchReveals() {
      try {
        const reveals = await loadOligarchReveals(tripId)
        if (cancelled) return

        if (!hasStoredOligarchRevealStateRef.current) {
          const now = Date.now()
          const recent = reveals.filter(
            (reveal) => now - new Date(reveal.revealed_at).getTime() <= OLIGARCH_REVEAL_INITIAL_REPLAY_MS
          )
          const baselineIds = new Set(reveals.map((reveal) => reveal.id))
          shownOligarchRevealIdsRef.current = baselineIds
          hasStoredOligarchRevealStateRef.current = true
          writeStoredOligarchRevealIds(tripId, userId, baselineIds)

          for (const reveal of [...recent].reverse()) {
            if (cancelled) return
            await queueOligarchReveal(reveal)
          }
          return
        }

        const missed = reveals
          .filter((reveal) => !shownOligarchRevealIdsRef.current.has(reveal.id))
          .reverse()

        for (const reveal of missed) {
          if (cancelled) return
          await queueOligarchReveal(reveal)
          markOligarchRevealShown(reveal.id)
        }
      } catch (err) {
        if (!cancelled) setToast({ type: 'error', message: err.message })
      }
    }

    replayMissedOligarchReveals()
    return () => {
      cancelled = true
    }
    // queueOligarchReveal/markOligarchRevealShown read refs and current trip/user values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId])

  useEffect(() => {
    let cancelled = false

    async function replayMissedDetectiveReveals() {
      try {
        const reveals = await loadPublicDetectiveReveals(tripId)
        if (cancelled) return

        if (!hasStoredDetectiveRevealStateRef.current) {
          const baselineIds = new Set(reveals.map((proposal) => proposal.id))
          shownDetectiveRevealIdsRef.current = baselineIds
          hasStoredDetectiveRevealStateRef.current = true
          writeStoredDetectiveRevealIds(tripId, userId, baselineIds)
          return
        }

        const missed = reveals
          .filter((proposal) => !shownDetectiveRevealIdsRef.current.has(proposal.id))
          .reverse()

        for (const proposal of missed) {
          if (cancelled) return
          queueDetectiveReveal(proposal)
          markDetectiveRevealShown(proposal.id)
        }
      } catch (err) {
        if (!cancelled) setToast({ type: 'error', message: err.message })
      }
    }

    replayMissedDetectiveReveals()
    return () => {
      cancelled = true
    }
    // queueDetectiveReveal/markDetectiveRevealShown read refs and current trip/user values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        async (payload) => {
          if (payload.new.ai_verdict) {
            setVerdictQueue((prev) =>
              prev.map((verdict) =>
                verdict.proposalId === payload.new.id
                  ? { ...verdict, aiVerdict: payload.new.ai_verdict, aiPending: false }
                  : verdict
              )
            )
          }

          // Детектив раскрыл автора "всем" — это отдельное от смены статуса
          // обновление строки (флаг creator_revealed_to_all меняется только
          // один раз в жизни предложения), так что проверяем его независимо
          // от ветки с вердиктом ниже.
          if (payload.new.creator_revealed_to_all && !shownDetectiveRevealIdsRef.current.has(payload.new.id)) {
            markDetectiveRevealShown(payload.new.id)
            loadProposalDetails(payload.new.id)
              .then((details) => queueDetectiveReveal(details))
              .catch((err) => {
                shownDetectiveRevealIdsRef.current.delete(payload.new.id)
                writeStoredDetectiveRevealIds(tripId, userId, shownDetectiveRevealIdsRef.current)
                setToast({ type: 'error', message: err.message })
              })
          }

          if (payload.new.status === 'pending') return
          if (shownVerdictIdsRef.current.has(payload.new.id)) return
          markVerdictShown(payload.new.id)

          try {
            const current =
              proposalsRef.current.find((p) => p.id === payload.new.id) ??
              (await loadProposalDetails(payload.new.id))
            await queueVerdict(current, payload.new.status, payload.new.final_score)
          } catch (err) {
            shownVerdictIdsRef.current.delete(payload.new.id)
            writeStoredVerdictIds(tripId, userId, shownVerdictIdsRef.current)
            setToast({ type: 'error', message: err.message })
          }
          setProposals((prev) => prev.filter((p) => p.id !== payload.new.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // withTripNames always takes membersByIdRef.current explicitly here, so
    // it doesn't need to be a dep — re-subscribing on every member change
    // would tear down and recreate the realtime channel for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  // Олигарх копит кэшбэк скрыто (role_metadata.pending_cashback, виден
  // только ему) — когда его роль сгорает, assign_trip_role() переливает
  // сумму в total_points и вставляет строку сюда. Без этого попапа скачок
  // чужого счёта на видном месте выглядел бы необъяснимым.
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}-oligarch-reveals`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'oligarch_reveals',
          filter: `trip_id=eq.${tripId}`,
        },
        async (payload) => {
          if (shownOligarchRevealIdsRef.current.has(payload.new.id)) return
          markOligarchRevealShown(payload.new.id)
          try {
            await queueOligarchReveal(payload.new)
          } catch (err) {
            shownOligarchRevealIdsRef.current.delete(payload.new.id)
            writeStoredOligarchRevealIds(tripId, userId, shownOligarchRevealIdsRef.current)
            setToast({ type: 'error', message: err.message })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // queueOligarchReveal/markOligarchRevealShown read refs and current trip/user values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <GameShell topRight={profileMenu}>
      <div className="flex flex-1 flex-col gap-6 pb-24">
        <button
          type="button"
          aria-label="Открыть правила"
          onClick={() => setRulesOpen(true)}
          className="fixed bottom-24 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-ink bg-white text-2xl font-black leading-none text-ink shadow-neo-sm transition hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
        >
          ?
        </button>

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
            const proposalForCard = proposalCardContent(withTripNames(proposal))

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
                  <h2 className="mt-4 text-2xl font-black leading-tight">{proposalForCard.title}</h2>
                  <p className="mt-3 text-xl font-black">Ты уже проголосовал.</p>
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

        <Leaderboard members={members} currentUserId={userId} roleMetadata={roleMetadata} />

        <ProposalHistory tripId={tripId} userId={userId} roleMetadata={roleMetadata} members={members} />
      </div>

      {tripStatus === 'active' && (
        <CreateProposalButton
          tripId={tripId}
          userId={userId}
          members={members}
          disabled={proposals.length > 0}
        />
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </GameShell>
  )
}
