import Card from './Card'
import { ROLE_REFERENCE } from '../lib/roles'

const COURT_CODE = [
  {
    title: 'Статья 1. Инициирование Дела',
    body:
      'Каждый участник имеет право подать Иск за проявление кринжа или выписать Номинацию за особые заслуги перед коллективом.',
  },
  {
    title: 'Статья 2. Голосование Коллегии',
    body:
      'После публикации дела открываются независимые слушания. Коллегия присяжных выносит вердикт в реальном времени. Обвиняемый и Истец автоматически отстраняются от голосования для исключения конфликта интересов.',
  },
  {
    title: 'Статья 3. Вынесение Вердикта',
    body:
      'Оправдание даёт 0 баллов, если более половины коллегии голосует за отклонение. При одобрении итоговый балл считается как среднее значение по шкале от -1 до -10 для Штрафов или от +1 до +10 для Наград и мгновенно влияет на лидерборд.',
  },
  {
    title: 'Статья 4. Гарантия Конфиденциальности и Залог',
    body:
      'Личность автора Иска строго засекречена на время голосования. Ложный или неодобренный донос карается штрафом в 3 балла и принудительным раскрытием имени автора. Одобренные иски остаются анонимными навсегда.',
  },
  {
    title: 'Статья 5. Ротационный Регламент',
    body:
      'Каждые 24 часа текущие полномочия аннулируются. Система обязывает каждого участника пройти ежедневный перепризыв, крутить рулетку и получить новую Скрытую Роль с полным обновлением лимитов на сутки.',
  },
]

export function GameRulesContent({ showRoles = false }) {
  return (
    <div className="space-y-4 text-left">
      <section className="rounded-[1rem] border-[3px] border-ink bg-white/80 p-4 shadow-neo-sm">
        <span className="panel-label">Свод общих правил</span>
        <h2 className="mt-3 text-2xl font-black leading-tight">
          Кодекс судопроизводства «Le Grand Суд»
        </h2>
        <p className="mt-3 text-sm font-bold leading-relaxed text-ink/70">
          Добро пожаловать в высшую инстанцию юмора и справедливости нашей компании.
          Перед началом процесса ознакомьтесь с базовыми статьями регламента.
        </p>
        <div className="mt-4 grid gap-3">
          {COURT_CODE.map((item) => (
            <RuleItem key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      {showRoles && (
        <section className="rounded-[1rem] border-[3px] border-ink bg-cream p-4 shadow-neo-sm">
          <span className="panel-label">Реестр особых статусов</span>
          <div className="mt-4 grid gap-3">
            {ROLE_REFERENCE.map(({ role, title, description, specialPerk, limit }) => (
              <article key={role} className="rounded-[0.9rem] border-2 border-ink bg-white/80 p-3">
                <h3 className="text-base font-black leading-tight">{title}</h3>
                <p className="mt-1 text-sm font-bold leading-relaxed text-ink/70">{description}</p>
                <RoleFact label="Особый перк" value={specialPerk} />
                <RoleFact label="Лимит" value={limit} />
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RuleItem({ title, body }) {
  return (
    <article className="rounded-[0.9rem] border-2 border-ink bg-cream/80 p-3">
      <h3 className="font-black leading-tight">{title}</h3>
      <p className="mt-1 text-sm font-bold text-ink/65">{body}</p>
    </article>
  )
}

function RoleFact({ label, value }) {
  return (
    <div className="mt-3 rounded-[0.75rem] border-2 border-ink bg-cream/80 p-3">
      <p className="text-[0.68rem] font-black uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-bold leading-relaxed text-ink/75">{value}</p>
    </div>
  )
}

export default function GameRulesCard({ showRoles = false }) {
  return (
    <Card>
      <GameRulesContent showRoles={showRoles} />
    </Card>
  )
}
