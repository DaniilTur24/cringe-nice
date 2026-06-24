import { useState } from 'react'
import { avatarLabel } from '../lib/avatars'

export default function ProfileMenu({ profile, email, onLogout }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Профиль"
        className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-ink bg-white text-sm font-black text-ink shadow-neo-sm"
      >
        {avatarLabel(profile?.avatar_url)}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть меню профиля"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-14 z-50 w-56 rounded-[1.1rem] border-[3px] border-ink bg-cream p-4 shadow-neo">
            <p className="truncate font-black">{email}</p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-3 w-full rounded-[0.85rem] border-[3px] border-ink bg-juicy-red px-3 py-2 text-sm font-black uppercase tracking-wide text-white shadow-neo-sm"
            >
              Выйти
            </button>
          </div>
        </>
      )}
    </div>
  )
}
