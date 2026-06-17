import Onboarding from './Onboarding'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <Onboarding />
    </ErrorBoundary>
  )
}

export default App
