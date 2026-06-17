import { motion } from 'framer-motion'
import Card from './Card'

export default function Leaderboard({ members }) {
  if (members.length === 0) return null

  // Sorts defensively rather than trusting callers to pass pre-sorted data —
  // crown/fire placement silently breaks otherwise.
  const sorted = [...members].sort((a, b) => b.total_points - a.total_points)

  return (
    <Card>
      <h2 className="text-xl font-bold">Таблица лидеров</h2>
      <div className="mt-4 space-y-2">
        {sorted.map((member, index) => {
          const isFirst = index === 0
          const isLast = sorted.length > 1 && index === sorted.length - 1

          return (
            <motion.div
              key={member.id}
              layout
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center gap-3 rounded-2xl border-2 border-black bg-white p-3"
            >
              <span className="text-2xl">{member.avatar_url ?? '🙂'}</span>
              <span className="flex-1 truncate font-bold">{member.username}</span>
              {isFirst && <span className="text-xl">👑</span>}
              {isLast && <span className="text-xl">🔥</span>}
              <span className="font-extrabold text-french-blue">{member.total_points}</span>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}
