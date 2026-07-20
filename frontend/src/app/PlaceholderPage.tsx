interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="rounded-lg border border-line bg-panel p-6 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">MVP workspace</p>
      <h2 className="mt-3 text-2xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}
