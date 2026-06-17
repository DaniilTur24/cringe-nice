export default function BrandHeader({ kicker = 'Paris Party Court' }) {
  return (
    <header className="brand-plaque px-8 py-4 text-center">
      <div className="flag-ribbon mx-auto mb-3 max-w-28" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-wine">
        {kicker}
      </p>
      <h1 className="mt-1 text-3xl font-black uppercase leading-none tracking-normal text-ink sm:text-4xl">
        Le Grand Суд
      </h1>
    </header>
  )
}
