export default function GameShell({ children, topRight }) {
  return (
    <div className="game-shell min-h-screen overflow-hidden px-4 py-6 text-ink sm:py-10">
      <div className="stage-lights" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="paris-pattern" aria-hidden="true" />
      {topRight && <div className="fixed right-4 top-4 z-50">{topRight}</div>}
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col">
        {children}
      </div>
    </div>
  )
}
