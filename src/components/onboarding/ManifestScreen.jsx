import Card from '../Card'
import Button from '../Button'

const RULES = [
  'Опоздал, сказал глупость или подвёл компанию — получи жалобу.',
  'Сделал что-то невероятное — получи награду.',
  'Голосуют все, кроме обвинителя и обвиняемого.',
  'Большинство решает: штраф или награда либо засчитывается, либо сгорает.',
]

export default function ManifestScreen({ onReady }) {
  return (
    <Card>
      <span className="panel-label">House rules</span>
      <h2 className="mt-4 text-2xl font-black leading-tight">Манифест Le Grand Суда</h2>
      <ul className="mt-4 space-y-3 text-sm font-bold text-ink/70">
        {RULES.map((rule, index) => (
          <li key={rule} className="flex gap-3 rounded-[1rem] border-2 border-ink bg-white/75 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-gold text-xs font-black text-ink">
              {index + 1}
            </span>
            <span>{rule}</span>
          </li>
        ))}
      </ul>
      <Button variant="gold" className="mt-6 w-full" onClick={onReady}>
        Я готов
      </Button>
    </Card>
  )
}
