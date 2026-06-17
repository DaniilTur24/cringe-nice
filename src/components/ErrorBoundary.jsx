import { Component } from 'react'
import Card from './Card'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-cream px-4 py-10">
          <div className="mx-auto max-w-md">
            <Card className="text-center">
              <p className="font-extrabold">Зал суда не открылся</p>
              <p className="mt-2 text-sm text-gray-600">{this.state.error.message}</p>
              <p className="mt-2 text-xs text-gray-400">
                Проверь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env
              </p>
            </Card>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
