import { HeartHandshake } from "lucide-react";

export function DonorBadge({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        title="Donatore Branchefy"
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/35 bg-amber-400/15 text-amber-200 ${className}`}
      >
        <HeartHandshake className="h-3 w-3" aria-hidden />
        <span className="sr-only">Donatore</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-300/35 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200 ${className}`}
    >
      <HeartHandshake className="h-3 w-3" aria-hidden />
      Donatore
    </span>
  );
}
