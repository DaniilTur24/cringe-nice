import { useState } from 'react'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'

export default function OtpScreen({ email, onSubmit, onResend, onBack }) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) return
    setSubmitting(true)
    await onSubmit(code)
    setSubmitting(false)
  }

  async function handleResend() {
    setResending(true)
    await onResend()
    setResending(false)
  }

  return (
    <Card>
      <h2 className="text-xl font-bold">Введи код</h2>
      <p className="mt-1 text-sm text-gray-600">
        Мы отправили 6-значный код на <span className="font-bold">{email}</span>.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="text-center text-2xl tracking-[0.5em]"
        />
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={submitting || code.length !== 6}
        >
          {submitting ? 'Проверяем...' : 'Войти'}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm font-bold text-gray-600">
        <button type="button" onClick={onBack} className="underline">
          Другой email
        </button>
        <button type="button" onClick={handleResend} disabled={resending} className="underline">
          {resending ? 'Отправляем...' : 'Прислать код снова'}
        </button>
      </div>
    </Card>
  )
}
