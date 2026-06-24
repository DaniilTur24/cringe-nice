import Onboarding from './Onboarding'
import ErrorBoundary from './components/ErrorBoundary'
import BackgroundMusic from './components/BackgroundMusic'

function App() {
  return (
    <>
      <BackgroundMusic />
      <ErrorBoundary>
        <Onboarding />
      </ErrorBoundary>
    </>
  )
}

export default App
