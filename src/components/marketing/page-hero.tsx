export function PageHero({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <section className="relative overflow-hidden bg-navy-900 pb-20 pt-36 text-white">
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-0 h-96 w-[700px] rounded-[50%] bg-teal-500/20 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {eyebrow && <p className="text-sm font-semibold text-brand-400">{eyebrow}</p>}
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        {description && <p className="mt-5 max-w-2xl text-lg text-white/70">{description}</p>}
      </div>
    </section>
  );
}
