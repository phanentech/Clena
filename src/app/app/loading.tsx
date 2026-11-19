export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-line" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-line/70" />)}
      </div>
      <div className="h-72 rounded-2xl bg-line/60" />
    </div>
  );
}
