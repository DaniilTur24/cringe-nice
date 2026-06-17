export default function GameShell({ children }) {
  return (
    <div className="game-shell min-h-screen overflow-hidden px-4 py-6 text-ink sm:py-10">
      <div className="stage-lights" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="paris-pattern" aria-hidden="true" />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col">
        {children}
      </div>
    </div>
  )
}
