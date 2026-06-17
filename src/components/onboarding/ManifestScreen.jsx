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
      <h2 className="text-xl font-bold">Манифест Le Grand Суда</h2>
      <ul className="mt-4 space-y-2 text-sm text-gray-600">
        {RULES.map((rule) => (
          <li key={rule}>⚖️ {rule}</li>
        ))}
      </ul>
      <Button variant="primary" className="mt-6 w-full" onClick={onReady}>
        Я готов
      </Button>
    </Card>
  )
}
