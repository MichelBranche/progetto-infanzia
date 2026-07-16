import type { CSSProperties, ReactNode } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
  delayMs?: number;
};

/** Blocco base con shimmer (usa `.shimmer` da index.css). */
export function Skeleton({ className = "", style, delayMs }: SkeletonProps) {
  return (
    <div
      className={`shimmer ${className}`}
      style={
        delayMs != null
          ? { ...style, animationDelay: `${delayMs}ms` }
          : style
      }
      aria-hidden
    />
  );
}

export function PosterSkeleton({
  className = "",
  delayMs,
}: {
  className?: string;
  delayMs?: number;
}) {
  return (
    <Skeleton
      className={`aspect-[2/3] rounded-2xl ${className}`}
      delayMs={delayMs}
    />
  );
}

/** Riga orizzontale stile homepage (titolo + poster). */
export function RowSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <section className="page-px py-5" aria-busy="true" aria-label="Caricamento">
      <div className="mb-5 flex items-baseline gap-4">
        <Skeleton className="h-3 w-6 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 rounded-md" />
          <Skeleton className="h-3 w-32 rounded" />
        </div>
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: cards }).map((_, i) => (
          <PosterSkeleton
            key={i}
            className="w-[var(--card-collapsed)] shrink-0 rounded-md"
            delayMs={i * 80}
          />
        ))}
      </div>
    </section>
  );
}

/** Griglia discovery (Film / Serie / Anime / Manga). */
export function BrowseGridSkeleton({
  count = 18,
  withHeader = true,
  className = "",
}: {
  count?: number;
  withHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`page-px pb-16 pt-6 ${className}`}
      aria-busy="true"
      aria-label="Caricamento catalogo"
    >
      {withHeader && (
        <div className="lf-discovery-header lf-discovery-header--browse">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="mt-3 h-4 w-64 rounded" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" delayMs={i * 60} />
            ))}
          </div>
        </div>
      )}
      <div className="lf-discovery-grid lf-discovery-grid--browse mt-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <PosterSkeleton delayMs={i * 40} />
            <Skeleton className="h-3 w-[80%] rounded" />
            <Skeleton className="h-2.5 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Viewport hero (shimmer) mentre arrivano i titoli in evidenza. */
export function HeroSkeleton() {
  return (
    <div
      className="relative h-[100svh] min-h-[560px] overflow-hidden shimmer-bg"
      aria-busy="true"
      aria-label="Caricamento in evidenza"
    >
      <div className="absolute inset-x-0 bottom-0 page-px pb-16 pt-32">
        <Skeleton className="h-10 w-[min(70%,28rem)] rounded-lg bg-white/10" />
        <Skeleton className="mt-4 h-4 w-[min(50%,20rem)] rounded bg-white/10" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-11 w-36 rounded-lg bg-white/10" />
          <Skeleton className="h-11 w-28 rounded-lg bg-white/10" />
        </div>
      </div>
    </div>
  );
}

/** Homepage: hero + alcune righe. */
export function HomePageSkeleton() {
  return (
    <div className="pb-16" aria-busy="true" aria-label="Caricamento home">
      <HeroSkeleton />
      <RowSkeleton />
      <RowSkeleton />
      <RowSkeleton />
    </div>
  );
}

/** Lista verticale (libri, chat, impostazioni, attività). */
export function ListSkeleton({
  rows = 6,
  variant = "card",
}: {
  rows?: number;
  variant?: "card" | "line" | "chat";
}) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
      {Array.from({ length: rows }).map((_, i) => {
        if (variant === "line") {
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-[66%] rounded" delayMs={i * 50} />
                <Skeleton className="h-3 w-[33%] rounded" delayMs={i * 50 + 30} />
              </div>
              <Skeleton className="h-3 w-16 shrink-0 rounded" />
            </div>
          );
        }
        if (variant === "chat") {
          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            >
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" delayMs={i * 50} />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            </div>
          );
        }
        return (
          <div
            key={i}
            className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <PosterSkeleton
              className="w-16 shrink-0 rounded-lg"
              delayMs={i * 50}
            />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-[60%] rounded" />
              <Skeleton className="h-3 w-[40%] rounded" />
              <Skeleton className="h-3 w-[80%] rounded" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Dettaglio titolo / episodi. */
export function DetailSkeleton() {
  return (
    <div
      className="page-px pb-16 pt-8"
      aria-busy="true"
      aria-label="Caricamento dettaglio"
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <PosterSkeleton className="w-full max-w-[220px] shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-9 w-[66%] rounded-lg" />
          <Skeleton className="h-4 w-[33%] rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-[85%] rounded" />
          <Skeleton className="h-3 w-[80%] rounded" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="mt-10 space-y-3">
        <Skeleton className="h-5 w-40 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="aspect-video w-36 shrink-0 rounded-lg" delayMs={i * 60} />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-3.5 w-1/2 rounded" />
              <Skeleton className="h-3 w-[75%] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Risultati ricerca. */
export function SearchResultsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="page-px py-6" aria-busy="true" aria-label="Ricerca in corso">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-4 w-36 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <PosterSkeleton delayMs={i * 50} />
            <Skeleton className="h-3 w-[80%] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Impostazioni: sezioni a card. */
export function SettingsSkeleton() {
  return (
    <div
      className="page-px relative pb-24 pt-[calc(var(--app-nav-height)+1.25rem)]"
      aria-busy="true"
      aria-label="Caricamento impostazioni"
    >
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
          >
            <Skeleton className="h-4 w-32 rounded" delayMs={i * 40} />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonBlock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} aria-busy="true">
      {children}
    </div>
  );
}
