import { useState } from 'react'
import Card from '../Card'
import Button from '../Button'

export default function InviteLinkScreen({ inviteUrl, onContinue }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="text-center">
      <span className="panel-label">Invite desk</span>
      <h2 className="mt-4 text-2xl font-black leading-tight">Поездка создана!</h2>
      <p className="mt-2 text-sm font-bold text-ink/65">
        Отправь эту ссылку друзьям, чтобы они присоединились:
      </p>
      <div className="mt-4 break-all rounded-[1rem] border-[3px] border-ink bg-white p-3 text-sm font-extrabold shadow-[inset_0_-4px_0_rgba(19,10,34,0.08)]">
        {inviteUrl}
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={handleCopy}>
        {copied ? 'Скопировано!' : 'Скопировать ссылку'}
      </Button>
      <Button variant="gold" className="mt-3 w-full" onClick={onContinue}>
        Войти в зал суда
      </Button>
    </Card>
  )
}
