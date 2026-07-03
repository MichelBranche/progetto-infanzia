export function RowSkeleton() {
  return (
    <section className="page-px py-5">
      <div className="mb-5 flex items-baseline gap-4">
        <div className="h-3 w-6 shimmer rounded" />
        <div className="space-y-2">
          <div className="h-6 w-48 shimmer rounded-md" />
          <div className="h-3 w-32 shimmer rounded" />
        </div>
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[2/3] w-[var(--card-collapsed)] shrink-0 shimmer rounded-md"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </section>
  );
}
