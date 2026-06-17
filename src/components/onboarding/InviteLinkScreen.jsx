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
      <h2 className="text-xl font-bold">Поездка создана!</h2>
      <p className="mt-2 text-sm text-gray-600">
        Отправь эту ссылку друзьям, чтобы они присоединились:
      </p>
      <div className="mt-4 break-all rounded-2xl border-2 border-black bg-cream p-3 text-sm font-bold">
        {inviteUrl}
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={handleCopy}>
        {copied ? 'Скопировано!' : 'Скопировать ссылку'}
      </Button>
      <Button variant="primary" className="mt-3 w-full" onClick={onContinue}>
        Войти в зал суда
      </Button>
    </Card>
  )
}
