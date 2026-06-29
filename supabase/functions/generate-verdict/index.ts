import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ProposalType = 'fine' | 'reward'
type ProposalStatus = 'pending' | 'approved' | 'rejected'

type ProfileLink = { username: string | null } | Array<{ username: string | null }> | null

type ProposalRow = {
  id: string
  trip_id: string
  creator_id: string
  target_id: string
  type: ProposalType
  docket_number: number | null
  description: string
  status: ProposalStatus
  final_score: number | null
  ai_verdict: string | null
  creator_role: string | null
  creator_revealed_to_all: boolean
  creator: ProfileLink
  target: ProfileLink
}

type ParticipantContext = {
  displayName: string
  role: string
}

const ROLE_LABELS: Record<string, string> = {
  oligarch: 'Олигарх',
  prosecutor: 'Прокурор',
  judge: 'Судья',
  detective: 'Детектив',
  ghost: 'Призрак',
  civilian: 'Обычный смертный',
}

function profileName(profile: ProfileLink, fallbackName: string) {
  const row = Array.isArray(profile) ? profile[0] : profile
  return row?.username || fallbackName
}

async function loadParticipantContext(
  supabase: ReturnType<typeof createClient>,
  tripId: string,
  userId: string,
  fallbackName: string,
  fallbackRole = 'civilian'
): Promise<ParticipantContext> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('nickname, role_metadata, profiles(username)')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  const profile = Array.isArray(data?.profiles) ? data?.profiles[0] : data?.profiles
  return {
    displayName: data?.nickname || profile?.username || fallbackName,
    role: data?.role_metadata?.role || fallbackRole || 'civilian',
  }
}

function docketTitle(proposal: ProposalRow) {
  const number = proposal.docket_number ?? '?'
  return proposal.type === 'fine' ? `Уголовное дело №${number}` : `Акт святости №${number}`
}

function roleLabel(role: string | null | undefined) {
  if (!role) return null
  return ROLE_LABELS[role] ?? role
}

