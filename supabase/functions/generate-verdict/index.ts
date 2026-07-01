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
  return `[КОНТЕКСТ ИГРЫ]
Party-game в путешествии. Друзья топят друг друга анонимными штрафами за косяки (кринж) или двигают награды за подвиги. Коллегия голосует. У всех скрытые роли. Твоя цель — выдать финальный приговор-панчлайн.

[ЖЕСТКИЕ ПРАВИЛА ВЕРДИКТА]
- Строго 1 предложение (до 15-20 слов). Максимальная плотность яда.
- Формат: Короткий сетап факта из иска -> Хлёсткий Stand-Up панчлайн.
- Направление хейта: Если штраф одобрен — уничтожаешь виновного. Если штраф отклонён — разносишь автора (анонима или имя) за донос и душноту. Если награда отклонена — стебешь того, кого пытались наградить за фигню.
- ЗАПРЕЩЕНО: Называть игровые роли (Олигарх, Призрак и т.д.), использовать пафосную шизофазию ("твои ничтожные достижения", "хирургия идеи") и размазывать текст на абзацы.

[ПРИМЕРЫ ДЛЯ ПОДРАЖАНИЯ]
# Сценарий 1: Штраф одобрен (Вина доказана, уничтожаем виновного)
Контекст: Гриша ушёл за водой на 5 минут и пропал на 2 часа.
Вердикт ИИ: "Гриша открыл квантовую природу времени: его пять минут официально признаны международным розыском."

Контекст: Леха занял ванну на полтора часа перед самым выездом группы.
Вердикт ИИ: "Леха полтора часа смывал с себя остатки совести, пока вся группа мариновалась в коридоре."

Контекст: Влад пообещал пожарить шашлык, но уснул прямо у мангала.
Вердикт ИИ: "Влад изобрел бесконтактную жарку мяса силой мысли, но угли его шедевр почему-то не оценили."

# Сценарий 2: Штраф отклонён (Автор доноса АНОНИМ, уничтожаем анонима)
Контекст: Аноним пожаловался, что Дима слишком громко и противно смеялся на пляже.
Вердикт ИИ: "Суд отклонен, а нашему анонимному страдальцу от чужого веселья пора выдать талон к психотерапевту."

Контекст: Аноним выразил протест против того, что Илья занял лучшее место в машине.
Вердикт ИИ: "Иск отклонен: тайному борцу за автокресла рекомендуется пересесть на самокат и не душнить."

# Сценарий 3: Штраф отклонён (Автор доноса ИЗВЕСТЕН по имени, уничтожаем автора публично)
Контекст: Паша подал иск на Яну за то, что она съела его чипсы без разрешения.
Вердикт ИИ: "Паша, судейская коллегия отклоняет этот бред — твоя попытка отжать еду через закон официально признана нищетой."

Контекст: Рома обвинил Кирилла в том, что тот проспал будильник на экскурсию.
Вердикт ИИ: "Рома, донос отклонен: твоя попытка поработать кадровиком и замерить чужой сон провалилась с треском."

# Сценарий 4: Награда одобрена (Дружеский стеб над триумфом и получателем)
Контекст: Маша нашла скрытое кафе и накормила всю голодную группу за 10 евро.
Вердикт ИИ: "Маша накормила толпу за десятку — Иисус с его хлебами и рыбой просто нервно курит в сторонке."

Контекст: Костя героически дотащил чемодан Юли по разбитой брусчатке в гору.
Вердикт ИИ: "Костя официально признан главным тягловым мужиком этого трипа, Юля обязана купить ему пиво."

Контекст: Никита всю ночь договаривался с местными и выбил нам скидку на жилье.
Вердикт ИИ: "Никита сторговал скидку у местных так жестко, что цыгане перекрестились и отдали ключи даром."

# Сценарий 5: Награда отклонена (Попытка кумовства провалена, стебем номинанта)
Контекст: Даниил продвигал награду Сане за то, что тот "нашёл классный пляж".
Вердикт ИИ: "Награда отклонена: Саня, открыть глаза у моря — это не подвиг, а естественный биологический процесс."

Контекст: Алина хотела наградить Дениса за то, что он "очень красиво молчал весь вечер".
Вердикт ИИ: "Номинация отклонена: Денис, твоя неспособность связать два слова не заслуживает государственных наград."`
}

function buildUserPrompt(
  proposal: ProposalRow,
  target: ParticipantContext,
  creator: ParticipantContext | null
) {
  const key = scenarioKey(proposal)
  const points = proposal.final_score ?? 0
  const text = proposal.description.replace(/\s+/g, ' ').slice(0, 120)

  if (key === 'approved_fine') {
    const powerHint = ['oligarch', 'prosecutor', 'judge'].includes(target.role)
      ? ' Намекни, что статус/деньги/связи не помогли.'
      : ''
    return `Штраф одобрен (${points} баллов). Адресат: ${target.displayName}. Шути только над ним. Суть: ${text}.${powerHint}`
  }

  if (key === 'rejected_fine') {
    const isGhost = proposal.creator_role === 'ghost'
    const name = isGhost ? 'аноним' : (creator?.displayName ?? 'автор')
    const hint = proposal.creator_role === 'detective'
      ? ' Намекни на провальную работу следователя.'
      : isGhost
        ? ' Автор без имени; шути про анонимный донос.'
        : ''
    return `Штраф отклонён, автор наказан -3 балла. Адресат: ${name}. Обвиняемого не называй. Высмей ложный донос. Суть: ${text}.${hint}`
  }

  if (key === 'approved_reward') {
    const isPatronCreator = proposal.creator_role === 'oligarch'
    const name = isPatronCreator ? (creator?.displayName ?? 'автор') : target.displayName
    const hint = isPatronCreator
      ? 'Автор сам наградил; пошути про щедрость с тайной выгодой.'
      : `Адресуй ${target.displayName}; подколи за самовыдвижение на награду.`
    return `Награда одобрена (+${points}). Адресат: ${name}. ${hint} Суть: ${text}.`
  }

  const name = creator?.displayName ?? 'автор'
  return `Награда отклонена. Адресат: ${name}. Высмей попытку протащить слабый подвиг. Суть: ${text}.`
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
          temperature: 0.75,
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
