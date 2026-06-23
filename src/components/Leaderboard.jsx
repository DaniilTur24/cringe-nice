import { motion } from 'framer-motion'
import Card from './Card'
import { avatarLabel } from '../lib/avatars'

export default function Leaderboard({ members, currentUserId }) {
  if (members.length === 0) return null

  // Sorts defensively rather than trusting callers to pass pre-sorted data —
  // crown/fire placement silently breaks otherwise.
  const sorted = [...members].sort((a, b) => b.total_points - a.total_points)

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="panel-label">Scoreboard</span>
          <h2 className="mt-3 text-2xl font-black leading-tight">Таблица лидеров</h2>
        </div>
        <span className="score-chip min-w-10 bg-white px-3 py-2 text-sm">
          {sorted.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {sorted.map((member, index) => {
          const isFirst = index === 0
          const isLast = sorted.length > 1 && index === sorted.length - 1

          return (
            <motion.div
              key={member.id}
              layout
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1rem] border-[3px] border-ink bg-white p-3 shadow-[0_5px_0_#130A22]"
            >
              <span className="avatar-chip">{avatarLabel(member.avatar_url)}</span>
              <span className="min-w-0">
                <span className="block truncate font-black">
                  {member.username}
                  {member.id === currentUserId && (
                    <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-ink/70">
                      Ты
                    </span>
                  )}
                </span>
                {(isFirst || isLast) && (
                  <span className="mt-1 inline-flex rounded-full bg-ink px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-cream">
                    {isFirst ? 'Top seat' : 'Hot seat'}
                  </span>
                )}
              </span>
              <span className="points-chip">
                {member.total_points}
              </span>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}