function cleanVerdict(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^["'«\s]+|["'»\s]+$/g, '')
    .trim()
    .slice(0, 280)
}

function scenarioKey(proposal: ProposalRow) {
  if (proposal.type === 'fine' && proposal.status === 'approved') return 'approved_fine'
  if (proposal.type === 'fine' && proposal.status === 'rejected') return 'rejected_fine'
  if (proposal.type === 'reward' && proposal.status === 'approved') return 'approved_reward'
  return 'rejected_reward'
}

function fallbackVerdict(
  proposal: ProposalRow,
  target: ParticipantContext,
  creator: ParticipantContext | null
) {
  const docket = docketTitle(proposal)
  const points = proposal.final_score ?? 0

  if (proposal.type === 'fine' && proposal.status === 'approved') {
    return `${docket}: ${target.displayName} получает ${points} баллов позора. Суд постановил: кринж был не случайностью, а образом жизни.`
  }

  if (proposal.type === 'fine' && proposal.status === 'rejected') {
    const accuser = proposal.creator_role === 'ghost' ? 'анонимный призрак-неудачник' : creator?.displayName ?? 'автор жалобы'
    return `${docket} развалилось, ${target.displayName} выходит почти святым. А ${accuser} сегодня получает медаль за душный донос.`
  }

  if (proposal.type === 'reward' && proposal.status === 'approved') {
    return `${docket}: ${target.displayName} забирает +${points} и делает вид, что не ждал оваций. Суд хлопает, но с подозрением.`
  }

  return `${docket} не прошёл фейсконтроль: подвиг ${target.displayName} оказался размером с чек из ларька. Автору — минута молчания за кумовство.`
}

function buildSystemPrompt() {
  return [
    'Ты русский стендап-комик-судья для party game.',
    'Ответ: ровно 1 предложение, до 20 слов.',
    'Шути только по факту из описания; не придумывай новые детали.',
    'Назови максимум одного человека: только адресата шутки.',
    'Если адресат = "аноним", имя не выдумывай.',
    'Без списков, кавычек, морали, пафоса и канцелярита.',
    'Избегай шаблонов: "ничтожные достижения", "протокол пахнет", "образ жизни".',
    '- Не используй дискриминацию, реальные угрозы, сексуальный контент или настоящую травлю. Это дружеский roast.',
  ].join('\n')
}

function buildUserPrompt(
  proposal: ProposalRow,
  target: ParticipantContext,
  creator: ParticipantContext | null
) {
  const key = scenarioKey(proposal)
  const points = proposal.final_score ?? 0
  const text = proposal.description.replace(/\s+/g, ' ').slice(0, 180)

  if (key === 'approved_fine') {
    const roleHint = ['oligarch', 'prosecutor', 'judge'].includes(target.role)
      ? ` Роль адресата: ${roleLabel(target.role)}; можно пошутить, что власть не спасла.`
      : ''
    return `Сценарий approved_fine. Адресат: ${target.displayName}. Жалоба одобрена, штраф ${points}. Шути строго над адресатом. Суть: ${text}.${roleHint}`
  }

  if (key === 'rejected_fine') {
    const isGhost = proposal.creator_role === 'ghost'
    const name = isGhost ? 'аноним' : creator?.displayName ?? 'автор'
    const roleHint = proposal.creator_role === 'detective'
      ? ' Автор Детектив; высмей плохую сыщицкую работу.'
      : isGhost
        ? ' Автор Призрак; имени нет, шути про анонимного призрака.'
        : ''
    return `Сценарий rejected_fine. Адресат: ${name}. Жалоба отклонена; обвиняемого не называй. Стеби ложный донос. Суть: ${text}.${roleHint}`
  }

  if (key === 'approved_reward') {
    const isOligarch = proposal.creator_role === 'oligarch'
    const name = isOligarch ? creator?.displayName ?? 'Олигарх' : target.displayName
    const direction = isOligarch
      ? 'Автор Олигарх; адресуй автора и пошути про щедрость ради кэшбэка.'
      : `Адресуй ${target.displayName}; дружески подколи за награду.`
    return `Сценарий approved_reward. Адресат: ${name}. Награда одобрена, +${points}. ${direction} Суть: ${text}.`
  }

  const name = creator?.displayName ?? 'автор'
  return `Сценарий rejected_reward. Адресат: ${name}. Награда отклонена. Стеби попытку протащить слабый подвиг/кумовство. Суть: ${text}.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase service configuration')
    }

    const { proposal_id } = await req.json()
    if (!proposal_id || typeof proposal_id !== 'string') {
      return new Response(JSON.stringify({ error: 'proposal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const authHeader = req.headers.get('Authorization') ?? ''
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '')
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await supabase
      .from('proposals')
      .select(
        `id, trip_id, creator_id, target_id, type, docket_number, description, status, final_score, ai_verdict,
         creator_role, creator_revealed_to_all,
         creator:profiles!proposals_creator_id_fkey(username),
         target:profiles!proposals_target_id_fkey(username)`
      )
      .eq('id', proposal_id)
      .single()

    if (error) throw error

    const proposal = data as ProposalRow

    if (bearerToken && bearerToken !== serviceRoleKey) {
      const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken)
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: membership, error: membershipError } = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', proposal.trip_id)
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (membershipError) throw membershipError
      if (!membership) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (proposal.status === 'pending') {
      return new Response(JSON.stringify({ skipped: true, reason: 'proposal is still pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (proposal.ai_verdict) {
      return new Response(JSON.stringify({ ai_verdict: proposal.ai_verdict }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const target = await loadParticipantContext(
      supabase,
      proposal.trip_id,
      proposal.target_id,
      profileName(proposal.target, 'подсудимый')
    )
    const creator = await loadParticipantContext(
      supabase,
      proposal.trip_id,
      proposal.creator_id,
      profileName(proposal.creator, 'автор'),
      proposal.creator_role ?? 'civilian'
    )
    let aiVerdict = fallbackVerdict(proposal, target, creator)

    if (openaiApiKey) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          instructions: buildSystemPrompt(),
          input: [
            {
              role: 'user',
              content: buildUserPrompt(proposal, target, creator),
            },
          ],
          max_output_tokens: 50,
          temperature: 0.9,
        }),
      })

      if (!response.ok) {
        const details = await response.text()
        console.error('OpenAI request failed:', details)
      } else {
        const result = await response.json()
        const generated =
          result.output_text ??
          result.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
            ?.map((content: { text?: string }) => content.text)
            ?.filter(Boolean)
            ?.join(' ')

        if (generated) aiVerdict = cleanVerdict(generated)
      }
    }

    const { error: updateError } = await supabase
      .from('proposals')
      .update({ ai_verdict: aiVerdict })
      .eq('id', proposal.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ ai_verdict: aiVerdict }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
